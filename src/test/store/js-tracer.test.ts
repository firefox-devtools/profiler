/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { storeWithProfile } from '../fixtures/stores';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { ensureExists } from '../../utils/flow';
import { changeShowJsTracerSummary } from '../../actions/profile-view';
import {
  convertJsTracerToThread,
  getJsTracerFixed,
} from '../../profile-logic/js-tracer';
import { getEmptyProfile } from '../../profile-logic/data-structures';
import { StringTable } from '../../utils/string-table';
import { formatTree } from '../fixtures/utils';
import {
  getProfileFromTextSamples,
  getProfileWithJsTracerEvents,
  type TestDefinedJsTracerEvent,
} from '../fixtures/profiles/processed-profile';

import type { Profile } from 'firefox-profiler/types';

describe('jsTracerFixed', function () {
  function fixTiming(events: TestDefinedJsTracerEvent[]) {
    const profile = getProfileWithJsTracerEvents(events);
    const jsTracer = ensureExists(profile.threads[0].jsTracer);
    const jsTracerFixed = getJsTracerFixed(jsTracer);
    return {
      start: jsTracerFixed.start,
      end: jsTracerFixed.end,
    };
  }

  it('does not modify a valid structure', function () {
    const timing = fixTiming([
      // [mozilla                  ]
      //  [int   ][ion          ]
      //   [int]    [ion      ]
      ['https://mozilla.org', 0, 20],
      ['Interpreter', 1, 5],
      ['Interpreter', 2, 4],
      ['IonMonkey', 5, 19],
      ['IonMonkey', 6, 18],
    ]);
    expect(timing).toEqual({
      start: [0, 1000, 2000, 5000, 6000],
      end: [20000, 5000, 4000, 19000, 18000],
    });
  });

  it('fixes overlapping structures, cutting off the beginning', function () {
    const timing = fixTiming([
      // [aaaaaa]
      //      [bbbbbbbbb]
      ['a', 0, 5],
      ['b', 4, 9],
    ]);
    expect(timing).toEqual({
      // [aaaaaa][bbbbbb]
      start: [0, 5000],
      end: [5000, 9000],
    });
  });

  it('fixes overlapping structures, cutting off the end', function () {
    const timing = fixTiming([
      // [aaaaaa]
      //   [bbbbbb]
      ['a', 0, 5],
      ['b', 1, 6],
    ]);
    expect(timing).toEqual({
      // [aaaaaa][bbbbbb]
      start: [0, 1000],
      end: [5000, 5000],
    });
  });

  it('fixes events which are too early', function () {
    const timing = fixTiming([
      //    [aaaaaa]
      // [bbbbbb]
      ['a', 3, 8],
      ['b', 1, 6],
    ]);
    expect(timing).toEqual({
      //    [aaaaaa]
      //    [bbb]
      start: [3000, 3000],
      end: [8000, 6000],
    });
  });

  it('fixes events which are way too early', function () {
    const timing = fixTiming([
      //         [aaaa]
      // [bbb]
      ['a', 5, 9],
      ['b', 0, 2],
    ]);
    expect(timing).toEqual({
      //    [aaaaaa]
      //    [bbb]
      start: [5000, 5000],
      end: [9000, 7000],
    });
  });
});

describe('convertJsTracerToThread', function () {
  it('can generate stacks correctly', function () {
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
    const categories = ensureExists(
      existingProfile.meta.categories,
      'Expected to find categories.'
    );

    const profile = getEmptyProfile();
    profile.shared.stringArray = existingProfile.shared.stringArray;
    const jsTracer = ensureExists(existingThread.jsTracer);
    const stringTable = StringTable.withBackingArray(
      profile.shared.stringArray
    );
    profile.threads = [
      convertJsTracerToThread(
        existingThread,
        jsTracer,
        categories,
        stringTable
      ),
    ];
    const { getState } = storeWithProfile(profile);
    const callTree = selectedThreadSelectors.getCallTree(getState());

    expect(formatTree(callTree)).toEqual([
      // This is the real timing:
      '- https://mozilla.org (total: 20, self: 2)',
      '  - Interpreter (total: 18, self: 2)',
      '    - IonMonkey (total: 14, self: 2)',
      '      - IonMonkey (total: 12, self: 12)',
      '    - Interpreter (total: 2, self: 2)',
    ]);
  });
});

describe('selectors/getJsTracerTiming', function () {
  describe('full stack-based view', function () {
    it('has no JS tracer timing if no js tracer info is present', function () {
      const { profile } = getProfileFromTextSamples('A');
      const { getState } = storeWithProfile(profile);
      expect(profile.threads[0].jsTracer).toBe(undefined);
      expect(
        selectedThreadSelectors.getExpensiveJsTracerTiming(getState())
      ).toEqual(null);
    });

    it('has empty JS tracer timing if no events are in the js tracer table', function () {
      expect(
        getHumanReadableJsTracerTiming({ useSelfTime: false, events: [] })
      ).toEqual([]);
    });

    it('can generate some simple nested timing', function () {
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

    it('can generate sibling timing', function () {
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

  describe('self time', function () {
    it('has empty JS tracer timing if no events are in the js tracer table', function () {
      expect(
        getHumanReadableJsTracerTiming({ useSelfTime: true, events: [] })
      ).toEqual([]);
    });

    it('can generate some simple nested timing', function () {
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

    it('can "drain off" prefixes the first if branch of the algorithm', function () {
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

    it('handles float precision errors where the child event outlasts the parent', function () {
      //    0  1  2  3  4  5
      //    [prefix--]
      //       [current-]

      //    0  1  2  3  4  5
      //    [A-------]
      //       [B-------]
      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: true,
          events: [
            // This comment makes the formatting "prettier".
            ['A', 0, 3],
            ['B', 1, 4],
          ],
        })
      ).toEqual([
        // This comment makes the formatting "prettier".
        'A (0:1)',
        'B (1:3)',
      ]);
    });

    it('can split a prefix stack if the ending time matches', function () {
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

  describe('match function names', function () {
    it('works on the sampled data', function () {
      // Create a profile from text samples.
      const {
        profile,
        stringTable,
        funcNamesDictPerThread: [funcNamesDict],
      } = getProfileFromTextSamples(`
        Foo.js
        Bar.js
        Baz.js
      `);

      {
        // Now here comes the fun part. Manually manipulate the data so that the profile
        // has matching JS tracer information, such that we can deduce functions from
        // event names.
        const thread = profile.threads[0];

        // Also create a JS tracer profile.
        const jsTracerProfile = getProfileWithJsTracerEvents([
          ['Root', 0, 20],
          ['Node', 1, 19],
          ['https://mozilla.org', 2, 18],
          ['https://mozilla.org', 3, 16],
        ]);
        const { jsTracer } = jsTracerProfile.threads[0];
        const tracerStringArray = jsTracerProfile.shared.stringArray;

        if (!jsTracer) {
          throw new Error('Unable to find a JS tracer table');
        }

        // Merge the js tracer data into the profile.
        thread.jsTracer = jsTracer;
        for (
          let jsTracerIndex = 0;
          jsTracerIndex < jsTracer.length;
          jsTracerIndex++
        ) {
          // Map the old string to the new string.
          jsTracer.events[jsTracerIndex] = stringTable.indexForString(
            tracerStringArray[jsTracer.events[jsTracerIndex]]
          );
        }

        const foo = funcNamesDict['Foo.js'];
        const fooLine = 3;
        const fooColumn = 5;
        thread.funcTable.lineNumber[foo] = fooLine;
        thread.funcTable.columnNumber[foo] = fooColumn;
        thread.funcTable.fileName[foo] = stringTable.indexForString(
          'https://mozilla.org'
        );

        const bar = funcNamesDict['Bar.js'];
        const barLine = 7;
        const barColumn = 11;
        thread.funcTable.lineNumber[bar] = barLine;
        thread.funcTable.columnNumber[bar] = barColumn;
        thread.funcTable.fileName[bar] = stringTable.indexForString(
          'https://mozilla.org'
        );

        const baz = funcNamesDict['Baz.js'];
        // Use bar's line and column information.
        thread.funcTable.lineNumber[baz] = barLine;
        thread.funcTable.columnNumber[baz] = barColumn;
        thread.funcTable.fileName[baz] = stringTable.indexForString(
          'https://mozilla.org'
        );

        // Manually update the JS tracer events to point to the right column numbers.
        jsTracer.line[2] = fooLine;
        jsTracer.column[2] = fooColumn;
        jsTracer.line[3] = barLine;
        jsTracer.column[3] = barColumn;
      }

      expect(
        getHumanReadableJsTracerTiming({
          useSelfTime: false,
          profile,
        })
      ).toEqual([
        'Root (0:20)',
        'Node (1:19)',
        'ƒ Foo.js  https://mozilla.org (2:18)',
        '(multiple matching functions) https://mozilla.org (3:16)',
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
  profile,
}: {
  useSelfTime: boolean;
  events?: TestDefinedJsTracerEvent[];
  profile?: Profile;
}): string[] {
  if (!profile) {
    profile = getProfileWithJsTracerEvents(
      ensureExists(
        events,
        'Expected to have a list of tracer events when no profile was supplied.'
      )
    );
  }
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
