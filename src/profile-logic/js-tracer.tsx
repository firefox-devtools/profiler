/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  getEmptyFrameTable,
  getEmptyRawStackTable,
  getEmptySamplesTableWithEventDelay,
  getEmptyRawMarkerTable,
} from './data-structures';
import { StringTable } from '../utils/string-table';
import { ensureExists } from '../utils/flow';
import {
  JsTracerTable,
  IndexIntoStringTable,
  IndexIntoJsTracerEvents,
  IndexIntoFuncTable,
  RawThread,
  IndexIntoStackTable,
  RawSamplesTable,
  CategoryList,
  JsTracerTiming,
  Microseconds,
} from 'firefox-profiler/types';

// See the function below for more information.
type ScriptLocationToFuncIndex = Map<string, IndexIntoFuncTable | null>;

/**
 * Create a map that keys off of the string `${fileName}:${line}:${column}`. This maps
 * the JS tracer script locations to functions in the profiling data structure.
 * This operation can fail, as there is no guarantee that every location in the JS
 * tracer information was sampled.
 */
function getScriptLocationToFuncIndex(
  thread: RawThread,
  stringTable: StringTable
): ScriptLocationToFuncIndex {
  const { funcTable } = thread;
  const scriptLocationToFuncIndex = new Map();
  for (let funcIndex = 0; funcIndex < funcTable.length; funcIndex++) {
    if (!funcTable.isJS[funcIndex]) {
      continue;
    }
    const line = funcTable.lineNumber[funcIndex];
    const column = funcTable.columnNumber[funcIndex];
    const fileNameIndex = funcTable.fileName[funcIndex];
    if (column !== null && line !== null && fileNameIndex !== null) {
      const fileName = stringTable.getString(fileNameIndex);
      const key = `${fileName}:${line}:${column}`;
      if (scriptLocationToFuncIndex.has(key)) {
        // Multiple functions map to this script location.
        scriptLocationToFuncIndex.set(key, null);
      } else {
        scriptLocationToFuncIndex.set(key, funcIndex);
      }
    }
  }
  return scriptLocationToFuncIndex;
}

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
  thread: RawThread,
  stringTable: StringTable
): JsTracerTiming[] {
  const jsTracerTiming: JsTracerTiming[] = [];
  const { funcTable } = thread;

  // This has already been computed by the conversion of the JS tracer structure to
  // a thread, but it's probably not worth the complexity of caching this object.
  // Just recompute it.
  const scriptLocationToFuncIndex = getScriptLocationToFuncIndex(
    thread,
    stringTable
  );

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

    // We may have deduced the funcIndex in the scriptLocationToFuncIndex Map.
    let funcIndex: null | IndexIntoFuncTable = null;

    if (column !== null && line !== null) {
      // There is both a column and line number for this script. Look up to see if this
      // script location has a function in the sampled data. This is a simple way
      // to tie together the JS tracer information with the Gecko profiler's stack
      // walking.
      const scriptLocation = `${displayName}:${line}:${column}`;
      const funcIndexInMap = scriptLocationToFuncIndex.get(scriptLocation);

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
  stringTable: StringTable
): JsTracerTiming[] {
  // Each event type will have it's own timing information, later collapse these into
  // a single array.
  const jsTracerTimingMap: Map<string, JsTracerTiming> = new Map();
  const isUrlCache: boolean[] = [];
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

/**
 * This function builds a Thread structure without any samples. It derives the functions
 * and stacks from the JS Tracer data.

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
 * This function is also in charge of matching up JS tracer events that have script
 * locations to functions that we sampled in the Gecko Profiler sampling mechanism.
 * If an event shares the same script location, row, and column numbers as a JS
 * function, then the function information is used.
 */
export function convertJsTracerToThreadWithoutSamples(
  fromThread: RawThread,
  stringTable: StringTable,
  jsTracer: JsTracerFixed,
  categories: CategoryList
): {
  thread: RawThread;
  stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable>;
} {
  // Create a new thread, with empty information, but preserve some of the existing
  // thread information.
  const frameTable = getEmptyFrameTable();
  const stackTable = getEmptyRawStackTable();
  const samples: RawSamplesTable = {
    ...getEmptySamplesTableWithEventDelay(),
    weight: [],
    weightType: 'tracing-ms',
  };
  const markers = getEmptyRawMarkerTable();
  const funcTable = { ...fromThread.funcTable };

  const thread: RawThread = {
    ...fromThread,
    markers,
    funcTable,
    stackTable,
    frameTable,
    samples,
  };

  // Keep a stack of js tracer events, and end timings, that will be used to find
  // the stack prefixes. Once a JS tracer event starts past another event end, the
  // stack will be "popped" by decrementing the unmatchedIndex.
  let unmatchedIndex = 0;
  const unmatchedEventIndexes = [null];
  const unmatchedEventEnds = [0];

  // Build up maps between index values.
  const funcMap: Map<IndexIntoStringTable, IndexIntoFuncTable> = new Map();
  const stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable> = new Map();

  // Get some computed values before entering the loop.
  const blankStringIndex = stringTable.indexForString('');
  const otherCategory = categories.findIndex((c) => c.name === 'Other');
  if (otherCategory === -1) {
    throw new Error("Expected to find an 'Other' category.");
  }
  const scriptLocationToFuncIndex = getScriptLocationToFuncIndex(
    thread,
    stringTable
  );

  // Go through all of the JS tracer events, and build up the func, stack, and
  // frame tables.
  for (
    let tracerEventIndex = 0;
    tracerEventIndex < jsTracer.length;
    tracerEventIndex++
  ) {
    // Look up various values for this event.
    const eventStringIndex = jsTracer.events[tracerEventIndex];
    const eventName = stringTable.getString(eventStringIndex);
    const end = jsTracer.end[tracerEventIndex];
    const column = jsTracer.column[tracerEventIndex];
    const line = jsTracer.line[tracerEventIndex];
    let funcIndex: null | IndexIntoFuncTable = null;

    // First try to look up the func index by script location.
    if (column !== null && line !== null) {
      // Look up to see if this script location has a function in the sampled data.
      const key = `${eventName}:${line}:${column}`;
      const maybeFuncIndex = scriptLocationToFuncIndex.get(key);
      if (maybeFuncIndex !== undefined && maybeFuncIndex !== null) {
        funcIndex = maybeFuncIndex;
        funcMap.set(eventStringIndex, funcIndex);
      }
    }

    if (funcIndex === null) {
      const generatedFuncIndex = funcMap.get(eventStringIndex);
      if (generatedFuncIndex === undefined) {
        // Create a new function only if the event string is different.
        funcIndex = funcTable.length++;
        funcTable.name.push(eventStringIndex);
        funcTable.isJS.push(false);
        funcTable.resource.push(-1);
        funcTable.relevantForJS.push(true);
        funcTable.fileName.push(null);
        funcTable.lineNumber.push(null);
        funcTable.columnNumber.push(null);

        funcMap.set(eventStringIndex, funcIndex);
      } else {
        funcIndex = generatedFuncIndex;
      }
    }

    // Try to find the prefix stack for this event.
    let prefixIndex = unmatchedEventIndexes[unmatchedIndex];
    while (prefixIndex !== null) {
      const prefixEnd = unmatchedEventEnds[unmatchedIndex];
      if (end <= prefixEnd) {
        // This prefix is the correct one.
        break;
      }
      // Keep on searching for the next prefix.
      prefixIndex = unmatchedEventIndexes[unmatchedIndex];
      unmatchedIndex--;
    }

    // Every event gets a unique frame entry.
    const frameIndex = frameTable.length++;
    frameTable.address.push(blankStringIndex);
    frameTable.inlineDepth.push(0);
    frameTable.category.push(otherCategory);
    frameTable.func.push(funcIndex);
    frameTable.nativeSymbol.push(null);
    frameTable.innerWindowID.push(0);
    frameTable.line.push(line);
    frameTable.column.push(column);

    // Each event gets a stack table entry.
    const stackIndex = stackTable.length++;
    stackTable.frame.push(frameIndex);
    stackTable.prefix.push(prefixIndex);
    stackMap.set(tracerEventIndex, stackIndex);

    // Add this stack to the unmatched stacks of events.
    unmatchedIndex++;
    if (unmatchedIndex === 0) {
      // Reached a new root, reset the index to 1.
      unmatchedIndex = 1;
    }
    (unmatchedEventIndexes as any)[unmatchedIndex] = tracerEventIndex;
    unmatchedEventEnds[unmatchedIndex] = end;
  }

  return { thread, stackMap };
}

type JsTracerFixed = {
  events: Array<IndexIntoStringTable>;
  start: Array<Microseconds>;
  end: Array<Microseconds>;
  line: Array<number | null>; // Line number.
  column: Array<number | null>; // Column number.
  length: number;
};

/**
 * JS Tracer information has a start and duration, but due to precision issues, this
 * can lead to errors with computing parent/child relationships. This function converts
 * it into a start and end time, and corrects issues where the events incorrectly
 * overlap.
 */
export function getJsTracerFixed(jsTracer: JsTracerTable): JsTracerFixed {
  if (jsTracer.length === 0) {
    // Create an empty "fixed" table, we can't use getEmptyJsTracerTable here
    // because the "fixed" one is slightly different.
    return {
      events: [],
      start: [],
      end: [],
      line: [],
      column: [],
      length: 0,
    };
  }
  let prevStart = jsTracer.timestamps[0];
  let prevEnd = prevStart + (jsTracer.durations![0] || 0);
  const start = [prevStart];
  const end = [prevEnd];
  const jsTracerFixed = {
    events: jsTracer.events,
    start,
    end,
    line: jsTracer.line,
    column: jsTracer.column,
    length: jsTracer.length,
  };
  for (let eventIndex = 1; eventIndex < jsTracer.length; eventIndex++) {
    const duration = jsTracer.durations[eventIndex];
    let currStart = jsTracer.timestamps[eventIndex];
    let currEnd = currStart + (duration === null ? 0 : duration);

    // The following if branches were produced to enumerate through all possible
    // overlapping cases.
    if (currStart < prevStart) {
      if (prevStart < currEnd) {
        //                       | Adjust to this:
        // prev:        [-----]  |    [----]
        // curr:  [---------]    |    [---]
        currStart = prevStart;
      } else {
        //                       | Adjust to this:
        // prev:        [-----]  |    [----]
        // curr: [---]           |    [---]
        const duration = currEnd - currStart;
        currStart = prevStart;
        currEnd = Math.min(prevEnd, currStart + duration);
      }
    } else {
      if (currEnd < prevEnd) {
        // No adjustment needed
        // prev: [-----]
        // curr:  [--]
      } else {
        if (prevEnd <= currStart) {
          // There is no need to adjust the timing.
          // prev: [----]
          // curr:         [----]
        } else {
          if (prevEnd - currStart < currEnd - prevEnd) {
            // Fix the timing       | Adjust to this:
            // prev: [---]          | [---][----]
            // curr:    [-----]     |
            currStart = prevEnd;
          } else {
            // Fix the timing       | Adjust to this:
            // prev: [----]         | [----]
            // curr:   [---]        |   [--]
            currEnd = prevEnd;
          }
        }
      }
    }

    start.push(currStart);
    end.push(currEnd);

    prevStart = currStart;
    prevEnd = currEnd;
  }
  return jsTracerFixed;
}

/**
 * This function controls all of the finer-grained steps to convert JS Tracer information
 * into Thread data structure. See each of those functions for more documentation on
 * what is going on.
 */
export function convertJsTracerToThread(
  fromThread: RawThread,
  jsTracer: JsTracerTable,
  categories: CategoryList,
  stringTable: StringTable
): RawThread {
  const jsTracerFixed = getJsTracerFixed(jsTracer);
  const { thread, stackMap } = convertJsTracerToThreadWithoutSamples(
    fromThread,
    stringTable,
    jsTracerFixed,
    categories
  );
  thread.samples = getSelfTimeSamplesFromJsTracer(
    stringTable,
    jsTracerFixed,
    stackMap
  );
  return thread;
}

/**
 * This function walks along the end of the JS tracer events, pushing and popping events
 * on to a stack. It then determines the self time for the events, and translates the
 * self time into individual weighted samples in the SamplesTable.
 *
 * Given JS tracer data:
 *
 *   [A------------------------------]
 *      [B-------][D--------------]
 *         [C--]      [E-------]
 *
 * This StackTable is generated in convertJsTracerToThreadWithoutSamples:
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
export function getSelfTimeSamplesFromJsTracer(
  stringTable: StringTable,
  jsTracer: JsTracerFixed,
  stackMap: Map<IndexIntoJsTracerEvents, IndexIntoStackTable>
): RawSamplesTable {
  // Give more leeway for floating number precision issues.
  const epsilon = 1e-5;
  const isNearlyEqual = (a: number, b: number) => Math.abs(a - b) < epsilon;
  // Each event type will have it's own timing information, later collapse these into
  // a single array.
  const samples = getEmptySamplesTableWithEventDelay();
  const sampleWeights: number[] = [];
  samples.weight = sampleWeights;

  function addSelfTimeAsASample(
    eventIndex: IndexIntoJsTracerEvents,
    start: Microseconds,
    end: Microseconds
  ): void {
    // Use a check against the epsilon, for float precision issues.
    if (isNearlyEqual(start, end)) {
      // If this self time is 0, do not report it.
      return;
    }
    const stackIndex = ensureExists(
      stackMap.get(eventIndex),
      'The JS tracer event did not exist in the stack map.'
    );
    samples.stack.push(stackIndex);
    ensureExists(samples.time).push(
      // Convert from microseconds.
      start / 1000
    );
    sampleWeights.push(
      // The weight of the sample is in microseconds.
      (end - start) / 1000
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
    const currentStart = jsTracer.start[currentEventIndex];
    const currentEnd = jsTracer.end[currentEventIndex];

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

      if (prefixEnd <= currentStart + epsilon) {
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
      } else if (currentEnd < prefixEnd + epsilon) {
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
      } else if (isNearlyEqual(prefixEnd, currentEnd)) {
        if (!isNearlyEqual(prefixStart, currentStart)) {
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
        // an error, and report some nice information to the console.
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
