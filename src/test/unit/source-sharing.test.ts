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
  computeSourceTreeRootWeights,
} from 'firefox-profiler/profile-logic/source-sharing';
import { storeWithProfile } from 'firefox-profiler/test/fixtures/stores';
import {
  getIdleCategoryIndex,
  getStackTable,
} from 'firefox-profiler/selectors/profile';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { ensureExists } from 'firefox-profiler/utils/types';
import { getEmptySourceLocationTable } from 'firefox-profiler/profile-logic/data-structures';
import { FrameFlag, FuncFlag } from 'firefox-profiler/types';

import type {
  IndexIntoSourceTable,
  Profile,
  SourceCodeAvailability,
  SourceCodeSharingFile,
  SourceCodeStatus,
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
    candidates: computeSourceCodeSharingCandidates(profile),
    localSourceIndex: sourceIndexForFunc(A),
    publicSourceIndex: sourceIndexForFunc(B),
  };
}

function filePaths(candidates: Array<{ path: string }>): string[] {
  return candidates.map((candidate) => candidate.path);
}

function availableCode(
  entries: Array<[IndexIntoSourceTable, string]>
): Map<IndexIntoSourceTable, SourceCodeStatus> {
  return new Map(
    entries.map(([sourceIndex, code]) => [
      sourceIndex,
      { type: 'AVAILABLE', code },
    ])
  );
}

// Pretend that a source map put the declaration of the func in `funcFile`, and
// the code that its frames ran in `frameFile`, as it does for inlined code.
function addOriginalFiles(
  profile: Profile,
  funcIndex: number,
  funcFile: string,
  frameFile: string
) {
  const { frameTable, funcTable, sources, sourceLocationTable, stringArray } =
    profile.shared;
  const addLocation = (filename: string) => {
    const sourceIndex = sources.length++;
    sources.id.push(null);
    sources.filename.push(stringArray.push(filename) - 1);
    sources.startLine.push(1);
    sources.startColumn.push(1);
    sources.sourceMapURL.push(null);
    sources.content.push(null);
    sourceLocationTable.source.push(sourceIndex);
    sourceLocationTable.line.push(1);
    sourceLocationTable.column.push(1);
    return sourceLocationTable.length++;
  };

  funcTable.flags[funcIndex] |= FuncFlag.HasOriginalLocation;
  funcTable.originalLocation[funcIndex] = addLocation(funcFile);
  const frameLocation = addLocation(frameFile);
  for (let frameIndex = 0; frameIndex < frameTable.length; frameIndex++) {
    if (frameTable.func[frameIndex] === funcIndex) {
      frameTable.flags[frameIndex] |= FrameFlag.HasOriginalLocation;
      frameTable.originalLocation[frameIndex] = frameLocation;
    }
  }
}

describe('computeSourceContentsForSharing', function () {
  it('finds the contents already embedded in the profile', function () {
    const { profile, localSourceIndex } = setup();
    profile.shared.sources.content[localSourceIndex] = 'int main() {}';

    expect(computeSourceContentsForSharing(profile, new Map())).toEqual(
      new Map([[localSourceIndex, 'int main() {}']])
    );
  });

  it('finds the source code fetched during this session', function () {
    const { profile, localSourceIndex } = setup();
    const cache = availableCode([[localSourceIndex, 'int main() {}']]);

    expect(computeSourceContentsForSharing(profile, cache)).toEqual(
      new Map([[localSourceIndex, 'int main() {}']])
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
      new Map([[localSourceIndex, 'from the source map']])
    );
  });
});

// Move a thread's sampled stacks to an allocation table and leave no samples,
// the way allocation-only profiles like DHAT imports look.
function moveSamplesToAllocations(
  profile: Profile,
  threadIndex: number,
  table: 'jsAllocations' | 'nativeAllocations'
) {
  const thread = profile.threads[threadIndex];
  const { stack } = thread.samples;
  const allocations = {
    time: stack.map((_, i) => i),
    weight: stack.map(() => 8),
    weightType: 'bytes' as const,
    stack,
    length: stack.length,
  };
  if (table === 'jsAllocations') {
    thread.jsAllocations = {
      ...allocations,
      className: stack.map(() => 'Function'),
      typeName: stack.map(() => 'JSObject'),
      coarseType: stack.map(() => 'Object'),
      inNursery: stack.map(() => false),
    };
  } else {
    thread.nativeAllocations = allocations;
  }
  thread.samples = {
    ...thread.samples,
    stack: [],
    time: [],
    weight: null,
    length: 0,
  };
}

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
      sourceA: sourceOf(A),
      sourceB: sourceOf(B),
      sourceC: sourceOf(C),
    };
  }

  it('finds the files a thread runs code from, callers included', function () {
    const { profile, contents, sourceA, sourceB } = setupTwoThreads();

    // Thread 0's only sample has B as its leaf and A as its caller, so both
    // files count even though only B has self time.
    expect(
      computeSourcesForThreads(profile, new Set([0]), new Set(contents.keys()))
    ).toEqual(new Set([sourceA, sourceB]));
  });

  it('keeps the threads apart', function () {
    const { profile, contents, sourceC } = setupTwoThreads();

    expect(
      computeSourcesForThreads(profile, new Set([1]), new Set(contents.keys()))
    ).toEqual(new Set([sourceC]));
  });

  it('finds the files on the allocation stacks of a thread', function () {
    const { profile, contents, sourceC } = setupTwoThreads();
    moveSamplesToAllocations(profile, 1, 'jsAllocations');

    expect(
      computeSourcesForThreads(profile, new Set([1]), new Set(contents.keys()))
    ).toEqual(new Set([sourceC]));
  });

  it('leaves out files whose contents we cannot share', function () {
    const { profile, sourceB } = setupTwoThreads();

    expect(
      computeSourcesForThreads(profile, new Set([0]), new Set([sourceB]))
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

    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(filePaths(candidates)).not.toContain('/home/user/moz/unsampled.cpp');
  });

  it('lists the files of a profile with only allocations, like a DHAT import', function () {
    const { profile } = getProfileFromTextSamples(`
      main[file:/src/main.cpp]
      malloc[file:/src/alloc.cpp]
    `);
    moveSamplesToAllocations(profile, 0, 'nativeAllocations');

    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(filePaths(candidates)).toEqual(['/src/main.cpp', '/src/alloc.cpp']);
  });

  it('offers the original file and the bundle of a source-mapped func', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(
      `A[file:/build/app.js]`
    );
    const [{ A }] = funcNamesDictPerThread;
    addOriginalFiles(profile, A, '/src/declared.ts', '/src/inlined.ts');

    // Without a func of its own, inlined code doesn't show up in the UI.
    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(filePaths(candidates)).toEqual([
      '/build/app.js',
      '/src/declared.ts',
    ]);
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

    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(candidates.map((c) => c.pathSegments)).toEqual([
      ['Firefox', 'chrome://browser', 'content', 'browser.js'],
      ['Firefox', 'resource://gre', 'modules', 'AppConstants.sys.mjs'],
      ['Firefox', 'moz-src://', 'toolkit', 'components', 'foo.mjs'],
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
      ['C:', 'Users', 'me', 'win.cpp'],
    ]);
  });

  it('puts source-mapped files under the site that served their bundle', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:https://example.com/assets/app.js]
      B[file:https://example.com/assets/app.js]
      C[file:https://example.com/assets/app.js]
      D[file:https://example.com/assets/app.js]
    `);
    const [{ A, B, C, D }] = funcNamesDictPerThread;
    const { funcTable, sources, stringArray } = profile.shared;

    // Pretend a source map resolved these funcs to the shapes source maps
    // commonly produce. The paths are kept as they are, under the site.
    const addOriginal = (funcIndex: number, filename: string) => {
      const sourceIndex = sources.length++;
      sources.id.push(null);
      sources.filename.push(stringArray.push(filename) - 1);
      sources.startLine.push(1);
      sources.startColumn.push(1);
      sources.sourceMapURL.push(null);
      sources.content.push(null);
      const table = ensureExists(profile.shared.sourceLocationTable);
      table.source.push(sourceIndex);
      table.line.push(1);
      table.column.push(1);
      funcTable.flags[funcIndex] |= FuncFlag.HasOriginalLocation;
      funcTable.originalLocation[funcIndex] = table.length++;
    };
    profile.shared.sourceLocationTable = getEmptySourceLocationTable();
    addOriginal(A, '../node_modules/react-dom/cjs/react-dom.production.js');
    addOriginal(B, 'webpack:///./src/components/App.tsx');
    addOriginal(C, 'webpack://my-app/./src/index.js');
    // A file that is a web URL on its own already says where it came from.
    addOriginal(D, 'https://cdn.example.org/lib.js');

    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(candidates.map((c) => c.pathSegments)).toEqual([
      ['https://example.com', 'assets', 'app.js'],
      [
        'https://example.com',
        '..',
        'node_modules',
        'react-dom',
        'cjs',
        'react-dom.production.js',
      ],
      [
        'https://example.com',
        'webpack://',
        '.',
        'src',
        'components',
        'App.tsx',
      ],
      ['https://example.com', 'webpack://my-app', '.', 'src', 'index.js'],
      ['https://cdn.example.org', 'lib.js'],
    ]);
  });

  it('splits URLs so that the "//" does not become an empty segment', function () {
    const { profile } = getProfileFromTextSamples(
      `Ajs[file:https://example.com/static/app.js]`
    );

    const candidates = computeSourceCodeSharingCandidates(profile);
    expect(candidates[0].pathSegments).toEqual([
      'https://example.com',
      'static',
      'app.js',
    ]);
  });
});

describe('computeSourceTreeRootWeights', function () {
  function rootWeights(profile: Profile): Map<string, number> {
    const { getState } = storeWithProfile(profile);
    return computeSourceTreeRootWeights(
      profile,
      getStackTable(getState()),
      computeSourceCodeSharingCandidates(profile),
      getIdleCategoryIndex(getState())
    );
  }

  it('counts a sample for the innermost func that has a source', function () {
    // The third sample's leaf has no file, so it counts for its caller A.
    const { profile } = getProfileFromTextSamples(`
      A[file:/app/a.cpp]  A[file:/app/a.cpp]  A[file:/app/a.cpp]
      B[file:/lib/b.cpp]  B[file:/lib/b.cpp]  C
    `);
    expect(rootWeights(profile)).toEqual(
      new Map([
        ['lib', 2],
        ['app', 1],
      ])
    );
  });

  it('counts a sample for the original file of its func', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(
      `A[file:/build/app.js]`
    );
    const [{ A }] = funcNamesDictPerThread;
    addOriginalFiles(profile, A, '/declared/a.ts', '/inlined/b.ts');
    expect(rootWeights(profile)).toEqual(new Map([['declared', 1]]));
  });

  it('leaves out idle samples', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:/app/a.cpp]  W[file:/lib/wait.cpp][cat:Idle]  W[file:/lib/wait.cpp][cat:Idle]
    `);
    expect(rootWeights(profile)).toEqual(new Map([['app', 1]]));
  });
});

describe('computeSourceCodeSharingFiles', function () {
  it('tells the files we have from the ones we do not', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:/src/a.cpp]  B[file:/src/b.cpp]
    `);
    const [{ B }] = funcNamesDictPerThread;
    const sourceB = ensureExists(profile.shared.funcTable.source[B]);
    const candidates = computeSourceCodeSharingCandidates(profile);

    const files = computeSourceCodeSharingFiles(
      candidates,
      computeSourceContentsForSharing(profile, availableCode([[sourceB, 'b']]))
    );
    expect(
      files.map((file) => [file.path, file.availability, file.uncompressedSize])
    ).toEqual([
      ['/src/a.cpp', 'UNAVAILABLE', null],
      ['/src/b.cpp', 'DOWNLOADED', 1],
    ]);
    expect(computePickableSources(files)).toEqual(new Set([sourceB]));
    expect(computeSourceCodeSharingStats(files)).toEqual({
      fileCount: 2,
      downloadedFileCount: 1,
      downloadedUncompressedSize: 1,
      unavailableFileCount: 1,
    });
  });

  it('lists files we have not downloaded, without a size', function () {
    const { candidates, localSourceIndex, publicSourceIndex } = setup();

    expect(computeSourceCodeSharingFiles(candidates, new Map())).toEqual([
      {
        sourceIndex: localSourceIndex,
        path: LOCAL_FILE,
        pathSegments: candidates[0].pathSegments,
        availability: 'UNAVAILABLE',
        uncompressedSize: null,
      },
      {
        sourceIndex: publicSourceIndex,
        path: 'widget/cocoa/nsAppShell.mm',
        pathSegments: candidates[1].pathSegments,
        availability: 'UNAVAILABLE',
        uncompressedSize: null,
      },
    ]);
  });

  it('sizes the files we have', function () {
    const { profile, candidates, localSourceIndex } = setup();
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[localSourceIndex, 'int main() {}']])
    );

    const files = computeSourceCodeSharingFiles(candidates, contents);
    expect(files[0].uncompressedSize).toBe('int main() {}'.length);
  });

  it('offers files which anybody can download, like any other file', function () {
    const { profile, candidates, publicSourceIndex } = setup();
    const contents = computeSourceContentsForSharing(
      profile,
      availableCode([[publicSourceIndex, 'nsAppShell contents']])
    );

    const files = computeSourceCodeSharingFiles(candidates, contents);
    expect(
      files.map((file) => [file.path, file.availability, file.uncompressedSize])
    ).toEqual([
      [LOCAL_FILE, 'UNAVAILABLE', null],
      [
        'widget/cocoa/nsAppShell.mm',
        'DOWNLOADED',
        'nsAppShell contents'.length,
      ],
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
        uncompressedSize: availability === 'DOWNLOADED' ? 1 : null,
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
      makeFiles(['/src/a.cpp', '/src/b.cpp', '/src/sub/c.cpp']),
      new Map()
    );
    expect(formatTree(tree)).toEqual([
      'src',
      '  a.cpp',
      '  b.cpp',
      '  sub/c.cpp',
    ]);
  });

  it('orders the rows alphabetically, directories first', function () {
    const tree = buildSourceFileTree(
      makeFiles([
        '/src/z.cpp',
        '/src/file10.cpp',
        '/src/b/y.cpp',
        '/src/a.cpp',
        '/src/b/x.cpp',
        '/src/file2.cpp',
      ]),
      new Map()
    );
    expect(formatTree(tree)).toEqual([
      'src',
      '  b',
      '    x.cpp',
      '    y.cpp',
      '  a.cpp',
      '  file2.cpp',
      '  file10.cpp',
      '  z.cpp',
    ]);
  });

  it('orders the roots by weight, and only the roots', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/other/w.cpp', '/app/y.cpp', '/app/x.cpp', '/lib/z.cpp']),
      new Map([
        ['lib', 5],
        ['app', 2],
      ])
    );
    expect(formatTree(tree)).toEqual([
      'lib/z.cpp',
      'app',
      '  x.cpp',
      '  y.cpp',
      'other/w.cpp',
    ]);
  });

  it('gives a file whose path is also a directory a row of its own', function () {
    // Like a page with inline scripts, and scripts below it.
    const tree = buildSourceFileTree(
      makeFiles(['/site', '/site/b.js', '/site/a.js']),
      new Map()
    );
    expect(formatTree(tree)).toEqual(['site', '  a.js', '  b.js', '  site']);
    const [directory] = tree;
    expect(directory).toMatchObject({
      key: 'site',
      path: 'site',
      availability: null,
    });
    expect(Array.from(directory.sourceIndexes).sort((a, b) => a - b)).toEqual([
      0, 1, 2,
    ]);
    // The page can be picked without the scripts below it.
    expect(directory.children[2]).toMatchObject({
      key: 'site/',
      path: '/site',
      availability: 'DOWNLOADED',
      sourceIndexes: new Int32Array([0]),
    });
  });

  it('keeps the keys unique when a file row has the name of a directory', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/a', '/a/a/x.cpp', '/a/a/y.cpp']),
      new Map()
    );
    expect(formatTree(tree)).toEqual([
      'a',
      '  a',
      '    x.cpp',
      '    y.cpp',
      '  a',
    ]);
    expect(tree[0].children.map((child) => child.key)).toEqual(['a/a', 'a/']);
  });

  it('does not let files we have no contents for be picked', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/a.cpp', '/src/b.cpp'], { '/src/b.cpp': 'UNAVAILABLE' }),
      new Map()
    );
    const [src] = tree;
    expect(src).toMatchObject({
      sourceIndexes: new Int32Array([0]),
      uncompressedSize: 1,
      downloadedFileCount: 1,
      availability: null,
    });
    expect(src.children[1]).toMatchObject({
      label: 'b.cpp',
      availability: 'UNAVAILABLE',
      sourceIndexes: new Int32Array([]),
    });
  });

  it('gives every row the pickable files at or below it', function () {
    const tree = buildSourceFileTree(
      makeFiles(
        ['/a/x/1.cpp', '/b/z.cpp', '/a/y.cpp', '/a/x/2.cpp', '/a/x/3.cpp'],
        { '/a/x/3.cpp': 'UNAVAILABLE' }
      ),
      new Map()
    );
    const sourceIndexesByRow = (
      nodes: SourceFileTreeNode[]
    ): Array<[string, number[]]> =>
      nodes.flatMap((node) => [
        [node.key, Array.from(node.sourceIndexes).sort((a, b) => a - b)],
        ...sourceIndexesByRow(node.children),
      ]);
    expect(sourceIndexesByRow(tree)).toEqual([
      ['a', [0, 2, 3]],
      ['a/x', [0, 3]],
      ['a/x/1.cpp', [0]],
      ['a/x/2.cpp', [3]],
      ['a/x/3.cpp', []],
      ['a/y.cpp', [2]],
      ['b/z.cpp', [1]],
    ]);
  });

  it('shows the real path on file rows and the tree path on directories', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/a.cpp', '/src/b.cpp']),
      new Map()
    );
    expect(tree[0]).toMatchObject({ key: 'src', path: 'src' });
    expect(tree[0].children[0]).toMatchObject({
      key: 'src/a.cpp',
      path: '/src/a.cpp',
    });
  });

  it('gives sources with the same path a single row', function () {
    // The same script loaded twice with different contents.
    const tree = buildSourceFileTree(
      makeFiles(['/src/app.js', '/src/app.js']),
      new Map()
    );
    expect(formatTree(tree)).toEqual(['src/app.js']);
    expect(tree[0].availability).toBe('DOWNLOADED');
    expect(tree[0].sourceIndexes).toEqual(new Int32Array([0, 1]));
    expect(tree[0].uncompressedSize).toBe(2);
  });

  it('shows the best availability of the sources with the same path', function () {
    const [unavailable, downloaded] = makeFiles(['/src/app.js', '/src/app.js']);
    const tree = buildSourceFileTree(
      [
        { ...unavailable, availability: 'UNAVAILABLE', uncompressedSize: null },
        downloaded,
      ],
      new Map()
    );
    expect(tree[0]).toMatchObject({
      availability: 'DOWNLOADED',
      sourceIndexes: new Int32Array([1]),
    });
  });
});
