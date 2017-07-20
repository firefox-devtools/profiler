/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import getMergingStacksProfile from '../fixtures/profiles/merging-stacks';
import { processProfile } from '../../profile-logic/process-profile';
import exampleProfile from '.././fixtures/profiles/example-profile';
import {
  getTracingMarkers,
  deDuplicateFunctionFrames,
} from '../../profile-logic/profile-data';

import type { Thread, IndexIntoStackTable } from '../../types/profile';

describe('profile-data', function() {
  describe('getTracingMarkers', function() {
    const profile = processProfile(exampleProfile);
    const thread = profile.threads[0];
    const tracingMarkers = getTracingMarkers(thread);
    it('should fold the two reflow markers into one tracing marker', function() {
      expect(tracingMarkers.length).toEqual(5);
      expect(tracingMarkers[0].start).toEqual(2);
      expect(tracingMarkers[0].name).toEqual('Reflow');
      expect(tracingMarkers[0].dur).toEqual(6);
      expect(tracingMarkers[0].title).toBeNull();
    });
    it('should fold the two Rasterize markers into one tracing marker, after the reflow tracing marker', function() {
      expect(tracingMarkers.length).toEqual(5);
      expect(tracingMarkers[1].start).toEqual(4);
      expect(tracingMarkers[1].name).toEqual('Rasterize');
      expect(tracingMarkers[1].dur).toEqual(1);
      expect(tracingMarkers[1].title).toBeNull();
    });
    it('should create a tracing marker for the MinorGC startTime/endTime marker', function() {
      expect(tracingMarkers.length).toEqual(5);
      expect(tracingMarkers[3].start).toEqual(11);
      expect(tracingMarkers[3].name).toEqual('MinorGC');
      expect(tracingMarkers[3].dur).toEqual(1);
      expect(tracingMarkers[3].title).toBeNull();
    });
    it('should create a tracing marker for the DOMEvent marker', function() {
      expect(tracingMarkers[2]).toMatchObject({
        dur: 1,
        name: 'DOMEvent',
        start: 9,
        title: null,
      });
    });
    it('should create a tracing marker for the marker UserTiming', function() {
      expect(tracingMarkers[4]).toMatchObject({
        dur: 1,
        name: 'UserTiming',
        start: 12,
        title: null,
      });
    });
  });

  function _getStackList(
    thread: Thread,
    stackIndex: IndexIntoStackTable | null
  ) {
    if (typeof stackIndex !== 'number') {
      throw new Error('stackIndex must be a number');
    }
    const { prefix } = thread.stackTable;
    const stackList = [];
    let nextStack = stackIndex;
    while (nextStack !== null) {
      if (typeof nextStack !== 'number') {
        throw new Error('nextStack must be a number');
      }

      stackList.push(nextStack);
      nextStack = prefix[nextStack];
    }
    return stackList;
  }

  describe('deDuplicateFunctionFrames', function() {
    const { threads: [thread] } = getMergingStacksProfile();
    const deDuplicatedThread = deDuplicateFunctionFrames(thread);
    const originalStackListA = _getStackList(thread, thread.samples.stack[0]);
    const originalStackListB = _getStackList(thread, thread.samples.stack[1]);
    const deDuplicatedStackListA = _getStackList(
      deDuplicatedThread,
      deDuplicatedThread.samples.stack[0]
    );
    const deDuplicatedStackListB = _getStackList(
      deDuplicatedThread,
      deDuplicatedThread.samples.stack[1]
    );

    it('starts with a fully unduplicated set stack frames', function() {
      /**
       * Assert this original structure:
       *
       *            stack0 (funcA)
       *                 |
       *                 v
       *            stack1 (funcB)
       *                 |
       *                 v
       *            stack2 (funcC)
       *            /            \
       *           V              V
       *    stack3 (funcD)     stack5 (funcD)
       *         |                  |
       *         v                  V
       *    stack4 (funcE)     stack6 (funcF)
       *
       *       ^sample 0          ^sample 1
       */

      expect(thread.stackTable.length).toEqual(7);
      expect(originalStackListA).toEqual([4, 3, 2, 1, 0]);
      expect(originalStackListB).toEqual([6, 5, 2, 1, 0]);
    });

    it('can create a new stack table with de-duplicated function frames', function() {
      /**
       * This structure represents the desired de-duplication.
       *
       *            stack0 (funcA)
       *                 |
       *                 v
       *            stack1 (funcB)
       *                 |
       *                 v
       *            stack2 (funcC)
       *                 |
       *                 v
       *            stack3 (funcD)
       *          /               \
       *         V                 V
       * stack4 (funcE)       stack5 (funcF)
       *
       *       ^sample 0          ^sample 1
       */
      expect(deDuplicatedStackListA).toEqual([4, 3, 2, 1, 0]);
      expect(deDuplicatedStackListB).toEqual([5, 3, 2, 1, 0]);
      expect(deDuplicatedThread.stackTable.length).toEqual(6);
    });

    it('provides a mapping back to the original ids', function() {
      const { transformedToOriginalStack } = deDuplicatedThread.stackTable;
      if (!transformedToOriginalStack) {
        throw new Error(
          'transformedToOriginalStack must exist in the deDuplicatedThread'
        );
      }
      const backToOriginalStackListA = deDuplicatedStackListA.map(
        index => transformedToOriginalStack[index]
      );
      const backToOriginalStackListB = deDuplicatedStackListB.map(
        index => transformedToOriginalStack[index]
      );

      expect(backToOriginalStackListA).toEqual([4, [3, 5], 2, 1, 0]);
      expect(backToOriginalStackListB).toEqual([6, [3, 5], 2, 1, 0]);
    });

    it('provides a mapping back from the original ids to the transformed ids', function() {
      const { originalToTransformedStack } = deDuplicatedThread.stackTable;
      if (!originalToTransformedStack) {
        throw new Error(
          'transformedToOriginalStack must exist in the deDuplicatedThread'
        );
      }
      const toTransformedStackListA = originalStackListA.map(
        index => originalToTransformedStack[index]
      );
      const toTransformedStackListB = originalStackListB.map(
        index => originalToTransformedStack[index]
      );

      expect(toTransformedStackListA).toEqual([4, 3, 2, 1, 0]);
      expect(toTransformedStackListB).toEqual([5, 3, 2, 1, 0]);
    });
  });
});
