/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  buildSourceFileTree,
  computeFetchableSources,
  computeShareableSources,
  computeSourceCodeSharingCandidates,
  computeSourceCodeSharingFiles,
  computeSourceCodeSharingStats,
  computeSourceContentsForSharing,
  computeSourcesForThreads,
  computeSourceTreeRootWeights,
  filterSourceCodeSharingCandidates,
} from 'firefox-profiler/profile-logic/source-sharing';
import { storeWithProfile } from 'firefox-profiler/test/fixtures/stores';
import {
  getIdleCategoryIndex,
  getStackTable,
} from 'firefox-profiler/selectors/profile';
import { computeSourceAddressProofs } from 'firefox-profiler/profile-logic/profile-data';
import { getProfileFromTextSamples } from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { ensureExists } from 'firefox-profiler/utils/types';
import { getEmptySourceLocationTable } from 'firefox-profiler/profile-logic/data-structures';
import { FrameFlag, FuncFlag } from 'firefox-profiler/types';

import type {
  CheckedSharingOptions,
  IndexIntoSourceTable,
  Profile,
  SourceCodeAvailability,
  SourceCodeFetchSource,
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
  const [{ A }] = funcNamesDictPerThread;

  const sourceIndexForFunc = (funcIndex: number): IndexIntoSourceTable =>
    ensureExists(
      funcTable.source[funcIndex],
      'Expected the func to have a source'
    );

  return {
    profile,
    candidates: computeSourceCodeSharingCandidates(profile),
    localSourceIndex: sourceIndexForFunc(A),
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
  it('lists every sampled file, except the ones in public repositories', function () {
    const { candidates, localSourceIndex } = setup();

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
        isFromWebSite: false,
        isFromSourceMap: false,
        hasRemovableUrl: false,
        isFromExtension: false,
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
    expect(candidates.map((c) => c.isFromWebSite)).toEqual([
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  it('leaves out every file that anyone can download, and groups the other repository files by repository', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:hg:hg.mozilla.org/mozilla-central:js/src/vm/Interpreter.cpp:abc]
      B[file:git:github.com/rust-lang/rust:library/std/src/thread/mod.rs:abc]
      C[file:cargo:github.com-1ecc6299db9ec823:tokio-1.6.1:src/runtime/task/mod.rs]
      D[file:s3:gecko-generated-sources:abc123/dom/bindings/NodeBinding.cpp:]
      E[file:git:git.example.com/team/project:src/main.c:abc]
    `);

    const candidates = computeSourceCodeSharingCandidates(profile);
    // Only the repository without a known download URL is left.
    expect(candidates.map((c) => c.pathSegments)).toEqual([
      ['git.example.com/team/project', 'src', 'main.c'],
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
    expect(candidates.every((c) => c.isFromWebSite)).toBe(true);
    // Only the bundle itself wasn't produced by a source map.
    expect(candidates.map((c) => c.isFromSourceMap)).toEqual([
      false,
      true,
      true,
      true,
      true,
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

describe('filterSourceCodeSharingCandidates', function () {
  function setupWithWebAndExtensionFiles() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:https://example.com/bundle.js]
      B[file:moz-extension://8e5a1b2c/content.js]
      C[file:${LOCAL_FILE}]
    `);
    const [{ A }] = funcNamesDictPerThread;
    addOriginalFiles(profile, A, '/src/app.ts', '/src/inlined.ts');
    return computeSourceCodeSharingCandidates(profile);
  }

  function sharingOptions(
    includeUrls: boolean,
    includeExtension: boolean
  ): CheckedSharingOptions {
    return {
      includeHiddenThreads: true,
      includeAllTabs: true,
      includeFullTimeRange: true,
      includeScreenshots: true,
      includeUrls,
      includeExtension,
      includePreferenceValues: true,
      includePrivateBrowsingData: true,
      includeArgumentValues: true,
    };
  }

  it('keeps every file when URLs and extensions are included', function () {
    const candidates = setupWithWebAndExtensionFiles();
    expect(
      filePaths(
        filterSourceCodeSharingCandidates(
          candidates,
          sharingOptions(true, true)
        )
      )
    ).toEqual([
      'https://example.com/bundle.js',
      'moz-extension://8e5a1b2c/content.js',
      LOCAL_FILE,
      '/src/app.ts',
    ]);
  });

  it('leaves out the files of web pages and extensions without URLs', function () {
    const candidates = setupWithWebAndExtensionFiles();
    // The source-mapped file has no URL of its own, but its contents still come
    // from the page that served the bundle.
    expect(
      filePaths(
        filterSourceCodeSharingCandidates(
          candidates,
          sharingOptions(false, true)
        )
      )
    ).toEqual([LOCAL_FILE]);
  });

  it('leaves out the files of extensions without extension information', function () {
    const candidates = setupWithWebAndExtensionFiles();
    expect(
      filePaths(
        filterSourceCodeSharingCandidates(
          candidates,
          sharingOptions(true, false)
        )
      )
    ).toEqual(['https://example.com/bundle.js', LOCAL_FILE, '/src/app.ts']);
  });
});

describe('computeSourceTreeRootWeights', function () {
  function rootPathSegmentWeights(profile: Profile): Map<string, number> {
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
    expect(rootPathSegmentWeights(profile)).toEqual(
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
    expect(rootPathSegmentWeights(profile)).toEqual(new Map([['declared', 1]]));
  });

  it('leaves out idle samples', function () {
    const { profile } = getProfileFromTextSamples(`
      A[file:/app/a.cpp]  W[file:/lib/wait.cpp][cat:Idle]  W[file:/lib/wait.cpp][cat:Idle]
    `);
    expect(rootPathSegmentWeights(profile)).toEqual(new Map([['app', 1]]));
  });
});

describe('computeFetchableSources', function () {
  function setupNativeAndJs() {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:/src/a.cpp][lib:xul][address:1234]
      B[file:https://example.com/app.js]
      C[file:/src/c.cpp]
    `);
    const [{ A, B, C }] = funcNamesDictPerThread;
    const { funcTable, sources } = profile.shared;
    const native = ensureExists(funcTable.source[A]);
    const js = ensureExists(funcTable.source[B]);
    const unprovable = ensureExists(funcTable.source[C]);
    // The browser knows this JS source by its id.
    sources.id[js] = 'ff6d24c3-b8f5-45cd-a7d3-b643b3292e41';
    return {
      profile,
      proofs: computeSourceAddressProofs(profile),
      native,
      js,
      unprovable,
    };
  }

  it('fetches native and JS files from the browser', function () {
    const { profile, proofs, native, js } = setupNativeAndJs();
    expect(computeFetchableSources(profile, proofs, true, true, true)).toEqual(
      new Map([
        [native, 'BROWSER'],
        [js, 'BROWSER'],
      ])
    );
  });

  it('only gets native files when the browser has no JS sources for this tab', function () {
    const { profile, proofs, native } = setupNativeAndJs();
    expect(
      computeFetchableSources(profile, proofs, true, false, false)
    ).toEqual(new Map([[native, 'BROWSER']]));
  });

  it('falls back to a local symbol server for native files', function () {
    const { profile, proofs, native } = setupNativeAndJs();
    expect(
      computeFetchableSources(profile, proofs, false, true, false)
    ).toEqual(new Map([[native, 'SYMBOL_SERVER']]));
  });

  it('can fetch nothing without the API or the JS sources', function () {
    const { profile, proofs } = setupNativeAndJs();
    expect(
      computeFetchableSources(profile, proofs, false, false, false)
    ).toEqual(new Map());
  });
});

describe('computeSourceCodeSharingFiles', function () {
  const NONE: ReadonlySet<IndexIntoSourceTable> = new Set();
  const NOT_FETCHABLE = new Map<IndexIntoSourceTable, SourceCodeFetchSource>();

  it('tells downloaded, fetchable, failed and unavailable files apart', function () {
    const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
      A[file:/src/a.cpp]  B[file:/src/b.cpp]  C[file:/src/c.cpp]  D[file:/src/d.cpp]
    `);
    const [{ B, C, D }] = funcNamesDictPerThread;
    const { funcTable } = profile.shared;
    const sourceOf = (funcIndex: number) =>
      ensureExists(funcTable.source[funcIndex]);
    const candidates = computeSourceCodeSharingCandidates(profile);

    const files = computeSourceCodeSharingFiles(
      candidates,
      computeSourceContentsForSharing(
        profile,
        availableCode([[sourceOf(D), 'd']])
      ),
      new Map([[sourceOf(B), 'SYMBOL_SERVER']]),
      new Set([sourceOf(C)])
    );
    expect(
      files.map((file) => [
        file.path,
        file.availability,
        file.fetchSource,
        file.uncompressedSize,
      ])
    ).toEqual([
      ['/src/a.cpp', 'UNAVAILABLE', null, null],
      ['/src/b.cpp', 'FETCHABLE', 'SYMBOL_SERVER', null],
      ['/src/c.cpp', 'FAILED', null, null],
      ['/src/d.cpp', 'DOWNLOADED', null, 1],
    ]);
    expect(computeShareableSources(files)).toEqual(
      new Set([sourceOf(D), sourceOf(B)])
    );
    expect(computeSourceCodeSharingStats(files)).toEqual({
      shareableFileCount: 2,
      unavailableFileCount: 1,
    });
  });

  it('lists files we have not downloaded, without a size', function () {
    const { candidates, localSourceIndex } = setup();

    // Without the browser connection or a local symbol server, nothing can be
    // fetched.
    expect(
      computeSourceCodeSharingFiles(candidates, new Map(), NOT_FETCHABLE, NONE)
    ).toEqual([
      {
        sourceIndex: localSourceIndex,
        path: LOCAL_FILE,
        pathSegments: candidates[0].pathSegments,
        isFromWebSite: false,
        isFromSourceMap: false,
        availability: 'UNAVAILABLE',
        fetchSource: null,
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

    const files = computeSourceCodeSharingFiles(
      candidates,
      contents,
      NOT_FETCHABLE,
      NONE
    );
    expect(files[0].uncompressedSize).toBe('int main() {}'.length);
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
        isFromWebSite: false,
        isFromSourceMap: false,
        availability,
        fetchSource: availability === 'FETCHABLE' ? 'BROWSER' : null,
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

  it('says where the fetchable files of a row would come from', function () {
    const files = makeFiles(['/a/x.cpp', '/a/y.cpp', '/b/z.cpp', '/b/w.cpp'], {
      '/a/x.cpp': 'FETCHABLE',
      '/a/y.cpp': 'FETCHABLE',
      '/b/z.cpp': 'FETCHABLE',
      '/b/w.cpp': 'FETCHABLE',
    });
    files[3].fetchSource = 'SYMBOL_SERVER';
    const [a, b] = buildSourceFileTree(files, new Map());
    expect(a.fetchSource).toBe('BROWSER');
    expect(b.children.map((child) => child.fetchSource)).toEqual([
      'SYMBOL_SERVER',
      'BROWSER',
    ]);
    // The files below "b" don't all come from one place.
    expect(b.fetchSource).toBe(null);
  });

  it('marks the file rows that a source map produced', function () {
    const files = makeFiles([
      'site.example/app.js',
      'site.example/src/a.ts',
      'site.example/src/b.ts',
    ]);
    files[1].isFromSourceMap = true;
    files[2].isFromSourceMap = true;
    const formatWithBadges = (nodes: SourceFileTreeNode[]): string[] =>
      nodes.flatMap((node) => [
        node.isFromSourceMap ? `${node.label} (from source map)` : node.label,
        ...formatWithBadges(node.children),
      ]);
    expect(formatWithBadges(buildSourceFileTree(files, new Map()))).toEqual([
      'site.example',
      'src',
      'a.ts (from source map)',
      'b.ts (from source map)',
      'app.js',
    ]);
  });

  it('puts the web sites before the heavier roots', function () {
    const files = makeFiles([
      'js/src/a.cpp',
      'site.example/app.js',
      'gfx/b.cpp',
      'other.example/lib.js',
    ]);
    files[1].isFromWebSite = true;
    files[3].isFromWebSite = true;
    const tree = buildSourceFileTree(
      files,
      new Map([
        ['js', 10],
        ['gfx', 20],
        ['site.example', 2],
        ['other.example', 1],
      ])
    );
    expect(formatTree(tree)).toEqual([
      'site.example/app.js',
      'other.example/lib.js',
      'gfx/b.cpp',
      'js/src/a.cpp',
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

  it('lets fetchable files be picked, but not unavailable ones', function () {
    const tree = buildSourceFileTree(
      makeFiles(['/src/a.cpp', '/src/b.cpp', '/src/c.cpp'], {
        '/src/b.cpp': 'FETCHABLE',
        '/src/c.cpp': 'UNAVAILABLE',
      }),
      new Map()
    );
    const [src] = tree;
    expect(src).toMatchObject({
      sourceIndexes: new Int32Array([0, 1]),
      uncompressedSize: 1,
      downloadedFileCount: 1,
      fetchableFileCount: 1,
      availability: null,
    });
    expect(src.children[1]).toMatchObject({
      label: 'b.cpp',
      availability: 'FETCHABLE',
      sourceIndexes: new Int32Array([1]),
    });
    expect(src.children[2]).toMatchObject({
      label: 'c.cpp',
      availability: 'UNAVAILABLE',
      sourceIndexes: new Int32Array([]),
    });
  });

  it('gives every row the shareable files at or below it', function () {
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
