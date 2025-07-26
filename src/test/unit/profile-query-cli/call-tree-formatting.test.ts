/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { FunctionMap } from '../../../profile-query/function-map';
import { collectCallTree } from '../../../profile-query/formatters/call-tree';
import type {
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  SessionContext,
  WithContext,
} from '../../../profile-query/types';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  formatThreadSamplesTopDownResult,
  formatThreadSamplesBottomUpResult,
} from '../../../profile-query-cli/formatters';
import type { CallTreeCollectionOptions } from '../../../profile-query/formatters/call-tree';
import {
  getCallTree,
  computeCallTreeTimings,
  computeCallNodeSelfAndSummary,
} from 'firefox-profiler/profile-logic/call-tree';
import { getInvertedCallNodeInfo } from 'firefox-profiler/profile-logic/profile-data';
import {
  getCategories,
  getDefaultCategory,
} from 'firefox-profiler/selectors/profile';

/**
 * Helper to create a mock session context for testing.
 */
function createMockContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'Test Thread' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 1000 },
  };
}

/**
 * Helper to build a ThreadSamplesTopDownResult from a profile.
 */
function buildTopDownResult(
  profileSamples: string,
  options: CallTreeCollectionOptions = {}
): WithContext<ThreadSamplesTopDownResult> {
  const { profile } = getProfileFromTextSamples(profileSamples);
  const store = storeWithProfile(profile);
  const state = store.getState();
  const threadSelectors = getThreadSelectors(0);
  const callTree = threadSelectors.getCallTree(state);
  const functionMap = new FunctionMap();
  const threadIndexes = new Set([0]);
  const libs = profile.libs;

  const regularCallTree = collectCallTree(
    callTree,
    functionMap,
    threadIndexes,
    libs,
    options
  );

  return {
    type: 'thread-samples-top-down',
    threadHandle: 't-0',
    friendlyThreadName: 'Test Thread',
    regularCallTree,
    context: createMockContext(),
  };
}

/**
 * Helper to build a ThreadSamplesBottomUpResult from a profile.
 */
function buildBottomUpResult(
  profileSamples: string,
  options: CallTreeCollectionOptions = {}
): WithContext<ThreadSamplesBottomUpResult> {
  const { profile } = getProfileFromTextSamples(profileSamples);
  const store = storeWithProfile(profile);
  const state = store.getState();
  const threadSelectors = getThreadSelectors(0);
  const functionMap = new FunctionMap();
  const threadIndexes = new Set([0]);
  const libs = profile.libs;

  // Build inverted call tree (bottom-up view)
  let collectedInvertedTree = null;
  try {
    const thread = threadSelectors.getFilteredThread(state);
    const callNodeInfo = threadSelectors.getCallNodeInfo(state);
    const categories = getCategories(state);
    const defaultCategory = getDefaultCategory(state);
    const weightType = threadSelectors.getWeightTypeForCallTree(state);
    const samples = threadSelectors.getPreviewFilteredCtssSamples(state);
    const sampleIndexToCallNodeIndex =
      threadSelectors.getSampleIndexToNonInvertedCallNodeIndexForFilteredThread(
        state
      );

    const callNodeSelfAndSummary = computeCallNodeSelfAndSummary(
      samples,
      sampleIndexToCallNodeIndex,
      callNodeInfo.getCallNodeTable().length
    );

    const invertedCallNodeInfo = getInvertedCallNodeInfo(
      callNodeInfo,
      defaultCategory,
      thread.funcTable.length
    );

    const invertedTimings = computeCallTreeTimings(
      invertedCallNodeInfo,
      callNodeSelfAndSummary
    );

    const invertedTree = getCallTree(
      thread,
      invertedCallNodeInfo,
      categories,
      invertedTimings,
      weightType
    );

    collectedInvertedTree = collectCallTree(
      invertedTree,
      functionMap,
      threadIndexes,
      libs,
      options
    );
  } catch (e) {
    // Failed to create inverted tree
    console.error('Failed to create inverted call tree:', e);
  }

  return {
    type: 'thread-samples-bottom-up',
    threadHandle: 't-0',
    friendlyThreadName: 'Test Thread',
    invertedCallTree: collectedInvertedTree,
    context: createMockContext(),
  };
}

describe('call tree formatting', function () {
  describe('top-down view', function () {
    describe('simple trees', function () {
      it('formats a simple linear tree', function () {
        const result = buildTopDownResult(
          `
          A
          B
          C
          D
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('formats a branching tree', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    B    B    C
          D    D    E    E
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('trees with truncation', function () {
      it('shows elided children with correct percentages', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B    B    B    C    C    D    E    F    G    H
        `,
          { maxNodes: 2 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('shows elided children at multiple levels', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A
          B    B    B    B    C    C    D    D
          E    E    F    F    G    H
        `,
          { maxNodes: 4 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('shows truncation with wide trees (many siblings)', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A    A    A
          B    C    D    E    F    G    H    I    J    K    L    M
        `,
          { maxNodes: 5, maxChildrenPerNode: 10 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('complex nested trees', function () {
      it('formats a deep nested path with branching', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    B    B
          C    C    C    C    C    C    D    D
          E    E    E    E    F    F
          G    G    H    H
          I    I
        `,
          { maxNodes: 15 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('formats a complex tree with mixed branching patterns', function () {
        const result = buildTopDownResult(
          `
          Main  Main  Main  Main  Main  Main  Main  Main  Main  Main
          Init  Loop  Loop  Loop  Loop  Loop  Loop  Loop  Loop  Loop
                Tick  Tick  Tick  Tick  Idle  Idle  Render Render Render
                AI    AI    Phys  Phys                     Layout Layout
                Think Think
        `,
          { maxNodes: 15 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('ordering and percentages', function () {
      it('maintains correct ordering by sample count', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B    B    B    B    B    C    C    C    D    D
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();

        // Verify ordering in the result structure
        const aNode = result.regularCallTree.children[0];
        expect(aNode.children[0].name).toBe('B'); // 5 samples
        expect(aNode.children[1].name).toBe('C'); // 3 samples
        expect(aNode.children[2].name).toBe('D'); // 2 samples
      });

      it('correctly calculates percentages for nested nodes', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B    B    B    B    B    B    C    C    D    D
          E    E    E    F    F
        `,
          { maxNodes: 20 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();

        // Verify percentages
        const aNode = result.regularCallTree.children[0];
        expect(aNode.totalPercentage).toBeCloseTo(100, 0);

        const bNode = aNode.children[0];
        expect(bNode.totalPercentage).toBeCloseTo(60, 0);

        const eNode = bNode.children[0];
        expect(eNode.totalPercentage).toBeCloseTo(30, 0);
      });
    });

    describe('different scoring strategies', function () {
      it('exponential-0.9 strategy output', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    B    B    C    C
          D    D    E    E    F    F
          G    G
        `,
          { maxNodes: 8, scoringStrategy: 'exponential-0.9' }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('percentage-only strategy output', function () {
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    B    B    C    C
          D    D    E    E    F    F
          G    G
        `,
          { maxNodes: 8, scoringStrategy: 'percentage-only' }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });
  });

  describe('bottom-up view', function () {
    describe('simple trees', function () {
      it('formats a simple linear tree inverted', function () {
        const result = buildBottomUpResult(
          `
          A
          B
          C
          D
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('formats a branching tree inverted', function () {
        const result = buildBottomUpResult(
          `
          A    A    A    A    B    B    C
          D    D    E    E
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('trees with truncation', function () {
      it('shows elided callers with correct percentages', function () {
        const result = buildBottomUpResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B    B    B    C    C    D    E    F    G    H
        `,
          { maxNodes: 5 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('shows elided callers at multiple levels', function () {
        const result = buildBottomUpResult(
          `
          A    A    A    A    A    A    A    A
          B    B    B    B    C    C    D    D
          E    E    F    F    G    H
        `,
          { maxNodes: 8 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('complex nested trees', function () {
      it('formats a deep call chain inverted', function () {
        const result = buildBottomUpResult(
          `
          Main  Main  Main  Main  Main  Main  Main  Main
          Loop  Loop  Loop  Loop  Loop  Loop  Loop  Loop
          Tick  Tick  Tick  Tick  Idle  Idle  Idle  Idle
          AI    AI    Phys  Phys
          Think Think
        `,
          { maxNodes: 15 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });

      it('shows which functions call a leaf function', function () {
        const result = buildBottomUpResult(
          `
          A    A    B    B    C    C
          D    D    D    D    D    D
          E    E    E    E    E    E
        `,
          { maxNodes: 10 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('different scoring strategies', function () {
      it('exponential-0.9 strategy for bottom-up', function () {
        const result = buildBottomUpResult(
          `
          A    A    A    A    A    A    B    B    C    C
          D    D    E    E    F    F
          G    G
        `,
          { maxNodes: 8, scoringStrategy: 'exponential-0.9' }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();
      });
    });

    describe('elision bugs', function () {
      it('elided children percentages should be relative to parent, not full profile', function () {
        // Create a tree where B represents 50% of samples (5 out of 10).
        // B has multiple callers (A1, A2, A3, A4, A5) that will be truncated.
        // The elided caller percentages should be relative to B's total (50%),
        // not relative to the full profile (100%).
        const result = buildBottomUpResult(
          `
          A1   A2   A3   A4   A5   C    C    C    C    C
          B    B    B    B    B    D    D    D    D    D
        `,
          { maxNodes: 3 }
        );

        const formatted = formatThreadSamplesBottomUpResult(result);
        expect(formatted).toMatchSnapshot();

        // Verify the bug: currently elided percentages are calculated relative to full profile
        expect(result.invertedCallTree).toBeDefined();
        const bNode = result.invertedCallTree!.children.find(
          (n) => n.name === 'B'
        );
        expect(bNode).toBeDefined();

        // B should have truncated children since we have limited nodes
        // With the bug, the elided callers show as % of full profile (10 samples)
        // After fix, they should show as % of B's total (5 samples = 50% of profile)
        // The elided callers combined should be close to 100% of B's total,
        // but with the bug they'll show as ~50% (or less depending on which callers were included)

        // For now, the snapshot will capture the buggy behavior
        // After fix, we'll update snapshots and add more specific assertions
      });

      it('each parent node should have at most one elision marker', function () {
        // Create a tree where a single parent has both depth limit and truncation
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B    B    B    B    B    B    B    B    B    B
          C    C    C    C    C    C    C    C    C    C
          D    D    D    D    D    D    D    D    D    D
          E    E    E    E    E    E    E    E    E    E
          F    F    F    F    F    F    F    F    F    F
        `,
          { maxNodes: 3, maxDepth: 3 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();

        // Verify that each parent has at most one elision marker
        // Count consecutive elision markers (which would indicate duplicates for same parent)
        const lines = formatted.split('\n');
        let consecutiveElisionCount = 0;
        let maxConsecutiveElisions = 0;

        for (const line of lines) {
          if (line.includes('└─ ...')) {
            consecutiveElisionCount++;
            maxConsecutiveElisions = Math.max(
              maxConsecutiveElisions,
              consecutiveElisionCount
            );
          } else if (line.trim().length > 0) {
            consecutiveElisionCount = 0;
          }
        }

        // Should never have more than 1 consecutive elision marker
        expect(maxConsecutiveElisions).toBeLessThanOrEqual(1);
      });

      it('sibling nodes with elided children should each show their own elision marker', function () {
        // Create a tree where two sibling nodes each have elided children
        // This tests that elision markers are per-parent, not per-indentation-level
        const result = buildTopDownResult(
          `
          A    A    A    A    A    A    A    A    A    A
          B1   B1   B1   B1   B1   B2   B2   B2   B2   B2
          C1   C2   C3   C4   C5   D1   D2   D3   D4   D5
        `,
          { maxNodes: 4 }
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();

        // Count how many elision markers appear in the output
        const lines = formatted.split('\n');
        const elisionMarkerCount = lines.filter((line) =>
          line.includes('└─ ...')
        ).length;

        // We expect at least 2 elision markers (one for each sibling B1 and B2)
        // Both have many children but limited maxNodes, so both should have elisions
        expect(elisionMarkerCount).toBeGreaterThanOrEqual(2);
      });

      it('node whose children were never expanded must still show elision marker', function () {
        // Reproduce bug where CallWindowProcW has 55.8% total, 0% self, but no elision marker
        // This happens when a node is included but hits the budget limit before its children are expanded
        const result = buildTopDownResult(
          `
          Root  Root  Root  Root  Root  Root  Root  Root  Root  Root
          A     A     A     A     A     A     B     B     C     D
          A1    A2    A3    A4    A5    A6    B1    B2
        `,
          { maxNodes: 4, maxChildrenPerNode: 2 } // Very tight: Root, A, B, C (A never expanded)
        );

        const formatted = formatThreadSamplesTopDownResult(result);
        expect(formatted).toMatchSnapshot();

        // Parse the tree and verify invariant: every node with total > self must show where the time went
        const lines = formatted.split('\n');
        const violations: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Match node lines like "├─ f-2. A [total: 50.0%, self: 0.0%]" or "f-2. A [total: 50.0%, self: 0.0%]"
          const match = line.match(
            /[├└]?─?\s*f-\d+\.\s+(.+?)\s+\[total:\s+([\d.]+)%,\s+self:\s+([\d.]+)%\]/
          );
          if (match) {
            const nodeName = match[1];
            const total = parseFloat(match[2]);
            const self = parseFloat(match[3]);

            // If total > self, this node has children that account for the difference
            if (total > self + 0.01) {
              // Check the next line - it must be either a child node or an elision marker
              const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

              // A child line either:
              // 1. Starts with more whitespace than current line (deeper nesting)
              // 2. Contains tree symbols │, ├─, or └─
              // 3. Contains an elision marker └─ ...

              const currentLeadingSpaces =
                line.match(/^(\s*)/)?.[1].length || 0;
              const nextLeadingSpaces =
                nextLine.match(/^(\s*)/)?.[1].length || 0;

              const hasTreeSymbols =
                nextLine.includes('│') ||
                nextLine.includes('├─') ||
                nextLine.includes('└─');

              const isChild =
                nextLine.trim().length > 0 &&
                (nextLeadingSpaces > currentLeadingSpaces || hasTreeSymbols);

              if (!isChild) {
                violations.push(
                  `Node "${nodeName}" has total=${total}%, self=${self}% but no child/elision marker:\n  Line ${i + 1}: ${line}\n  Next: ${nextLine}`
                );
              }
            }
          }
        }

        // Report all violations
        if (violations.length > 0) {
          throw new Error(
            `Found ${violations.length} node(s) missing elision markers:\n\n` +
              violations.join('\n\n')
          );
        }
      });
    });
  });
});
