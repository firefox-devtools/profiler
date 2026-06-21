/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getProfileFromTextSamples,
  getMergedProfileFromTextSamples,
} from '../fixtures/profiles/processed-profile';
import {
  getCallTree,
  computeCallNodeSelfAndSummary,
  computeCallTreeTimings,
} from '../../profile-logic/call-tree';
import { computeFlameGraphRows } from '../../profile-logic/flame-graph';
import {
  getCallNodeInfo,
  getInvertedCallNodeInfo,
  getOriginAnnotationForFunc,
  getOriginalPositionForFrame,
  filterRawThreadSamplesToRange,
  getSampleIndexToCallNodeIndex,
} from '../../profile-logic/profile-data';
import { ResourceType } from 'firefox-profiler/types';
import {
  callTreeFromProfile,
  functionListTreeFromProfile,
  upperWingTreeFromProfile,
  lowerWingTreeFromProfile,
  formatTree,
  formatTreeIncludeCategories,
  addSourceToTable,
} from '../fixtures/utils';
import { ensureExists } from 'firefox-profiler/utils/types';
import type { CallNodePath } from 'firefox-profiler/types';

describe('unfiltered call tree', function () {
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
    `);
  }

  /**
   * Before creating a CallTree instance some timings are pre-computed.
   * This test ensures that these generated values are correct.
   */
  describe('computed counts and timings', function () {
    const { derivedThreads, defaultCategory } = getProfile();
    const [thread] = derivedThreads;
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      defaultCategory
    );

    it('yields expected results', function () {
      const callTreeTimings = computeCallTreeTimings(
        callNodeInfo,
        computeCallNodeSelfAndSummary(
          thread.samples,
          getSampleIndexToCallNodeIndex(
            thread.samples.stack,
            callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
          ),
          callNodeInfo.getCallNodeTable().length
        )
      );
      expect(callTreeTimings).toEqual({
        type: 'NON_INVERTED',
        timings: {
          rootTotalSummary: 3,
          flameGraphWidthTotal: 3,
          callNodeHasChildren: new Uint8Array([1, 1, 1, 1, 0, 1, 0, 1, 0]),
          self: new Float64Array([0, 0, 0, 0, 1, 0, 1, 0, 1]),
          total: new Float64Array([3, 3, 2, 1, 1, 1, 1, 1, 1]),
        },
      });
    });
  });

  describe('ordered rows of call node indexes for flame graph', function () {
    it('returns ordered rows', function () {
      // On purpose, we build a profile where the call node indexes won't be in
      // the same order than the function names.
      const {
        derivedThreads,
        funcNamesDictPerThread: [{ G, H, I, J, K, M, N, W, X, Y, Z }],
        defaultCategory,
      } = getProfileFromTextSamples(`
        Z  Z  G  G  K  K
        X  X  H  H  M  N
        Y  W  I  J
      `);
      const [thread] = derivedThreads;
      const callNodeInfo = getCallNodeInfo(
        thread.stackTable,
        thread.frameTable,
        defaultCategory
      );
      const cnZ = callNodeInfo.getCallNodeIndexFromPath([Z]);
      const cnZX = callNodeInfo.getCallNodeIndexFromPath([Z, X]);
      const cnZXY = callNodeInfo.getCallNodeIndexFromPath([Z, X, Y]);
      const cnZXW = callNodeInfo.getCallNodeIndexFromPath([Z, X, W]);
      const cnG = callNodeInfo.getCallNodeIndexFromPath([G]);
      const cnGH = callNodeInfo.getCallNodeIndexFromPath([G, H]);
      const cnGHI = callNodeInfo.getCallNodeIndexFromPath([G, H, I]);
      const cnGHJ = callNodeInfo.getCallNodeIndexFromPath([G, H, J]);
      const cnK = callNodeInfo.getCallNodeIndexFromPath([K]);
      const cnKM = callNodeInfo.getCallNodeIndexFromPath([K, M]);
      const cnKN = callNodeInfo.getCallNodeIndexFromPath([K, N]);

      const rows = computeFlameGraphRows(
        callNodeInfo.getCallNodeTable(),
        thread.funcTable,
        thread.stringTable
      );
      expect(rows).toEqual([
        // Siblings are ordered in lexically ascending order.
        [cnG, cnK, cnZ],
        [cnGH, cnKM, cnKN, cnZX],
        [cnGHI, cnGHJ, cnZXW, cnZXY],
      ]);
    });
  });

  /**
   * Explicitly test the structure of the unfiltered call tree.
   */
  describe('computed structure', function () {
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
     * Assert this form for each node where (FuncName:Total,Self)
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

    it('computes an unfiltered call tree', function () {
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

  it('computes correct numbers when using large weights', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A
      B  C
    `);

    // Compute 485407757 + 1222 == 485408979.
    // If the weights are stored as floats, this checks that we aren't using
    // 32-bit floats - those wouldn't have enough precision.
    const [rawThread] = profile.threads;
    rawThread.samples.weightType = 'bytes';
    rawThread.samples.weight = [485407757, 1222];
    const callTree = callTreeFromProfile(profile);
    expect(formatTree(callTree)).toEqual([
      '- A (total: 485,408,979, self: —)',
      '  - B (total: 485,407,757, self: 485,407,757)',
      '  - C (total: 1,222, self: 1,222)',
    ]);
  });

  /**
   * The same as the previous test, but with categories
   */
  describe('computed structure with categories', function () {
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

    it('computes an unfiltered call tree', function () {
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
  describe('CallTree methods', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I[lib:libI.so]
      E  G
    `);
    const callTree = callTreeFromProfile(profile);

    describe('getRoots()', function () {
      it('returns an array with the root indexes', function () {
        expect(callTree.getRoots()).toEqual([A]);
      });
    });

    describe('getChildren()', function () {
      it('returns an array with the children indexes', function () {
        expect(callTree.getChildren(C)).toEqual([D, F]);
        expect(callTree.getChildren(E)).toEqual([]);
      });
    });

    describe('hasChildren()', function () {
      it('determines if nodes have children', function () {
        expect(callTree.hasChildren(C)).toEqual(true);
        expect(callTree.hasChildren(E)).toEqual(false);
      });
    });

    describe('getAllDescendants()', function () {
      it('returns a set with the descendant indexes', function () {
        expect(callTree.getAllDescendants(C)).toEqual(new Set([D, E, F, G]));
        expect(callTree.getAllDescendants(E)).toEqual(new Set([]));
      });
    });

    describe('getParent()', function () {
      it("finds a callNode's parent", function () {
        expect(callTree.getParent(A)).toBe(-1);
        expect(callTree.getParent(B)).toBe(A);
      });
    });

    describe('getDepth()', function () {
      it('returns the depth of callNodes in the tree', function () {
        expect(callTree.getDepth(A)).toBe(0);
        expect(callTree.getDepth(B)).toBe(1);
      });
    });

    describe('getNodeData()', function () {
      it('gets a node for a given callNodeIndex', function () {
        expect(callTree.getNodeData(A)).toEqual({
          funcName: 'A',
          total: 3,
          totalRelative: 1,
          self: 0,
          selfRelative: 0,
        });
      });
    });

    describe('getDisplayData()', function () {
      it('gets a node for a given callNodeIndex', function () {
        expect(callTree.getDisplayData(A)).toEqual({
          ariaLabel:
            'A, running count is 3 samples (100%), self count is 0 samples',
          isFrameLabel: true,
          iconSrc: null,
          icon: null,
          lib: '',
          name: 'A',
          self: '—',
          selfWithUnit: '—',
          selfPercent: '0%',
          total: '3',
          totalWithUnit: '3 samples',
          totalPercent: '100%',
          categoryColor: 'grey',
          categoryName: 'Other',
        });
        expect(callTree.getDisplayData(I)).toEqual({
          ariaLabel:
            'I, running count is 1 sample (33%), self count is 1 sample',
          isFrameLabel: false,
          iconSrc: null,
          icon: null,
          lib: 'libI.so',
          name: 'I',
          self: '1',
          selfWithUnit: '1 sample',
          selfPercent: '33%',
          total: '1',
          totalWithUnit: '1 sample',
          totalPercent: '33%',
          categoryColor: 'grey',
          categoryName: 'Other',
        });
      });
    });

    describe('icons from the call tree', function () {
      it('upgrades http to https', function () {
        const { profile, stringTable } = getProfileFromTextSamples(`
          A[lib:examplecom.js]
        `);
        const callTree = callTreeFromProfile(profile);
        const hostStringIndex = stringTable.indexForString('examplecom.js');

        profile.shared.resourceTable.type[0] = ResourceType.Webhost;
        profile.shared.resourceTable.host[0] = hostStringIndex;
        // Hijack the string table to provide the proper host name
        stringTable._array[hostStringIndex] = 'http://example.com';

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
  describe('getCallNodeIndexFromPath', function () {
    const { derivedThreads, defaultCategory } = getProfile();
    const [thread] = derivedThreads;
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      defaultCategory
    );

    // Helper to make the assertions a little less verbose.
    function checkStack(
      callNodePath: CallNodePath,
      index: number,
      name: string
    ) {
      it(`finds stack that ends in ${name}`, function () {
        expect(callNodeInfo.getCallNodeIndexFromPath(callNodePath)).toBe(index);
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

    it(`doesn't find a non-existent stack`, function () {
      expect(callNodeInfo.getCallNodeIndexFromPath([A, B, C, D, E, F, G])).toBe(
        null
      );
    });
  });
});

describe('inverted call tree', function () {
  /**
   * Explicitly test the structure of the inverted call tree.
   */
  describe('computed structure', function () {
    const { profile, derivedThreads, defaultCategory } =
      getProfileFromTextSamples(`
      A                A           A
      B[cat:DOM]       B[cat:DOM]  B[cat:DOM]
      C[cat:Graphics]  X           C[cat:Graphics]
      D[cat:Other]     Y           X
      E                Z           Y
                                   Z
    `);

    // Check the non-inverted tree first.
    const [thread] = derivedThreads;
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      defaultCategory
    );
    const callTreeTimings = computeCallTreeTimings(
      callNodeInfo,
      computeCallNodeSelfAndSummary(
        thread.samples,
        getSampleIndexToCallNodeIndex(
          thread.samples.stack,
          callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
        ),
        callNodeInfo.getCallNodeTable().length
      )
    );
    const callTree = getCallTree(
      thread,
      callNodeInfo,
      ensureExists(profile.meta.categories),
      thread.samples,
      callTreeTimings,
      'samples'
    );

    it('computes a non-inverted call tree', function () {
      expect(formatTreeIncludeCategories(callTree)).toEqual([
        '- A [Other] (total: 3, self: —)',
        '  - B [DOM] (total: 3, self: —)',
        '    - C [Graphics] (total: 2, self: —)',
        '      - D [Other] (total: 1, self: —)',
        '        - E [Other] (total: 1, self: 1)',
        '      - X [Graphics] (total: 1, self: —)',
        '        - Y [Graphics] (total: 1, self: —)',
        '          - Z [Graphics] (total: 1, self: 1)',
        '    - X [DOM] (total: 1, self: —)',
        '      - Y [DOM] (total: 1, self: —)',
        '        - Z [DOM] (total: 1, self: 1)',
      ]);
    });

    // Now compute the inverted tree and check it.
    const invertedCallNodeInfo = getInvertedCallNodeInfo(
      callNodeInfo,
      defaultCategory,
      thread.funcTable.length
    );
    const invertedCallTreeTimings = computeCallTreeTimings(
      invertedCallNodeInfo,
      computeCallNodeSelfAndSummary(
        thread.samples,
        getSampleIndexToCallNodeIndex(
          thread.samples.stack,
          invertedCallNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
        ),
        invertedCallNodeInfo.getCallNodeTable().length
      )
    );
    const invertedCallTree = getCallTree(
      thread,
      invertedCallNodeInfo,
      ensureExists(profile.meta.categories),
      thread.samples,
      invertedCallTreeTimings,
      'samples'
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
    it('computes an inverted call tree', function () {
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

describe('function list', function () {
  it('computes an unfiltered function list', function () {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  E  B
      C  C  A
      B  F  G
      D  E
    `);
    const callTree = functionListTreeFromProfile(profile);
    expect(formatTree(callTree)).toEqual([
      '- A (total: 3, self: —)',
      '- B (total: 2, self: —)',
      '- C (total: 2, self: —)',
      '- D (total: 1, self: 1)',
      '- E (total: 1, self: 1)',
      '- F (total: 1, self: —)',
      '- G (total: 1, self: 1)',
    ]);
  });
});

describe('upper wing', function () {
  // Samples:  A->B->C, A->B->D, A->E->C, A->E->F
  const textSamples = `
    A  A  A  A
    B  B  E  E
    C  D  C  F
  `;

  it('shows all callee subtrees of the selected function', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    // Select B: show subtrees rooted at B (i.e. B->C and B->D)
    const callTree = upperWingTreeFromProfile(profile, 'B');
    expect(formatTree(callTree)).toEqual([
      '- B (total: 2, self: —)',
      '  - C (total: 1, self: 1)',
      '  - D (total: 1, self: 1)',
    ]);
  });

  it('merges call nodes with the same function across different callers', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    // C appears under both B and E; the upper wing for C should show both
    // subtrees merged into one root C node
    const callTree = upperWingTreeFromProfile(profile, 'C');
    expect(formatTree(callTree)).toEqual(['- C (total: 2, self: 2)']);
  });

  it('returns an empty tree when no function is selected', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    // null selection: no subtrees to show
    const callTree = upperWingTreeFromProfile(profile, 'NONEXISTENT');
    expect(formatTree(callTree)).toEqual([]);
  });
});

describe('lower wing', function () {
  // Samples:  A->B->C, A->B->D, A->E->C, A->E->F
  const textSamples = `
    A  A  A  A
    B  B  E  E
    C  D  C  F
  `;

  it('shows callers of the selected function as inverted roots', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    // Select C: C has self-time in both A->B->C and A->E->C, so C becomes the
    // inverted root with total 2. Its callers B and E appear as children.
    const callTree = lowerWingTreeFromProfile(profile, 'C');
    expect(formatTree(callTree)).toEqual([
      '- C (total: 2, self: 2)',
      '  - B (total: 1, self: —)',
      '    - A (total: 1, self: —)',
      '  - E (total: 1, self: —)',
      '    - A (total: 1, self: —)',
    ]);
  });

  it('only counts samples where the selected function is present', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    // Select B: the self-time of B's subtree (C and D) gets attributed to B in
    // the non-inverted table, so the inverted tree shows B as the root with
    // total 2, and its caller A as a child.
    const callTree = lowerWingTreeFromProfile(profile, 'B');
    expect(formatTree(callTree)).toEqual([
      '- B (total: 2, self: 2)',
      '  - A (total: 2, self: —)',
    ]);
  });

  it('returns an empty tree when no function is selected', function () {
    const { profile } = getProfileFromTextSamples(textSamples);
    const callTree = lowerWingTreeFromProfile(profile, 'NONEXISTENT');
    expect(formatTree(callTree)).toEqual([]);
  });

  it('returns an empty tree when null is passed', function () {
    // Exercises the `selectedFuncIndex === null` early return in
    // _buildLowerWingTree.
    const { profile } = getProfileFromTextSamples(textSamples);
    const callTree = lowerWingTreeFromProfile(profile, null);
    expect(formatTree(callTree)).toEqual([]);
  });

  it('does not double-count nested re-entries of the selected function', function () {
    // C calls itself: A->C->B->C. The inner C must not contribute a second
    // entry point — the outer C's entry already covers the whole stack. This
    // exercises the subtree skip-ahead at the `entries` collection loop.
    const { profile } = getProfileFromTextSamples(`
      A
      C
      B
      C
    `);
    const callTree = lowerWingTreeFromProfile(profile, 'C');
    expect(formatTree(callTree)).toEqual([
      '- C (total: 1, self: 1)',
      '  - A (total: 1, self: —)',
    ]);
  });

  it('sorts caller children by func index', function () {
    // Three distinct callers of X. Func indices follow column-major discovery
    // order: Z=0, X=1, A=2, M=3. The lower wing must list the children sorted
    // by func index (Z, then A, then M), not by stack iteration order.
    const { profile } = getProfileFromTextSamples(`
      Z  A  M
      X  X  X
    `);
    const callTree = lowerWingTreeFromProfile(profile, 'X');
    expect(formatTree(callTree)).toEqual([
      '- X (total: 3, self: 3)',
      '  - Z (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '  - M (total: 1, self: —)',
    ]);
  });

  it('partitions callers across multiple depths', function () {
    // Two stacks share a depth-4 ancestor chain through D. Exercising the
    // partition loop past depth 1 ensures the suffix-ordered ranges and
    // per-iteration scratch buffers behave correctly across iterations.
    const { profile } = getProfileFromTextSamples(`
      A  A
      B  E
      C  C
      D  D
    `);
    const callTree = lowerWingTreeFromProfile(profile, 'D');
    expect(formatTree(callTree)).toEqual([
      '- D (total: 2, self: 2)',
      '  - C (total: 2, self: —)',
      '    - B (total: 1, self: —)',
      '      - A (total: 1, self: —)',
      '    - E (total: 1, self: —)',
      '      - A (total: 1, self: —)',
    ]);
  });

  it('attributes self time to a parent when an entry runs out of ancestors mid-walk', function () {
    // Two entry points for X: one is at the top of its stack (no ancestor),
    // the other has B above it. At root X the first entry is a "leaf" in the
    // ancestor walk (newDeep === -1) and contributes to X's self only; the
    // second contributes to child B.
    const { profile } = getProfileFromTextSamples(`
      X  B
      _  X
    `);
    const callTree = lowerWingTreeFromProfile(profile, 'X');
    expect(formatTree(callTree)).toEqual([
      '- X (total: 2, self: 2)',
      '  - B (total: 1, self: —)',
    ]);
  });

  it('falls back to the default category when entry points disagree', function () {
    // Two entry points for C with conflicting categories. The non-inverted
    // call nodes have different categories (Graphics vs DOM), and the lower
    // wing root for C must resolve to the default category ('Other').
    const { profile } = getProfileFromTextSamples(`
      A              B
      C[cat:Graphics]  C[cat:DOM]
    `);
    const callTree = lowerWingTreeFromProfile(profile, 'C');
    expect(formatTreeIncludeCategories(callTree)).toEqual([
      '- C [Other] (total: 2, self: 2)',
      '  - A [Other] (total: 1, self: —)',
      '  - B [Other] (total: 1, self: —)',
    ]);
  });
});

describe('diffing trees', function () {
  function getProfile() {
    return getMergedProfileFromTextSamples([
      `
        A  A  A  A  A  A  A
        B  B  B  B  C  B  B
        D  D  D  E  F  D  D
        F  F  F           F
      `,
      `
        A  A  A  A  A  A  A
        B  B  B  B  B  B  B
        D  D  D  G  I  E  I
        D  D  D
      `,
    ]);
  }

  it('displays a proper call tree, including nodes with total = 0', () => {
    const { profile } = getProfile();
    const callTree = callTreeFromProfile(profile, /* threadIndex */ 2);
    const formattedTree = formatTree(callTree);
    expect(formattedTree).toEqual([
      '- A (total: —, self: —)',
      '  - B (total: 1, self: —)',
      '    - D (total: -2, self: -1)',
      '      - F (total: -4, self: -4)',
      '      - D (total: 3, self: 3)',
      '    - I (total: 2, self: 2)',
      '    - G (total: 1, self: 1)',
      '  - C (total: -1, self: —)',
      '    - F (total: -1, self: -1)',
    ]);

    // There's no A -> B -> E node because the diff makes it completely disappear.
    expect(formattedTree).not.toContainEqual(expect.stringMatching(/^\s*- E/));
  });

  it('displays a proper call tree, even for range-filtered threads', () => {
    const { profile } = getProfile();
    const rangeStart = 4;
    const rangeEnd = 5;

    profile.threads = profile.threads.map((thread) =>
      filterRawThreadSamplesToRange(thread, rangeStart, rangeEnd)
    );

    const callTree = callTreeFromProfile(profile, /* threadIndex */ 2);
    const formattedTree = formatTree(callTree);
    expect(formattedTree).toEqual([
      // A -> B -> D and A -> B -> G should be filtered out by the range filtering.
      '- A (total: —, self: —)',
      '  - B (total: 1, self: —)',
      '    - I (total: 1, self: 1)',
      '  - C (total: -1, self: —)',
      '    - F (total: -1, self: -1)',
    ]);
  });

  it('finds the heaviest call path even when it has ancestors with low totals', () => {
    const { profile, funcNamesDictPerThread } = getProfile();
    const { B, D, F } = funcNamesDictPerThread[2];
    const callTree = callTreeFromProfile(profile, /* threadIndex */ 2);
    // Get the call node index for the node A -> B. TODO: Make this more reliable
    const AB = callTree.getChildren(callTree.getRoots()[0])[0];
    const invertedPath = callTree.findHeavyPathToSameFunctionAfterInversion(AB);
    expect(invertedPath).toEqual([F, D, B]);
  });

  it('computes a rootTotalSummary that is the absolute count of all intervals', () => {
    const { derivedThreads, defaultCategory } = getProfile();

    const thread = derivedThreads[2];
    const callNodeInfo = getCallNodeInfo(
      thread.stackTable,
      thread.frameTable,
      defaultCategory
    );
    const callTreeTimings = computeCallTreeTimings(
      callNodeInfo,
      computeCallNodeSelfAndSummary(
        thread.samples,
        getSampleIndexToCallNodeIndex(
          thread.samples.stack,
          callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
        ),
        callNodeInfo.getCallNodeTable().length
      )
    );
    expect(callTreeTimings.timings.rootTotalSummary).toBe(12);
  });
});

describe('origin annotation', function () {
  const {
    profile,
    stringTable,
    funcNamesPerThread: [funcNames],
  } = getProfileFromTextSamples(`
    A
    B
    C
    D
  `);

  const { shared } = profile;

  function addResource(
    funcName: string,
    name: string,
    host: string | null,
    location: string | null
  ) {
    const resourceIndex = shared.resourceTable.length;
    const funcIndex = funcNames.indexOf(funcName);
    shared.funcTable.resource[funcIndex] = resourceIndex;
    shared.funcTable.source[funcIndex] = location
      ? addSourceToTable(shared.sources, stringTable.indexForString(location))
      : null;
    shared.resourceTable.lib.push(-1);
    shared.resourceTable.name.push(stringTable.indexForString(name));
    shared.resourceTable.host.push(
      host ? stringTable.indexForString(host) : null
    );
    shared.resourceTable.length++;
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
      null,
      shared.frameTable,
      shared.funcTable,
      shared.resourceTable,
      stringTable,
      shared.sources
    );
  }

  it('formats web origins correctly', function () {
    expect(getOrigin('A')).toEqual('http://foobar.com/script.js');
  });

  it('formats extension origins correctly', function () {
    expect(getOrigin('B')).toEqual(
      'Extension "Gecko Profiler": ' +
        'moz-extension://bf3bb73c-919c-4fef-95c4-070a19fdaf85/script.js'
    );
  });

  it('formats library origins correctly', function () {
    expect(getOrigin('C')).toEqual(
      'libxul.so: /home/user/mozilla-central/xul.cpp'
    );
    expect(getOrigin('D')).toEqual('libxul.so');
  });
});

describe('getOriginAnnotationForFunc with originalLocation', function () {
  function setup() {
    const { profile, stringTable } = getProfileFromTextSamples(`A`);
    const { shared } = profile;

    const bundleIndex = addSourceToTable(
      shared.sources,
      stringTable.indexForString('http://example.com/bundle.js')
    );
    const originalIndex = addSourceToTable(
      shared.sources,
      stringTable.indexForString('http://example.com/original.ts')
    );

    // Wire the single func to the bundle and give it a compiled position.
    shared.funcTable.source[0] = bundleIndex;
    shared.funcTable.lineNumber[0] = 1;
    shared.funcTable.columnNumber[0] = 100;

    // The text sample produces one frame referencing func 0. Give it a
    // compiled position so tier-3 fallback has something meaningful to surface.
    shared.frameTable.line[0] = 5;
    shared.frameTable.column[0] = 10;

    function addOriginalLocationRow(
      source: number,
      line: number,
      column: number
    ): number {
      const idx = shared.sourceLocationTable.length;
      shared.sourceLocationTable.source.push(source);
      shared.sourceLocationTable.line.push(line);
      shared.sourceLocationTable.column.push(column);
      shared.sourceLocationTable.length++;
      return idx;
    }

    function callOrigin(frameOriginalLocationIdx: number | null): string {
      shared.frameTable.originalLocation[0] = frameOriginalLocationIdx;
      return getOriginAnnotationForFunc(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.resourceTable,
        stringTable,
        shared.sources,
        shared.sourceLocationTable
      );
    }

    return {
      shared,
      originalIndex,
      bundleIndex,
      addOriginalLocationRow,
      callOrigin,
    };
  }

  it('uses the frame original position when both source and line are mapped', function () {
    const { originalIndex, addOriginalLocationRow, callOrigin } = setup();
    const idx = addOriginalLocationRow(originalIndex, 42, 7);
    expect(callOrigin(idx)).toEqual('http://example.com/original.ts:42:7');
  });

  it('falls back to func mapping when the frame has no source-map entry', function () {
    const { shared, originalIndex, addOriginalLocationRow, callOrigin } =
      setup();
    shared.funcTable.originalLocation[0] = addOriginalLocationRow(
      originalIndex,
      10,
      4
    );
    expect(callOrigin(null)).toEqual('http://example.com/original.ts:10:4');
  });

  it("uses the frame's compiled position when the frame has no source-map entry", function () {
    const { callOrigin } = setup();
    expect(callOrigin(null)).toEqual('http://example.com/bundle.js:5:10');
  });
});

describe('getOriginalPositionForFrame', function () {
  function setup() {
    const { profile, stringTable } = getProfileFromTextSamples(`A`);
    const { shared } = profile;

    const bundleIndex = addSourceToTable(
      shared.sources,
      stringTable.indexForString('http://example.com/bundle.js')
    );
    const originalIndex = addSourceToTable(
      shared.sources,
      stringTable.indexForString('http://example.com/original.ts')
    );

    shared.funcTable.source[0] = bundleIndex;
    shared.funcTable.lineNumber[0] = 1;
    shared.funcTable.columnNumber[0] = 100;
    shared.frameTable.line[0] = 5;
    shared.frameTable.column[0] = 10;

    function addOriginalLocationRow(
      source: number,
      line: number,
      column: number
    ): number {
      const idx = shared.sourceLocationTable.length;
      shared.sourceLocationTable.source.push(source);
      shared.sourceLocationTable.line.push(line);
      shared.sourceLocationTable.column.push(column);
      shared.sourceLocationTable.length++;
      return idx;
    }

    return { shared, bundleIndex, originalIndex, addOriginalLocationRow };
  }

  it("returns the frame's source-mapped position when present (tier 1)", function () {
    const { shared, originalIndex, addOriginalLocationRow } = setup();
    shared.frameTable.originalLocation[0] = addOriginalLocationRow(
      originalIndex,
      42,
      7
    );
    expect(
      getOriginalPositionForFrame(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.sourceLocationTable
      )
    ).toEqual({ source: originalIndex, line: 42, column: 7 });
  });

  it("falls back to the func's source-mapped position when the frame has no source-map entry (tier 2)", function () {
    const { shared, originalIndex, addOriginalLocationRow } = setup();
    shared.funcTable.originalLocation[0] = addOriginalLocationRow(
      originalIndex,
      10,
      4
    );
    expect(
      getOriginalPositionForFrame(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.sourceLocationTable
      )
    ).toEqual({ source: originalIndex, line: 10, column: 4 });
  });

  it("falls back to the frame's compiled position when no source-map info applies (tier 3)", function () {
    const { shared, bundleIndex } = setup();
    expect(
      getOriginalPositionForFrame(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.sourceLocationTable
      )
    ).toEqual({ source: bundleIndex, line: 5, column: 10 });
  });

  it("falls back to the func's compiled line/column when the frame's are null", function () {
    const { shared, bundleIndex } = setup();
    shared.frameTable.line[0] = null;
    shared.frameTable.column[0] = null;
    expect(
      getOriginalPositionForFrame(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.sourceLocationTable
      )
    ).toEqual({ source: bundleIndex, line: 1, column: 100 });
  });

  it("uses the func's position when frameIndex is null (tooltip/call-node sites)", function () {
    const { shared, originalIndex, addOriginalLocationRow } = setup();
    shared.funcTable.originalLocation[0] = addOriginalLocationRow(
      originalIndex,
      10,
      4
    );
    expect(
      getOriginalPositionForFrame(
        null,
        0,
        shared.frameTable,
        shared.funcTable,
        shared.sourceLocationTable
      )
    ).toEqual({ source: originalIndex, line: 10, column: 4 });
  });

  it('treats originalLocation = null as no symbolication available', function () {
    const { shared, bundleIndex, originalIndex, addOriginalLocationRow } =
      setup();
    shared.funcTable.originalLocation[0] = addOriginalLocationRow(
      originalIndex,
      10,
      4
    );
    expect(
      getOriginalPositionForFrame(
        0,
        0,
        shared.frameTable,
        shared.funcTable,
        null
      )
    ).toEqual({ source: bundleIndex, line: 5, column: 10 });
  });
});
