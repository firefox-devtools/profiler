/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import {
  getProfileFromTextSamples,
  getMergedProfileFromTextSamples,
} from '../fixtures/profiles/processed-profile';
import {
  getCallTree,
  computeCallTreeCountsAndTimings,
  CallTree,
} from '../../profile-logic/call-tree';
import { getRootsAndChildren } from '../../profile-logic/flame-graph';
import {
  getCallNodeInfo,
  invertCallstack,
  getCallNodeIndexFromPath,
  getOriginAnnotationForFunc,
  filterThreadSamplesToRange,
} from '../../profile-logic/profile-data';
import { resourceTypes } from '../../profile-logic/data-structures';
import { formatTree, formatTreeIncludeCategories } from '../fixtures/utils';

import type { Profile } from '../../types/profile';

function callTreeFromProfile(
  profile: Profile,
  threadIndex: number = 0
): CallTree {
  const thread = profile.threads[threadIndex];
  const { interval, categories } = profile.meta;
  const defaultCategory = categories.findIndex(c => c.name === 'Other');
  const callNodeInfo = getCallNodeInfo(
    thread.stackTable,
    thread.frameTable,
    thread.funcTable,
    defaultCategory
  );
  const callTreeCountsAndTimings = computeCallTreeCountsAndTimings(
    thread,
    callNodeInfo,
    interval,
    false
  );
  return getCallTree(
    thread,
    interval,
    callNodeInfo,
    categories,
    'combined',
    callTreeCountsAndTimings
  );
}

describe('unfiltered call tree', function() {
  // These values are hoisted at the top for the ease of access. In the profile fixture
  // for the unfiltered call tree, the indexes for funcs, frames, stacks, and callNodes
  // all happen to share the same indexes as there is a 1 to 1 relationship between them.
  const A = 0;
  const B = 1;
  const C = 2;
  const D = 3;
  const E = 4;
  const F = 5;
  const G = 6;
  const H = 7;
  const I = 8;

  function getProfile() {
    return getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `).profile;
  }

  /**
   * Before creating a CallTree instance some timings are pre-computed.
   * This test ensures that these generated values are correct.
   */
  describe('computed counts and timings', function() {
    const profile = getProfile();
    const [thread] = profile.threads;
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );

    it('yields expected results', function() {
      expect(
        computeCallTreeCountsAndTimings(
          thread,
          callNodeInfo,
          profile.meta.interval,
          false
        )
      ).toEqual({
        rootCount: 1,
        rootTotalTime: 3,
        callNodeChildCount: new Uint32Array([1, 2, 2, 1, 0, 1, 0, 1, 0]),
        callNodeTimes: {
          selfTime: new Float32Array([0, 0, 0, 0, 1, 0, 1, 0, 1]),
          totalTime: new Float32Array([3, 3, 2, 1, 1, 1, 1, 1, 1]),
        },
      });
    });
  });

  describe('roots and children for flame graph', function() {
    const profile = getProfile();
    const [thread] = profile.threads;
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );

    it('returns roots and children', function() {
      expect(
        getRootsAndChildren(
          thread,
          callNodeInfo.callNodeTable,
          new Uint32Array([1, 2, 2, 1, 0, 1, 0, 1, 0]),
          new Float32Array([3, 3, 2, 1, 1, 1, 1, 1, 1])
        )
      ).toEqual({
        roots: [0],
        children: {
          array: new Uint32Array([1, 7, 2, 5, 3, 4, 6, 8, 0]),
          offsets: new Uint32Array([0, 1, 3, 5, 6, 6, 7, 7, 8, 8]),
        },
      });
    });
  });

  /**
   * Explicitly test the structure of the unfiltered call tree.
   */
  describe('computed structure', function() {
    /**
     * The profile samples have the following structure:
     *
     *         A -> A -> A
     *         |    |    |
     *         v    v    v
     *         B    B    B
     *         |    |    |
     *         v    v    v
     *         C    C    H
     *         |    |    |
     *         v    v    v
     *         D    F    I
     *         |    |
     *         v    v
     *         E    G
     *
     * Assert this form for each node where (FuncName:TotalTime,SelfTime)
     *
     *             A:3,0
     *               |
     *               v
     *             B:3,0
     *             /    \
     *            v      v
     *        C:2,0     H:1,0
     *       /      \         \
     *      v        v         v
     *    D:1,0     F:1,0     I:1,1
     *    |           |
     *    v           v
     *  E:1,1       G:1,1
     */
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `);
    const callTree = callTreeFromProfile(profile);
    it('computes an unfiltered call tree', function() {
      expect(formatTree(callTree)).toEqual([
        '- A (total: 3, self: —)',
        '  - B (total: 3, self: —)',
        '    - C (total: 2, self: —)',
        '      - D (total: 1, self: —)',
        '        - E (total: 1, self: 1)',
        '      - F (total: 1, self: —)',
        '        - G (total: 1, self: 1)',
        '    - H (total: 1, self: —)',
        '      - I (total: 1, self: 1)',
      ]);
    });
  });

  /**
   * The same as the previous test, but with categories
   */
  describe('computed structure with categories', function() {
    /**
     * Test that the category of a frame gets inherited down into its subtree
     * of the call tree, until reaching a frame that has an explicit category.
     */
    const { profile } = getProfileFromTextSamples(`
      A           A                A
      B[cat:DOM]  B[cat:DOM]       B[cat:DOM]
      C           C                H
      D           F[cat:Graphics]  I[cat:Other]
      E           G
    `);
    const callTree = callTreeFromProfile(profile);
    it('computes an unfiltered call tree', function() {
      expect(formatTreeIncludeCategories(callTree)).toEqual([
        '- A [Other] (total: 3, self: —)',
        '  - B [DOM] (total: 3, self: —)',
        '    - C [DOM] (total: 2, self: —)',
        '      - D [DOM] (total: 1, self: —)',
        '        - E [DOM] (total: 1, self: 1)',
        '      - F [Graphics] (total: 1, self: —)',
        '        - G [Graphics] (total: 1, self: 1)',
        '    - H [DOM] (total: 1, self: —)',
        '      - I [Other] (total: 1, self: 1)',
      ]);
    });
  });

  /**
   * These tests provides coverage for every method of the CallTree. It's less about
   * correct tree structure, and more of simple assertions about how the interface
   * is supposed to behave. There is probably duplication of coverage with other tests.
   */
  describe('CallTree methods', function() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
    `);
    const callTree = callTreeFromProfile(profile);

    describe('getRoots()', function() {
      it('returns an array with the root indexes', function() {
        expect(callTree.getRoots()).toEqual([A]);
      });
    });

    describe('getChildren()', function() {
      it('returns an array with the children indexes', function() {
        expect(callTree.getChildren(C)).toEqual([D, F]);
        expect(callTree.getChildren(E)).toEqual([]);
      });
    });

    describe('hasChildren()', function() {
      it('determines if nodes have children', function() {
        expect(callTree.hasChildren(C)).toEqual(true);
        expect(callTree.hasChildren(E)).toEqual(false);
      });
    });

    describe('getAllDescendants()', function() {
      it('returns a set with the descendant indexes', function() {
        expect(callTree.getAllDescendants(C)).toEqual(new Set([D, E, F, G]));
        expect(callTree.getAllDescendants(E)).toEqual(new Set([]));
      });
    });

    describe('getParent()', function() {
      it("finds a callNode's parent", function() {
        expect(callTree.getParent(A)).toBe(-1);
        expect(callTree.getParent(B)).toBe(A);
      });
    });

    describe('getDepth()', function() {
      it('returns the depth of callNodes in the tree', function() {
        expect(callTree.getDepth(A)).toBe(0);
        expect(callTree.getDepth(B)).toBe(1);
      });
    });

    describe('hasSameNodeIds()', function() {
      it('determines if the node IDs are the same between two trees', function() {
        // This is tested through strict equality, so re-generating callNodes is
        // the only thing this method expects.
        const otherTree = callTreeFromProfile(
          getProfileFromTextSamples('A').profile
        );
        expect(callTree.hasSameNodeIds(callTree)).toBe(true);
        expect(callTree.hasSameNodeIds(otherTree)).toBe(false);
      });
    });

    describe('getNodeData()', function() {
      it('gets a node for a given callNodeIndex', function() {
        expect(callTree.getNodeData(A)).toEqual({
          funcName: 'A',
          totalTime: 3,
          totalTimeRelative: 1,
          selfTime: 0,
          selfTimeRelative: 0,
        });
      });
    });

    describe('getDisplayData()', function() {
      it('gets a node for a given callNodeIndex', function() {
        expect(callTree.getDisplayData(A)).toEqual({
          dim: false,
          icon: null,
          lib: '',
          name: 'A',
          selfTime: '—',
          selfTimeWithUnit: '—',
          totalTime: '3',
          totalTimeWithUnit: '3ms',
          totalTimePercent: '100%',
          categoryColor: 'grey',
          categoryName: 'Other',
        });
      });
    });

    describe('icons from the call tree', function() {
      it('upgrades http to https', function() {
        const { profile } = getProfileFromTextSamples(`
          A[lib:examplecom.js]
        `);
        const callTree = callTreeFromProfile(profile);
        const [thread] = profile.threads;
        const hostStringIndex = thread.stringTable.indexForString(
          'examplecom.js'
        );

        thread.resourceTable.type[0] = resourceTypes.webhost;
        thread.resourceTable.host[0] = hostStringIndex;
        // Hijack the string table to provide the proper host name
        thread.stringTable._array[hostStringIndex] = 'http://example.com';

        expect(callTree.getDisplayData(A).icon).toEqual(
          'https://example.com/favicon.ico'
        );
      });
    });
  });

  /**
   * While not specifically part of the call tree, this is a core function
   * to help navigate stacks through a list of functions.
   */
  describe('getCallNodeIndexFromPath', function() {
    const profile = getProfile();
    const [thread] = profile.threads;
    const defaultCategory = profile.meta.categories.findIndex(
      c => c.name === 'Other'
    );
    const { callNodeTable } = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );

    // Helper to make the assertions a little less verbose.
    function checkStack(callNodePath, index, name) {
      it(`finds stack that ends in ${name}`, function() {
        expect(getCallNodeIndexFromPath(callNodePath, callNodeTable)).toBe(
          index
        );
      });
    }

    checkStack([A], A, 'A');
    checkStack([A, B], B, 'B');
    checkStack([A, B, C], C, 'C');
    checkStack([A, B, C, D], D, 'D');
    checkStack([A, B, C, D, E], E, 'E');

    checkStack([A, B, C, F], F, 'F');
    checkStack([A, B, C, F, G], G, 'G');

    checkStack([A, B, H], H, 'H');
    checkStack([A, B, H, I], I, 'I');

    it(`doesn't find a non-existent stack`, function() {
      expect(
        getCallNodeIndexFromPath([A, B, C, D, E, F, G], callNodeTable)
      ).toBe(null);
    });
  });
});

describe('inverted call tree', function() {
  /**
   * Explicitly test the structure of the inverted call tree.
   */
  describe('computed structure', function() {
    const profile = getProfileFromTextSamples(`
      A                A           A
      B[cat:DOM]       B[cat:DOM]  B[cat:DOM]
      C[cat:Graphics]  X           C[cat:Graphics]
      D[cat:Other]     Y           X
      E                Z           Y
                                   Z
    `).profile;
    const { interval, categories } = profile.meta;
    const defaultCategory = categories.findIndex(c => c.color === 'grey');

    // Check the non-inverted tree first.
    const thread = profile.threads[0];
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const callTreeCountsAndTimings = computeCallTreeCountsAndTimings(
      thread,
      callNodeInfo,
      interval,
      true
    );
    const callTree = getCallTree(
      thread,
      interval,
      callNodeInfo,
      categories,
      'combined',
      callTreeCountsAndTimings
    );

    it('computes an non-inverted call tree', function() {
      expect(formatTreeIncludeCategories(callTree)).toEqual([
        '- A [Other] (total: 3, self: 3)',
        '  - B [DOM] (total: 3, self: —)',
        '    - C [Graphics] (total: 2, self: —)',
        '      - D [Other] (total: 1, self: —)',
        '        - E [Other] (total: 1, self: —)',
        '      - X [Graphics] (total: 1, self: —)',
        '        - Y [Graphics] (total: 1, self: —)',
        '          - Z [Graphics] (total: 1, self: —)',
        '    - X [DOM] (total: 1, self: —)',
        '      - Y [DOM] (total: 1, self: —)',
        '        - Z [DOM] (total: 1, self: —)',
      ]);
    });

    // Now compute the inverted tree and check it.
    const invertedThread = invertCallstack(thread, defaultCategory);
    const invertedCallNodeInfo = getCallNodeInfo(
      invertedThread.stackTable,
      invertedThread.frameTable,
      invertedThread.funcTable,
      defaultCategory
    );
    const invertedCallTreeCountsAndTimings = computeCallTreeCountsAndTimings(
      invertedThread,
      invertedCallNodeInfo,
      interval,
      true
    );
    const invertedCallTree = getCallTree(
      invertedThread,
      interval,
      invertedCallNodeInfo,
      categories,
      'combined',
      invertedCallTreeCountsAndTimings
    );

    /**
     * Assert this tree form for each node.
     *
     *     E:1,1         Z:2,2
     *       |             |
     *       v             v
     *     D:1,0         Y:2,0
     *       |             |
     *       v             v
     *     C:1,0         X:2,0
     *       |          /    \
     *       v         v      v
     *     B:1,0    B:1,0    C:1,0
     *       |        |        |
     *       v        v        v
     *     A:1,0    A:1,0    B:1,0
     *                         |
     *                         v
     *                       A:1,0
     *
     *      ^         ^         ^
     *      |         |         |
     *      L         M         R   <- Label the branches. (left, middle, right)
     *
     * This test also checks that stacks of conflicting categories end up with
     * the "Other" category. In this test, in the non-inverted tree, the nodes
     * for the functions X, Y, and Z have different categories depending on
     * which subtree they are in: They have category "Graphics" in the subtree
     * under C, and the category "DOM" in the subtree that's directly attached
     * to B. In the inverted tree, those nodes collapse into each other, and
     * their category should be set to "Other".
     */
    it('computes an inverted call tree', function() {
      expect(formatTreeIncludeCategories(invertedCallTree)).toEqual([
        '- Z [Other] (total: 2, self: 2)',
        '  - Y [Other] (total: 2, self: —)',
        '    - X [Other] (total: 2, self: —)',
        '      - B [DOM] (total: 1, self: —)',
        '        - A [Other] (total: 1, self: —)',
        '      - C [Graphics] (total: 1, self: —)',
        '        - B [DOM] (total: 1, self: —)',
        '          - A [Other] (total: 1, self: —)',
        '- E [Other] (total: 1, self: 1)',
        '  - D [Other] (total: 1, self: —)',
        '    - C [Graphics] (total: 1, self: —)',
        '      - B [DOM] (total: 1, self: —)',
        '        - A [Other] (total: 1, self: —)',
      ]);
    });
  });
});

describe('diffing trees', function() {
  function getProfile() {
    const profile = getMergedProfileFromTextSamples(
      `
      A  A  A
      B  B  C
      D  E  F
    `,
      `
      A  A  A
      B  B  B
      G  I  E
    `
    );
    return profile;
  }

  it('displays a proper call tree, including nodes with totalTime = 0', () => {
    const profile = getProfile();
    const callTree = callTreeFromProfile(profile, /* threadIndex */ 2);
    const formattedTree = formatTree(callTree);
    expect(formattedTree).toEqual([
      '- A (total: 0, self: —)',
      '  - B (total: 1, self: —)',
      '    - D (total: -1, self: -1)',
      '    - G (total: 1, self: 1)',
      '    - I (total: 1, self: 1)',
      '  - C (total: -1, self: —)',
      '    - F (total: -1, self: -1)',
    ]);

    // There's no A -> B -> E node because the diff makes it completely disappear.
    expect(formattedTree).not.toContainEqual(expect.stringMatching(/^\s*- E/));
  });

  it('displays a proper call tree, even for range-filtered threads', () => {
    const profile = getProfile();
    const rangeStart = 1;
    const rangeEnd = 3;
    profile.threads = profile.threads.map(thread =>
      filterThreadSamplesToRange(thread, rangeStart, rangeEnd)
    );
    const callTree = callTreeFromProfile(profile, /* threadIndex */ 2);
    const formattedTree = formatTree(callTree);
    expect(formattedTree).toEqual([
      // A -> B -> D and A -> B -> G should be filtered out by the range filtering.
      '- A (total: 0, self: —)',
      '  - B (total: 1, self: —)',
      '    - I (total: 1, self: 1)',
      '  - C (total: -1, self: —)',
      '    - F (total: -1, self: -1)',
    ]);
  });

  it('computes a rootTotalTime that is the absolute count of all intervals', () => {
    const profile = getProfile();

    const thread = profile.threads[2];
    const { interval, categories } = profile.meta;
    const defaultCategory = categories.findIndex(c => c.name === 'Other');
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      thread.funcTable,
      defaultCategory
    );
    const callTreeCountsAndTimings = computeCallTreeCountsAndTimings(
      thread,
      callNodeInfo,
      interval,
      false
    );
    expect(callTreeCountsAndTimings.rootTotalTime).toBe(4);
  });
});

describe('origin annotation', function() {
  const {
    profile: {
      threads: [thread],
    },
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A
    B
    C
    D
  `);

  function addResource(
    funcName: string,
    name: string,
    host: string | null,
    location: string | null
  ) {
    const resourceIndex = thread.resourceTable.length;
    const funcIndex = funcNames.indexOf(funcName);
    thread.funcTable.resource[funcIndex] = resourceIndex;
    thread.funcTable.fileName[funcIndex] = location
      ? thread.stringTable.indexForString(location)
      : null;
    thread.resourceTable.lib.push(-1);
    thread.resourceTable.name.push(thread.stringTable.indexForString(name));
    thread.resourceTable.host.push(
      host ? thread.stringTable.indexForString(host) : undefined
    );
    thread.resourceTable.length++;
  }

  addResource(
    'A',
    'http://foobar.com',
    'http://foobar.com',
    'http://foobar.com/script.js'
  );

  addResource(
    'B',
    'Extension "Gecko Profiler"',
    'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85',
    'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/script.js'
  );

  addResource('C', 'libxul.so', null, '/home/user/mozilla-central/xul.cpp');

  addResource('D', 'libxul.so', null, null);

  function getOrigin(funcName: string): string {
    return getOriginAnnotationForFunc(
      funcNames.indexOf(funcName),
      thread.funcTable,
      thread.resourceTable,
      thread.stringTable
    );
  }

  it('formats web origins correctly', function() {
    expect(getOrigin('A')).toEqual('http://foobar.com/script.js');
  });

  it('formats extension origins correctly', function() {
    expect(getOrigin('B')).toEqual(
      'Extension "Gecko Profiler": ' +
        'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/script.js'
    );
  });

  it('formats library origins correctly', function() {
    expect(getOrigin('C')).toEqual(
      'libxul.so: /home/user/mozilla-central/xul.cpp'
    );
    expect(getOrigin('D')).toEqual('libxul.so');
  });
});
