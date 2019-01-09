/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/flow';
import { changeShowJsTracerSummary } from '../../actions/profile-view';
import { convertJsTracerToThread } from '../../profile-logic/js-tracer';
import { getEmptyProfile } from '../../profile-logic/data-structures';
import { formatTree } from '../fixtures/utils';

import {
  getProfileFromTextSamples,
  getProfileWithJsTracerEvents,
  type TestDefinedJsTracerEvent,
} from '../fixtures/profiles/processed-profile';

describe('convertJsTracerToThread', function() {
  it('can generate stacks correctly', function() {
    const existingProfile = getProfileWithJsTracerEvents([
      // [mozilla                  ]
      //  [int   ][ion          ]
      //   [int]    [ion      ]
      ['https://mozilla.org', 0, 20],
      ['Interpreter', 1, 5],
      ['Interpreter', 2, 4],
      ['IonMonkey', 5, 19],
      ['IonMonkey', 6, 18],
    ]);
    const existingThread = existingProfile.threads[0];
    const categories = existingProfile.meta.categories;

    const profile = getEmptyProfile();
    const jsTracer = ensureExists(existingThread.jsTracer);
    profile.threads = [
      convertJsTracerToThread(existingThread, jsTracer, categories),
    ];
    const { getState } = storeWithProfile(profile);
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      '- https://mozilla.org (total: 20,000, self: 2,000)',
      '  - Interpreter (total: 18,000, self: 2,000)',
      '    - IonMonkey (total: 14,000, self: 2,000)',
      '      - IonMonkey (total: 12,000, self: 12,000)',
      '    - Interpreter (total: 2,000, self: 2,000)',
    ]);
  });
});

describe('selectors/getJsTracerTiming', function() {
  describe('full stack-based view', function() {
    it('has no JS tracer timing if no js tracer info is present', function() {
      const { profile } = getProfileFromTextSamples('A');
      const { getState } = storeWithProfile(profile);
      expect(profile.threads[0].jsTracer).toBe(undefined);
      expect(
        selectedThreadSelectors.getExpensiveJsTracerTiming(getState())
      ).toEqual(null);
    });

    it('has empty JS tracer timing if no events are in the js tracer table', function() {
      expect(
        getHumanReadableJsTracerTiming({ useSelfTime: false, events: [] })
      ).toEqual([]);
    });

    it('can generate some simple nested timing', function() {
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: false,
          events: [
            ['https://mozilla.org', 0, 20],
            ['Interpreter', 1, 19],
            ['IonMonkey', 2, 18],
          ],
        })
      ).toEqual([
        'https://mozilla.org (0:20)',
        'Interpreter (1:19)',
        'IonMonkey (2:18)',
      ]);
    });

    it('can generate sibling timing', function() {
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: false,
          events: [
            ['https://mozilla.org', 0, 20],
            ['Interpreter', 1, 5],
            ['Interpreter', 2, 4],
            ['IonMonkey', 5, 19],
            ['IonMonkey', 6, 18],
          ],
        })
      ).toEqual([
        'https://mozilla.org (0:20)',
        'Interpreter (1:5) | IonMonkey (5:19)',
        'Interpreter (2:4) | IonMonkey (6:18)',
      ]);
    });
  });

  describe('self time', function() {
    it('has empty JS tracer timing if no events are in the js tracer table', function() {
      expect(
        getHumanReadableJsTracerTiming({ useSelfTime: true, events: [] })
      ).toEqual([]);
    });

    it('can generate some simple nested timing', function() {
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: true,
          events: [
            ['https://mozilla.org', 0, 20],
            ['Interpreter', 1, 19],
            ['IonMonkey', 2, 18],
          ],
        })
      ).toEqual([
        'Interpreter (1:2) | Interpreter (18:19)',
        'IonMonkey (2:18)',
        'https://mozilla.org (0:1) | https://mozilla.org (19:20)',
      ]);
    });

    it('can "drain off" prefixes the first if branch of the algorithm', function() {
      // This test is checking a specific if branch of the timing function:
      //
      //    xxxxxxxxxxxxxxxx[================]
      //    xxxxxxxx[======]     [current]
      //    [prefix]
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: true,
          events: [
            // This comment makes the formatting "prettier".
            ['A', 0, 2],
            ['B', 0, 2],
            ['C', 0, 1],
            ['A', 2, 3],
          ],
        })
      ).toEqual([
        // This comment makes the formatting "prettier".
        'A (2:3)',
        'B (1:2)',
        'C (0:1)',
      ]);
    });

    it('can split a prefix stack if the ending time matches', function() {
      // This test is checking a specific if branch of the timing function:
      //
      //   [prefix]xxxxxxxxx
      //           [current]
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: true,
          events: [
            // This comment makes the formatting "prettier".
            ['A', 0, 2],
            ['B', 1, 2],
          ],
        })
      ).toEqual([
        // This comment makes the formatting "prettier".
        'A (0:1)',
        'B (1:2)',
      ]);
    });
  });
});

/**
 * Create JS tracing information from a list of events, and then compute a human
 * readable representation of the timing.
 *
 * "EventName1 (StartTime:EndTime) | EventName2 (StartTime:EndTime)"
 */
function getHumanReadableJsTracerTiming({
  useSelfTime,
  events,
}: {|
  useSelfTime: boolean,
  events: TestDefinedJsTracerEvent[],
|}): string[] {
  const profile = getProfileWithJsTracerEvents(events);
  const { dispatch, getState } = storeWithProfile(profile);
  const computeTiming = useSelfTime
    ? selectedThreadSelectors.getExpensiveJsTracerLeafTiming
    : selectedThreadSelectors.getExpensiveJsTracerTiming;
  dispatch(changeShowJsTracerSummary(useSelfTime));

  return ensureExists(computeTiming(getState())).map(
    ({ start, end, label, length }) => {
      const lines = [];
      for (let i = 0; i < length; i++) {
        lines.push(
          `${label[i]} (${parseFloat(start[i].toFixed(2))}:${parseFloat(
            end[i].toFixed(2)
          )})`
        );
      }
      return lines.join(' | ');
    }
  );
}
