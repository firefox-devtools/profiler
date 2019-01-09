/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  getEmptyFuncTable,
  getEmptyFrameTable,
  getEmptyStackTable,
  getEmptySamplesTable,
  getEmptyRawMarkerTable,
} from './data-structures';
import { ensureExists } from '../utils/flow';

import type {
  JsTracerTable,
  IndexIntoStringTable,
  IndexIntoJsTracerEvents,
  IndexIntoStackTable,
  IndexIntoFuncTable,
  SamplesTable,
  Thread,
  CategoryList,
} from '../types/profile';
import type { JsTracerTiming } from '../types/profile-derived';
import type { Microseconds } from '../types/units';
import type { UniqueStringArray } from '../utils/unique-string-array';

/**
 * This function is very similar in implementation as getStackTimingByDepth.
 * It creates a list of JsTracerTiming entries that represent the underlying
 * tree structure of the tracing data. This is then used by the JS Tracer panel
 * to render the chart to the screen.
 *
 * The data looks visually something like this:
 *
 * [A------------------------]
 *    [B------][F----]  [H--]
 *       [C---] [G]
 *       [D][E]
 *
 * Where a single row, like B F H, would be one JsTracerTiming.
 */
export function getJsTracerTiming(
  jsTracer: JsTracerTable,
  stringTable: UniqueStringArray
): JsTracerTiming[] {
  const jsTracerTiming: JsTracerTiming[] = [];

  // Go through all of the events.
  for (
    let tracerEventIndex = 0;
    tracerEventIndex < jsTracer.length;
    tracerEventIndex++
  ) {
    const stringIndex = jsTracer.events[tracerEventIndex];
    const displayName = stringTable.getString(stringIndex);

    // Place the event in the closest row that is empty.
    for (let i = 0; i <= jsTracerTiming.length; i++) {
      // Get or create a row.
      let timingRow = jsTracerTiming[i];
      if (!timingRow) {
        timingRow = {
          start: [],
          end: [],
          index: [],
          label: [],
          name: 'Tracing Information',
          length: 0,
        };
        jsTracerTiming.push(timingRow);
      }

      // The timing is converted here from Microseconds to Milliseconds.
      const start = jsTracer.timestamps[tracerEventIndex] / 1000;
      const durationRaw = jsTracer.durations[tracerEventIndex];
      const duration = durationRaw === null ? 0 : durationRaw / 1000;

      // Since the events are sorted, look at the last added event in this row. If
      // the new event fits, go ahead and insert it.
      const otherEnd = timingRow.end[timingRow.length - 1];
      if (otherEnd === undefined || otherEnd <= start) {
        timingRow.start.push(start);
        timingRow.end.push(start + duration);
        timingRow.label.push(displayName);
        timingRow.index.push(tracerEventIndex);
        timingRow.length++;
        break;
      }
    }
  }

  return jsTracerTiming;
}

/**
 * Given JS tracer data:
 *
 *   [A------------------------------]
 *      [B-------][D--------------]
 *         [C--]      [E-------]
 *
 * Build this StackTable:
 *
 *   A -> B -> C
 *     \
 *        D -> E
 *
 * This data would then have the following self time:
 *
 *            0         10        20        30
 *   Time:    |123456789|123456789|123456789|12
 *   Node:    AAABBBCCCCBBBDDDDEEEEEEEEEEDDDAAA
 *   Sample:  ⎣A⎦⎣B⎦⎣C-⎦⎣B⎦⎣D-⎦⎣E-------⎦⎣D⎦⎣A⎦
 *
 * Insert a sample for each discrete bit of self time.
 *
 *   SampleTable = {
 *     stack:  [A,  B,  C,  B,  D,  E,  D,  A ],
 *     time:   [0,  3,  6,  10, 14, 17, 27, 30],
 *     weight: [3,  3,  4,  3,  4,  10, 3,  3 ]
 *   }
 */
export function convertJsTracerToThreadWithoutSamples(
  fromThread: Thread,
  jsTracer: JsTracerTable,
  categories: CategoryList
): {
  thread: Thread,
  stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable>,
} {
  // Create a new thread, with empty information, but preserve some of the existing
  // thread information.
  const funcTable = getEmptyFuncTable();
  const frameTable = getEmptyFrameTable();
  const stackTable = getEmptyStackTable();
  const samples = getEmptySamplesTable();
  const markers = getEmptyRawMarkerTable();
  const { stringTable } = fromThread;

  const sampleWeights = [];
  samples.weight = sampleWeights;
  samples.weightType = 'microseconds';

  const thread: Thread = {
    ...fromThread,
    markers,
    funcTable,
    stackTable,
    frameTable,
    samples,
  };

  // Keep a stack of js tracer events, and end timings, that will be used to find
  // the stack prefixes. Once a JS tracer event starts past another event end, the
  // stack will be "popped" but decrementing the unmatchedIndex.
  let unmatchedIndex = 0;
  const unmatchedEventIndexes = [null];
  const unmatchedEventEnds = [0];

  // Build up maps between index values.
  const funcMap: Map<IndexIntoStringTable, IndexIntoFuncTable> = new Map();
  const stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable> = new Map();

  // Get some computed values before entering the loop.
  const blankStringIndex = stringTable.indexForString('');
  const otherCategory = categories.findIndex(c => c.name === 'Other');
  if (otherCategory === -1) {
    throw new Error("Expected to find an 'Other' category.");
  }

  // Go through all of the JS tracer events, and build up the func, stack, and
  // frame tables.
  for (
    let tracerEventIndex = 0;
    tracerEventIndex < jsTracer.length;
    tracerEventIndex++
  ) {
    // Look up various values for this event.
    const stringIndex = jsTracer.events[tracerEventIndex];
    const start = jsTracer.timestamps[tracerEventIndex];
    const durationRaw = jsTracer.durations[tracerEventIndex];
    const duration = durationRaw === null ? 0 : durationRaw;
    const end = start + duration;

    let funcIndex = funcMap.get(stringIndex);
    if (funcIndex === undefined) {
      // Create a new function only if the event string is different.
      funcIndex = funcTable.length++;
      funcTable.address.push(0);
      funcTable.name.push(stringIndex);
      funcTable.isJS.push(false);
      funcTable.resource.push(-1);
      funcTable.relevantForJS.push(true);
      funcTable.fileName.push(null);
      funcTable.lineNumber.push(null);
      funcTable.columnNumber.push(null);

      funcMap.set(stringIndex, funcIndex);
    }

    // Every event gets a unique frame entry.
    const frameIndex = frameTable.length++;
    frameTable.address.push(blankStringIndex);
    frameTable.category.push(otherCategory);
    frameTable.func.push(funcIndex);
    // TODO - We could figure this out, by tracking what the callee was.
    frameTable.implementation.push(null);
    frameTable.line.push(null);
    frameTable.column.push(null);
    frameTable.optimizations.push(null);

    // Try to find the prefix stack for this event.
    let prefixIndex = unmatchedEventIndexes[unmatchedIndex];
    while (prefixIndex !== null) {
      const otherEnd = unmatchedEventEnds[unmatchedIndex];
      if (end <= otherEnd) {
        break;
      }
      // Keep on searching for the next prefix.
      prefixIndex = unmatchedEventIndexes[unmatchedIndex];
      unmatchedIndex--;
    }

    // Each event gets a stack table entry.
    const stackIndex = stackTable.length++;
    stackTable.frame.push(frameIndex);
    stackTable.category.push(otherCategory);
    stackTable.prefix.push(prefixIndex);
    stackMap.set(tracerEventIndex, stackIndex);

    // Add this stack to the unmatched stacks of events.
    unmatchedIndex++;
    if (unmatchedIndex === 0) {
      // Reached a new root, reset the index to 1.
      unmatchedIndex = 1;
    }
    unmatchedEventIndexes[unmatchedIndex] = tracerEventIndex;
    unmatchedEventEnds[unmatchedIndex] = end;
  }

  return { thread, stackMap };
}

export function convertJsTracerToThread(
  fromThread: Thread,
  jsTracer: JsTracerTable,
  categories: CategoryList
): Thread {
  const { thread, stackMap } = convertJsTracerToThreadWithoutSamples(
    fromThread,
    jsTracer,
    categories
  );
  thread.samples = getSelfTimeSamplesFromJsTracer(thread, jsTracer, stackMap);
  return thread;
}

/**
 * Determine the self time for JS Tracer events. This generates a row of timing
 * information for each type event. This function walks the stack structure of JS Tracer
 * events, and determines what's actually executing at a given time.
 *
 * The data visually would look something like this:
 *
 * A: [----]          [-----]
 * B:       [-----]
 * C:              [-]       [--]
 * D:                            [----]
 *
 * Where "A" would be the name of the event, and the boxes in that row would be the self
 * time. Each row is stored as a JsTracerTiming.
 */
export function getJsTracerLeafTiming(
  jsTracer: JsTracerTable,
  stringTable: UniqueStringArray
): JsTracerTiming[] {
  // Each event type will have it's own timing information, later collapse these into
  // a single array.
  const jsTracerTimingMap: Map<string, JsTracerTiming> = new Map();
  const isUrlCache = [];
  const isUrlRegex = /:\/\//;

  function isUrl(index: IndexIntoStringTable): boolean {
    const cachedIsUrl = isUrlCache[index];
    if (cachedIsUrl !== undefined) {
      return cachedIsUrl;
    }
    const booleanValue = isUrlRegex.test(stringTable.getString(index));
    isUrlCache[index] = booleanValue;
    return booleanValue;
  }

  // This function reports self time in the correct row of JsTracerTiming in
  // jsTracerTimingMap, based on the event that is passed to it.
  function reportSelfTime(
    tracerEventIndex: number,
    start: Microseconds,
    end: Microseconds
  ): void {
    if (start === end) {
      // If this self time is 0, do not report it.
      return;
    }
    const stringIndex = jsTracer.events[tracerEventIndex];
    const displayName = stringTable.getString(stringIndex);
    // Event names are either some specific event in the JS engine, or it is the URL
    // of the script that is executing. Put all of the URL events into a single row
    // labeled 'Script'.
    const rowName = isUrl(stringIndex) ? 'Script' : displayName;
    let timingRow = jsTracerTimingMap.get(rowName);
    if (timingRow === undefined) {
      timingRow = {
        start: [],
        end: [],
        index: [],
        label: [],
        name: rowName,
        length: 0,
      };
      jsTracerTimingMap.set(rowName, timingRow);
    }

    {
      // Perform sanity checks on the data that is being added.
      const currStart = timingRow.start[timingRow.length - 1];
      const currEnd = timingRow.end[timingRow.length - 1];
      const prevEnd = timingRow.end[timingRow.length - 2];
      if (end < start) {
        throw new Error('end is less than the start');
      }
      if (currEnd < currStart) {
        throw new Error(
          `currEnd < currStart "${displayName} - ${currEnd} < ${currStart}"`
        );
      }
      if (currStart < prevEnd) {
        throw new Error(
          `currStart < prevEnd "${displayName} - ${currStart} < ${prevEnd}"`
        );
      }
    }

    // Convert the timing to milliseconds.
    timingRow.start.push(start / 1000);
    timingRow.end.push(end / 1000);
    timingRow.label.push(displayName);
    timingRow.index.push(tracerEventIndex);
    timingRow.length++;
  }

  // Determine the self time of the various events.

  // These arrays implement the stack of "prefix" events. This is implemented as 3
  // arrays instead of an array of objects to reduce the GC pressure in this tight
  // loop, but conceptually this is just one stack, not 3 stacks. At any given time,
  // the stack represents the prefixes, aka the parents, of the current event.
  const prefixesStarts: Microseconds[] = [];
  const prefixesEnds: Microseconds[] = [];
  const prefixesEventIndexes: IndexIntoJsTracerEvents[] = [];

  // If there is no prefix, set it to -1. This simplifies some of the real-time
  // type checks that would be required by Flow for this mutable variable.
  let prefixesTip = -1;

  // Go through all of the events. Each `if` branch is documented with a small diagram
  // that includes a little bit of ascii art to help explain the step.
  //
  // Legend:
  // xxxxxxxx - Already reported information, not part of the prefix stack.
  // [======] - Some event on the stack that has not been reported.
  // [prefix] - The prefix event to consider, the top of the prefix stack. This
  //            could also be only part of an event, that has been split into multiple
  //            pieces.
  // [current] - The current event to add.

  for (
    let currentEventIndex = 0;
    currentEventIndex < jsTracer.length;
    currentEventIndex++
  ) {
    const currentStart = jsTracer.timestamps[currentEventIndex];
    const durationRaw = jsTracer.durations[currentEventIndex];
    const duration = durationRaw === null ? 0 : durationRaw;
    const currentEnd = currentStart + duration;

    if (prefixesTip === -1) {
      // Nothing has been added yet, add this "current" event to the stack of prefixes.
      prefixesTip = 0;
      prefixesStarts[prefixesTip] = currentStart;
      prefixesEnds[prefixesTip] = currentEnd;
      prefixesEventIndexes[prefixesTip] = currentEventIndex;
      continue;
    }

    while (true) {
      const prefixStart = prefixesStarts[prefixesTip];
      const prefixEnd = prefixesEnds[prefixesTip];
      const prefixEventIndex = prefixesEventIndexes[prefixesTip];

      // The following if/else blocks go through every potential case of timing for the
      // the data, and finally throw if those cases weren't handled. Each block should
      // have a diagram explaining the various states the timing can be in. Inside the
      // if checks, the loop is either continued or broken.

      if (prefixEnd <= currentStart) {
        // In this case, the "current" event has passed the other "prefix" event.
        //
        //    xxxxxxxxxxxxxxxx[================]
        //    xxxxxxxx[======]     [current]
        //    [prefix]
        //
        // This next step would match too:
        //
        //    xxxxxxxxxxxxxxxx[================]
        //    xxxxxxxx[prefix]     [current]
        //    xxxxxxxx

        // Commit the previous "prefix" event, then continue on with this loop.
        reportSelfTime(prefixEventIndex, prefixStart, prefixEnd);

        // Move the tip towards the prefix.
        prefixesTip--;

        if (prefixesTip === -1) {
          // This next step would match too:
          //
          //   [prefix]     [current]

          // There are no more "prefix" events to commit. Add the "current" event on, and
          // break out of this loop.
          prefixesTip = 0;
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
          prefixesStarts[prefixesTip] = currentStart;
          prefixesEnds[prefixesTip] = currentEnd;
          break;
        }

        // Move up the prefix stack to report more self times. This is the only branch
        // that has a `continue`, and not a `break`.
        continue;
      } else if (prefixEnd > currentEnd) {
        // The current event occludes the prefix event.
        //
        //   [prefix=================]
        //           [current]
        //
        // Split the reported self time of the prefix.
        //
        //   [prefix]xxxxxxxxx[prefix]
        //           [current]
        //
        //                    ^leave the second prefix piece on the "prefixes" stack
        //   ^report the first prefix piece
        //
        //   After reporting we are left with:
        //
        //   xxxxxxxxxxxxxxxxx[======]
        //           [current]

        // Report the first part of the prefix's self time.
        reportSelfTime(prefixEventIndex, prefixStart, currentStart);

        // Shorten the prefix's start time.
        prefixesStarts[prefixesTip] = currentEnd;

        // Now add on the "current" event to the stack of prefixes.
        prefixesTip++;
        prefixesStarts[prefixesTip] = currentStart;
        prefixesEnds[prefixesTip] = currentEnd;
        prefixesEventIndexes[prefixesTip] = currentEventIndex;
        break;
      } else if (prefixEnd === currentEnd) {
        if (prefixStart !== currentStart) {
          // The current event splits the event above it, so split the reported self
          // time of the prefix.
          //
          //   [prefix]xxxxxxxxx
          //           [current]

          // Report the prefix's self time.
          reportSelfTime(prefixEventIndex, prefixStart, currentStart);

          // Update both the index and the start time.
          prefixesStarts[prefixesTip] = currentStart;
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
        } else {
          // The prefix and current events completely match, so don't report any
          // self time from the prefix. Replace the prefix's index.
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
        }
        break;
      } else {
        // There is some error in the data structure or this functions logic. Throw
        // and error, and report some nice information to the console.
        const prefixName = stringTable.getString(
          jsTracer.events[prefixEventIndex]
        );
        const currentName = stringTable.getString(
          jsTracer.events[currentEventIndex]
        );
        console.error('Current JS Tracer information:', {
          jsTracer,
          stringTable,
          prefixEventIndex,
          currentEventIndex,
        });
        console.error(
          `Prefix (parent) times for "${prefixName}": ${prefixStart}ms to ${prefixEnd}ms`
        );
        console.error(
          `Current (child) times for "${currentName}": ${currentStart}ms to ${currentEnd}ms`
        );
        throw new Error(
          'The JS Tracer information was malformed. Some event lasted longer than its parent event.'
        );
      }
    }
  }

  // Drain off the remaining "prefixes" from the stack, and report the self time.
  for (; prefixesTip >= 0; prefixesTip--) {
    reportSelfTime(
      prefixesEventIndexes[prefixesTip],
      prefixesStarts[prefixesTip],
      prefixesEnds[prefixesTip]
    );
  }

  // Return the list of events, sorted alphabetically.
  return [...jsTracerTimingMap.values()].sort((a, b) => {
    if (a.name > b.name) {
      return 1;
    }

    if (a.name < b.name) {
      return -1;
    }

    return 0;
  });
}

export function getSelfTimeSamplesFromJsTracer(
  thread: Thread,
  jsTracer: JsTracerTable,
  stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable>
): SamplesTable {
  // Each event type will have it's own timing information, later collapse these into
  // a single array.
  const { stringTable } = thread;
  const samples = getEmptySamplesTable();
  const sampleWeights = [];
  samples.weight = sampleWeights;
  samples.weightType = 'microseconds';

  function addSelfTimeAsASample(
    eventIndex: IndexIntoJsTracerEvents,
    start: Microseconds,
    end: Microseconds
  ): void {
    if (start === end) {
      // If this self time is 0, do not report it.
      return;
    }
    const stackIndex = ensureExists(
      stackMap.get(eventIndex),
      'The JS tracer event did not exist in the stack map.'
    );
    samples.stack.push(stackIndex);
    samples.time.push(
      // Convert from microseconds.
      start / 1000
    );
    samples.rss.push(null);
    samples.uss.push(null);
    sampleWeights.push(
      // The weight of the sample is in microseconds.
      end - start
    );
    samples.length++;
  }
  // Determine the self time of the various events.

  // These arrays implement the stack of "prefix" events. This is implemented as 3
  // arrays instead of an array of objects to reduce the GC pressure in this tight
  // loop, but conceptually this is just one stack, not 3 stacks. At any given time,
  // the stack represents the prefixes, aka the parents, of the current event.
  const prefixesStarts: Microseconds[] = [];
  const prefixesEnds: Microseconds[] = [];
  const prefixesEventIndexes: IndexIntoJsTracerEvents[] = [];

  // If there is no prefix, set it to -1. This simplifies some of the real-time
  // type checks that would be required by Flow for this mutable variable.
  let prefixesTip = -1;

  // Go through all of the events. Each `if` branch is documented with a small diagram
  // that includes a little bit of ascii art to help explain the step.
  //
  // Legend:
  // xxxxxxxx - Already reported information, not part of the prefix stack.
  // [======] - Some event on the stack that has not been reported.
  // [prefix] - The prefix event to consider, the top of the prefix stack. This
  //            could also be only part of an event, that has been split into multiple
  //            pieces.
  // [current] - The current event to add.

  for (
    let currentEventIndex = 0;
    currentEventIndex < jsTracer.length;
    currentEventIndex++
  ) {
    const currentStart = jsTracer.timestamps[currentEventIndex];
    const durationRaw = jsTracer.durations[currentEventIndex];
    const duration = durationRaw === null ? 0 : durationRaw;
    const currentEnd = currentStart + duration;

    if (prefixesTip === -1) {
      // Nothing has been added yet, add this "current" event to the stack of prefixes.
      prefixesTip = 0;
      prefixesStarts[prefixesTip] = currentStart;
      prefixesEnds[prefixesTip] = currentEnd;
      prefixesEventIndexes[prefixesTip] = currentEventIndex;
      continue;
    }

    while (true) {
      const prefixStart = prefixesStarts[prefixesTip];
      const prefixEnd = prefixesEnds[prefixesTip];
      const prefixEventIndex = prefixesEventIndexes[prefixesTip];

      // The following if/else blocks go through every potential case of timing for the
      // the data, and finally throw if those cases weren't handled. Each block should
      // have a diagram explaining the various states the timing can be in. Inside the
      // if checks, the loop is either continued or broken.

      if (prefixEnd <= currentStart) {
        // In this case, the "current" event has passed the other "prefix" event.
        //
        //    xxxxxxxxxxxxxxxx[================]
        //    xxxxxxxx[======]     [current]
        //    [prefix]
        //
        // This next step would match too:
        //
        //    xxxxxxxxxxxxxxxx[================]
        //    xxxxxxxx[prefix]     [current]
        //    xxxxxxxx

        // Commit the previous "prefix" event, then continue on with this loop.
        addSelfTimeAsASample(prefixEventIndex, prefixStart, prefixEnd);

        // Move the tip towards the prefix.
        prefixesTip--;

        if (prefixesTip === -1) {
          // This next step would match too:
          //
          //   [prefix]     [current]

          // There are no more "prefix" events to commit. Add the "current" event on, and
          // break out of this loop.
          prefixesTip = 0;
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
          prefixesStarts[prefixesTip] = currentStart;
          prefixesEnds[prefixesTip] = currentEnd;
          break;
        }

        // Move up the prefix stack to report more self times. This is the only branch
        // that has a `continue`, and not a `break`.
        continue;
      } else if (prefixEnd > currentEnd) {
        // The current event occludes the prefix event.
        //
        //   [prefix=================]
        //           [current]
        //
        // Split the reported self time of the prefix.
        //
        //   [prefix]xxxxxxxxx[prefix]
        //           [current]
        //
        //                    ^leave the second prefix piece on the "prefixes" stack
        //   ^report the first prefix piece
        //
        //   After reporting we are left with:
        //
        //   xxxxxxxxxxxxxxxxx[======]
        //           [current]

        // Report the first part of the prefix's self time.
        addSelfTimeAsASample(prefixEventIndex, prefixStart, currentStart);

        // Shorten the prefix's start time.
        prefixesStarts[prefixesTip] = currentEnd;

        // Now add on the "current" event to the stack of prefixes.
        prefixesTip++;
        prefixesStarts[prefixesTip] = currentStart;
        prefixesEnds[prefixesTip] = currentEnd;
        prefixesEventIndexes[prefixesTip] = currentEventIndex;
        break;
      } else if (prefixEnd === currentEnd) {
        if (prefixStart !== currentStart) {
          // The current event splits the event above it, so split the reported self
          // time of the prefix.
          //
          //   [prefix]xxxxxxxxx
          //           [current]

          // Report the prefix's self time.
          addSelfTimeAsASample(prefixEventIndex, prefixStart, currentStart);

          // Update both the index and the start time.
          prefixesStarts[prefixesTip] = currentStart;
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
        } else {
          // The prefix and current events completely match, so don't report any
          // self time from the prefix. Replace the prefix's index.
          prefixesEventIndexes[prefixesTip] = currentEventIndex;
        }
        break;
      } else {
        // There is some error in the data structure or this functions logic. Throw
        // and error, and report some nice information to the console.
        const prefixName = stringTable.getString(
          jsTracer.events[prefixEventIndex]
        );
        const currentName = stringTable.getString(
          jsTracer.events[currentEventIndex]
        );
        console.error('Current JS Tracer information:', {
          jsTracer,
          stringTable,
          prefixEventIndex,
          currentEventIndex,
        });
        console.error(
          `Prefix (parent) times for "${prefixName}": ${prefixStart}ms to ${prefixEnd}ms`
        );
        console.error(
          `Current (child) times for "${currentName}": ${currentStart}ms to ${currentEnd}ms`
        );
        throw new Error(
          'The JS Tracer information was malformed. Some event lasted longer than its parent event.'
        );
      }
    }
  }

  // Drain off the remaining "prefixes" from the stack, and report the self time.
  for (; prefixesTip >= 0; prefixesTip--) {
    addSelfTimeAsASample(
      prefixesEventIndexes[prefixesTip],
      prefixesStarts[prefixesTip],
      prefixesEnds[prefixesTip]
    );
  }

  return samples;
}
