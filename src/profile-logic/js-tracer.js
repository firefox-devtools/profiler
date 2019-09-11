/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  JsTracerTable,
  IndexIntoStringTable,
  IndexIntoJsTracerEvents,
  IndexIntoFuncTable,
  Thread,
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
  thread: Thread
): JsTracerTiming[] {
  const jsTracerTiming: JsTracerTiming[] = [];
  const { stringTable, funcTable } = thread;

  // Create a map that keys off of the string `${fileName}:${line}:${column}`. This maps
  // the JS tracer script locations to functions in the profiling data structure.
  // This operation can fail, as there is no guarantee that every location in the JS
  // tracer information was sampled.
  const keyToFuncIndex: Map<string, IndexIntoFuncTable | null> = new Map();
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    if (!funcTable.isJS[funcIndex]) {
      continue;
    }
    const line = funcTable.lineNumber[funcIndex];
    const column = funcTable.columnNumber[funcIndex];
    const fileNameIndex = funcTable.fileName[funcIndex];
    if (line !== null && column !== null && fileNameIndex !== null) {
      const fileName = stringTable.getString(fileNameIndex);
      const key = `${fileName}:${line}:${column}`;
      if (keyToFuncIndex.has(key)) {
        // Multiple functions map to this script location.
        keyToFuncIndex.set(key, null);
      } else {
        keyToFuncIndex.set(key, funcIndex);
      }
    }
  }

  // Go through all of the events.
  for (
    let tracerEventIndex = 0;
    tracerEventIndex < jsTracer.length;
    tracerEventIndex++
  ) {
    const stringIndex = jsTracer.events[tracerEventIndex];
    const column = jsTracer.column[tracerEventIndex];
    const line = jsTracer.line[tracerEventIndex];

    // By default we use the display name from JS tracer, but we may update it if
    // we can figure out more information about it.
    let displayName = stringTable.getString(stringIndex);

    // We may have deduced the funcIndex in the keyToFuncIndex Map.
    let funcIndex: null | IndexIntoFuncTable = null;

    if (column !== null && line !== null) {
      // There is both a column and line number for this script. Look up to see if this
      // script location has a function in the sampled data. This is a simple way
      // to tie together the JS tracer information with the Gecko profiler's stack
      // walking.
      const key = `${displayName}:${line}:${column}`;
      const funcIndexInMap = keyToFuncIndex.get(key);

      if (funcIndexInMap !== undefined) {
        if (funcIndexInMap === null) {
          // This is probably a failure case in our source information.
          displayName = `(multiple matching functions) ${displayName}`;
        } else {
          // Update the information with the function that was found.
          funcIndex = funcIndexInMap;
          displayName = `ƒ ${stringTable.getString(
            funcTable.name[funcIndex]
          )}  ${displayName}`;
        }
      }
    }

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
          func: [],
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
        timingRow.func.push(funcIndex);
        timingRow.length++;
        break;
      }
    }
  }

  return jsTracerTiming;
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
        func: [],
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
    // The end needs to be adjustable in case there are precision errors.
    let currentEnd = currentStart + duration;

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

      if (
        prefixStart <= currentStart &&
        prefixEnd > currentStart &&
        prefixEnd < currentEnd
      ) {
        // This check handles precision errors that creates timing like so:
        //    [prefix=======]
        //       [current========]
        //
        // It reformats the current as:
        //
        //    [prefix=======]
        //       [current===]
        currentEnd = prefixEnd;
      }

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
          'The JS Tracer algorithm encountered some data it could not handle.'
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
