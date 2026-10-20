/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  buildSourceFileTree,
  computePickableSources,
  computeSourceCodeSharingCandidates,
  computeSourceCodeSharingFiles,
  computeSourceCodeSharingStats,
  computeSourceContentsForSharing,
  computeSourcesForThreads,
  computeStackToSource,
} from '../../profile-logic/source-sharing';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';

import type {
  IndexIntoSourceTable,
  SourceCodeAvailability,
  SourceCodeSharingFile,
  SourceCodeStatus,
  FetchedSourceCodeOrigin,
  SourceFileTreeNode,
} from 'firefox-profiler/types';

// A path in the form the symbolication API returns for official builds. Anybody
// who opens the shared profile can download this file from hg.mozilla.org.
const PUBLIC_FILE =
  'hg:hg.mozilla.org/mozilla-central:widget/cocoa/nsAppShell.mm:997f00815e6bc28806b75448c8829f0259d2cb28';
// A path on the machine that recorded the profile.
const LOCAL_FILE = '/home/user/moz/mozilla-central/dom/base/nsGlobalWindow.cpp';

function setup() {
  const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(
    `
      A[file:${LOCAL_FILE}]
      B[file:${PUBLIC_FILE}]
    `
  );
  const { funcTable } = profile.shared;
  const [{ A, B }] = funcNamesDictPerThread;

  const sourceIndexForFunc = (funcIndex: number): IndexIntoSourceTable =>
    ensureExists(
      funcTable.source[funcIndex],
      'Expected the func to have a source'
    );

  return {
    profile,
    candidates: computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    ),
    localSourceIndex: sourceIndexForFunc(A),
    publicSourceIndex: sourceIndexForFunc(B),
  };
}

function filePaths(candidates: Array<{ path: string }>): string[] {
  return candidates.map((candidate) => candidate.path);
}

function availableCode(
  entries: Array<[IndexIntoSourceTable, string]>,
  origin: FetchedSourceCodeOrigin = 'LOCAL'
): Map<IndexIntoSourceTable, SourceCodeStatus> {
  return new Map(
    entries.map(([sourceIndex, code]) => [
      sourceIndex,
      { type: 'AVAILABLE', code, origin },
    ])
  );
}

describe('computeSourceContentsForSharing', function () {
  it('finds the contents already embedded in the profile', function () {
    const { profile, localSourceIndex } = setup();
    profile.shared.sources.content[localSourceIndex] = 'int main() {}';

    expect(computeSourceContentsForSharing(profile, new Map())).toEqual(
      new Map([
        [localSourceIndex, { code: 'int main() {}', origin: 'PROFILE' }],
      ])
    );
  });

  it('finds the source code fetched during this session', function () {
    const { profile, localSourceIndex } = setup();
    const cache = availableCode([[localSourceIndex, 'int main() {}']]);

    expect(computeSourceContentsForSharing(profile, cache)).toEqual(
      new Map([[localSourceIndex, { code: 'int main() {}', origin: 'LOCAL' }]])
    );
  });

  it('ignores sources which are still loading or failed to load', function () {
    const { profile, localSourceIndex } = setup();
    const cache: Map<IndexIntoSourceTable, SourceCodeStatus> = new Map([
      [
        localSourceIndex,
        { type: 'LOADING', source: { type: 'URL', url: 'u' } },
      ],
    ]);

    expect(computeSourceContentsForSharing(profile, cache)).toEqual(new Map());
  });

  it('prefers the contents in the profile over the cached ones', function () {
    const { profile, localSourceIndex } = setup();
    profile.shared.sources.content[localSourceIndex] = 'from the source map';
    const cache = availableCode([[localSourceIndex, 'from the local disk']]);

    expect(computeSourceContentsForSharing(profile, cache)).toEqual(
      new Map([
        [localSourceIndex, { code: 'from the source map', origin: 'PROFILE' }],
      ])
    );
  });
});

describe('computeSourcesForThreads', function () {
  function setupTwoThreads() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(
      `
        A[file:/src/a.cpp]
        B[file:/src/b.cpp]
      `,
      `C[file:/src/c.cpp]`
    );
    const { funcTable } = profile.shared;
    const sourceOf = (funcIndex: number) =>
      ensureExists(funcTable.source[funcIndex]);
    const [{ A, B }, { C }] = funcNamesDictPerThread;
    const contents = new Map([
      [sourceOf(A), 'a'],
      [sourceOf(B), 'b'],
      [sourceOf(C), 'c'],
    ]);
    return {
      profile,
      contents,
      stackToSource: computeStackToSource(profile),
      sourceA: sourceOf(A),
      sourceB: sourceOf(B),
      sourceC: sourceOf(C),
    };
  }

  it('finds the files a thread runs code from, callers included', function () {
    const { profile, contents, stackToSource, sourceA, sourceB } =
      setupTwoThreads();

    // Thread 0's only sample has B as its leaf and A as its caller, so both
    // files count even though only B has self time.
    expect(
      computeSourcesForThreads(
        profile,
        new Set([0]),
        stackToSource,
        new Set(contents.keys())
      )
    ).toEqual(new Set([sourceA, sourceB]));
  });

  it('keeps the threads apart', function () {
    const { profile, contents, stackToSource, sourceC } = setupTwoThreads();

    expect(
      computeSourcesForThreads(
        profile,
        new Set([1]),
        stackToSource,
        new Set(contents.keys())
      )
    ).toEqual(new Set([sourceC]));
  });

  it('leaves out files whose contents we cannot share', function () {
    const { profile, stackToSource, sourceB } = setupTwoThreads();

    expect(
      computeSourcesForThreads(
        profile,
        new Set([0]),
        stackToSource,
        new Set([sourceB])
      )
    ).toEqual(new Set([sourceB]));
  });
});

describe('computeSourceCodeSharingCandidates', function () {
  it('lists every sampled file, and tells which ones anybody can download', function () {
    const { candidates, localSourceIndex, publicSourceIndex } = setup();

    expect(candidates).toEqual([
      {
        sourceIndex: localSourceIndex,
        path: LOCAL_FILE,
        pathSegments: [
          'home',
          'user',
          'moz',
          'mozilla-central',
          'dom',
          'base',
          'nsGlobalWindow.cpp',
        ],
        isPubliclyDownloadable: false,
      },
      {
        sourceIndex: publicSourceIndex,
        path: 'widget/cocoa/nsAppShell.mm',
        pathSegments: ['widget', 'cocoa', 'nsAppShell.mm'],
        isPubliclyDownloadable: true,
      },
    ]);
  });

  it('leaves out files which are never on a sampled stack', function () {
    const { profile } = setup();
    // A source that symbolication knows about but no sampled frame points at.
    const { sources, stringArray } = profile.shared;
    sources.id.push(null);
    sources.filename.push(stringArray.length);
    stringArray.push('/home/user/moz/unsampled.cpp');
    sources.startLine.push(1);
    sources.startColumn.push(1);
    sources.sourceMapURL.push(null);
    sources.content.push('int unused() {}');
    sources.length++;

    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    expect(filePaths(candidates)).not.toContain('/home/user/moz/unsampled.cpp');
  });

  it('orders the files by the time spent in them, most first', function () {
    // C is on the stack for 3 samples, A for 2, and B for 1.
    const { profile } = getProfileFromTextSamples(`
      C[file:/src/c.cpp]  C[file:/src/c.cpp]  C[file:/src/c.cpp]
      A[file:/src/a.cpp]  A[file:/src/a.cpp]  B[file:/src/b.cpp]
    `);

    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    expect(filePaths(candidates)).toEqual([
      '/src/c.cpp',
      '/src/a.cpp',
      '/src/b.cpp',
    ]);
  });

  it('counts recursion through the same file only once', function () {
    // b.cpp is on the stack for 2 samples. a.cpp is on it for 1, twice. If the
    // recursion were counted twice, a.cpp would tie with b.cpp and win the tie
    // on its path.
    const { profile } = getProfileFromTextSamples(`
      B[file:/src/b.cpp]  B[file:/src/b.cpp]  A[file:/src/a.cpp]
                                              A2[file:/src/a.cpp]
    `);

    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    expect(filePaths(candidates)).toEqual(['/src/b.cpp', '/src/a.cpp']);
  });

  it('groups the files that ship inside the browser under one root', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:chrome://browser/content/browser.js]
      B[file:resource://gre/modules/AppConstants.sys.mjs]
      C[file:moz-src:///toolkit/components/foo.mjs]
      D[file:https://example.com/app.js]
      E[file:jar:file:///Applications/Firefox%20Nightly.app/Contents/Resources/omni.ja!/chrome/toolkit/content/global/bar.js]
      F[file:C:\\Users\\me\\win.cpp]
    `);

    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    // All of these have the same weight, so they are ordered by path.
    expect(candidates.map((c) => c.pathSegments)).toEqual([
      ['C:', 'Users', 'me', 'win.cpp'],
      ['Firefox', 'chrome://browser', 'content', 'browser.js'],
      ['https://example.com', 'app.js'],
      [
        'Firefox',
        'omni.ja',
        'chrome',
        'toolkit',
        'content',
        'global',
        'bar.js',
      ],
      ['Firefox', 'moz-src://', 'toolkit', 'components', 'foo.mjs'],
      ['Firefox', 'resource://gre', 'modules', 'AppConstants.sys.mjs'],
    ]);
  });

  it('splits URLs so that the "//" does not become an empty segment', function () {
    const { profile } = getProfileFromTextSamples(
      `Ajs[file:https://example.com/static/app.js]`
    );

    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    expect(candidates[0].pathSegments).toEqual([
      'https://example.com',
      'static',
      'app.js',
    ]);
  });
});

describe('computeSourceCodeSharingFiles', function () {
  it('tells the files we have from the ones we do not', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:/src/a.cpp]  B[file:/src/b.cpp]
    `);
    const [{ B }] = funcNamesDictPerThread;
    const sourceB = ensureExists(profile.shared.funcTable.source[B]);
    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );

    const files = computeSourceCodeSharingFiles(
      candidates,
      computeSourceContentsForSharing(profile, availableCode([[sourceB, 'b']]))
    );
    expect(
      files.map((file) => [file.path, file.availability, file.byteCount])
    ).toEqual([
      ['/src/b.cpp', 'DOWNLOADED', 1],
      ['/src/a.cpp', 'UNAVAILABLE', null],
    ]);
    expect(computePickableSources(files)).toEqual(new Set([sourceB]));
    expect(computeSourceCodeSharingStats(candidates, files)).toEqual({
      fileCount: 2,
      downloadedFileCount: 1,
      downloadedByteCount: 1,
      unavailableFileCount: 1,
      publiclyDownloadableFileCount: 0,
    });
  });

  it('lists files we have not downloaded, without a size', function () {
    const { candidates, localSourceIndex } = setup();

    expect(computeSourceCodeSharingFiles(candidates, new Map())).toEqual([
      {
        sourceIndex: localSourceIndex,
        path: LOCAL_FILE,
        pathSegments: candidates[0].pathSegments,
        availability: 'UNAVAILABLE',
        byteCount: null,
      },
    ]);
  });

  it('puts the files we have before the ones we do not, whatever their weight', function () {
    // B is on the stack for 2 samples and A for 1, but only A was downloaded.
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      B[file:/src/b.cpp]  B[file:/src/b.cpp]  A[file:/src/a.cpp]
    `);
    const [{ A }] = funcNamesDictPerThread;
    const sourceA = ensureExists(profile.shared.funcTable.source[A]);
    const candidates = computeSourceCodeSharingCandidates(
      profile,
      computeStackToSource(profile)
    );
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[sourceA, 'a']])
    );

    expect(filePaths(candidates)).toEqual(['/src/b.cpp', '/src/a.cpp']);
    expect(
      filePaths(computeSourceCodeSharingFiles(candidates, contents))
    ).toEqual(['/src/a.cpp', '/src/b.cpp']);
  });

  it('sizes the files we have', function () {
    const { profile, candidates, localSourceIndex } = setup();
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[localSourceIndex, 'int main() {}']])
    );

    const files = computeSourceCodeSharingFiles(candidates, contents);
    expect(files[0].byteCount).toBe('int main() {}'.length);
  });

  it('leaves out files which anybody can download, even when we have them', function () {
    const { profile, candidates, publicSourceIndex } = setup();
    profile.shared.sources.content[publicSourceIndex] = 'from a source map';
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[publicSourceIndex, 'nsAppShell contents']], 'WEB')
    );

    expect(
      filePaths(computeSourceCodeSharingFiles(candidates, contents))
    ).toEqual([LOCAL_FILE]);
  });

  it('offers a public-looking file when its contents came from the local machine', function () {
    // The path has a download recipe, but the fetch was answered by the
    // browser connection, so the repo may well be private.
    const { profile, candidates, publicSourceIndex } = setup();
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[publicSourceIndex, 'nsAppShell contents']])
    );

    // The downloaded file comes first, however the candidates are ordered.
    const files = computeSourceCodeSharingFiles(candidates, contents);
    expect(filePaths(files)).toEqual([
      'widget/cocoa/nsAppShell.mm',
      LOCAL_FILE,
    ]);
  });
});

describe('buildSourceFileTree', function () {
  function makeFiles(
    paths: string[],
    availabilityByPath: Record<string, SourceCodeAvailability> = {}
  ): SourceCodeSharingFile[] {
    return paths.map((path, index) => {
      const availability = availabilityByPath[path] ?? 'DOWNLOADED';
      return {
        sourceIndex: index,
        path,
        pathSegments: path.split('/').filter((s) => s !== ''),
        availability,
        byteCount: availability === 'DOWNLOADED' ? 1 : null,
      };
    });
  }

  // Render the tree as indented lines, so the expectations read like the UI.
  function formatTree(nodes: SourceFileTreeNode[], depth = 0): string[] {
    const lines: string[] = [];
    for (const node of nodes) {
      lines.push(`${'  '.repeat(depth)}${node.label}`);
      lines.push(...formatTree(node.children, depth + 1));
    }
    return lines;
  }

  it('gives a directory with several files a row of its own', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/a.cpp', '/src/b.cpp', '/src/sub/c.cpp'])
    );
    expect(formatTree(tree)).toEqual([
      'src',
      '  a.cpp',
      '  b.cpp',
      '  sub/c.cpp',
    ]);
  });

  it('keeps the file order, so the heaviest files come first', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/z/late.cpp', '/src/a/early.cpp'])
    );
    expect(formatTree(tree)).toEqual(['src', '  z/late.cpp', '  a/early.cpp']);
  });

  it('handles a file whose path is a prefix of another', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/thing', '/src/thing/nested.cpp'])
    );
    // "thing" is both a file and a directory here, so it can't be collapsed
    // into its child.
    expect(formatTree(tree)).toEqual(['src/thing', '  nested.cpp']);
  });

  it('does not let files we have no contents for be picked', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/a.cpp', '/src/b.cpp'], { '/src/b.cpp': 'UNAVAILABLE' })
    );
    const [src] = tree;
    expect(src).toMatchObject({
      sourceIndexes: [0],
      byteCount: 1,
      downloadedFileCount: 1,
      availability: null,
    });
    expect(src.children[1]).toMatchObject({
      label: 'b.cpp',
      availability: 'UNAVAILABLE',
      sourceIndexes: [],
    });
  });

  it('shows the real path on file rows and the tree path on directories', function () {
    const tree = buildSourceFileTree(makeFiles(['/src/a.cpp', '/src/b.cpp']));
    expect(tree[0]).toMatchObject({ key: 'src', path: 'src' });
    expect(tree[0].children[0]).toMatchObject({
      key: 'src/a.cpp',
      path: '/src/a.cpp',
    });
  });

  it('gives sources with the same path a single row', function () {
    // The same script loaded twice with different contents.
    const tree = buildSourceFileTree(makeFiles(['/src/app.js', '/src/app.js']));
    expect(formatTree(tree)).toEqual(['src/app.js']);
    expect(tree[0].availability).toBe('DOWNLOADED');
    expect(tree[0].sourceIndexes).toEqual([0, 1]);
    expect(tree[0].byteCount).toBe(2);
  });
});
