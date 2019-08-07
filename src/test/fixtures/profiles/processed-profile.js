/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  getEmptyProfile,
  getEmptyThread,
  getEmptyJsTracerTable,
  resourceTypes,
  getEmptyJsAllocationsTable,
} from '../../../profile-logic/data-structures';
import { mergeProfiles } from '../../../profile-logic/comparison';
import { stateFromLocation } from '../../../app-logic/url-handling';
import { UniqueStringArray } from '../../../utils/unique-string-array';

import type {
  Profile,
  Thread,
  ThreadIndex,
  IndexIntoCategoryList,
  CategoryList,
  JsTracerTable,
  Counter,
} from '../../../types/profile';
import type {
  MarkerPayload,
  NetworkPayload,
  NavigationMarkerPayload,
} from '../../../types/markers';
import type { Milliseconds } from '../../../types/units';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;
type MockPayload = {| startTime: Milliseconds, endTime: Milliseconds |};
export type TestDefinedMarkers = Array<
  [MarkerName, MarkerTime, MarkerPayload | MockPayload]
>;
export type TestDefinedJsTracerEvent = [
  // Event name:
  string,
  // Start time:
  Milliseconds,
  // End time:
  Milliseconds,
];

/**
 * This function ensures that the mock payloads are converted correctly to real payloads
 * that match the MarkerPayload typing. Specifically it adds the 'DummyForTests' type
 * to { startTime, endTime } payloads. Doing this means that it's cleaner to create
 * dummy test-defined markers, since we don't have to add a `type` to the payload.
 */
function _refineMockPayload(
  payload: MarkerPayload | MockPayload
): MarkerPayload {
  if (
    // Check for a MockPayload.
    payload !== null &&
    Object.keys(payload).length === 2 &&
    typeof payload.startTime === 'number' &&
    typeof payload.endTime === 'number'
  ) {
    return {
      type: 'DummyForTests',
      endTime: payload.endTime,
      startTime: payload.startTime,
    };
  }
  // There is no way to refine the payload type to just the { startTime, endTime }
  // mock marker. So check for those conditions above, and coerce the final result
  // into a MarkerPayload using the function signature.
  return (payload: any);
}

export function addMarkersToThreadWithCorrespondingSamples(
  thread: Thread,
  markers: TestDefinedMarkers,
  interval: Milliseconds
) {
  const stringTable = thread.stringTable;
  const markersTable = thread.markers;

  const allTimes = new Set();

  markers.forEach(([name, time, data]) => {
    markersTable.name.push(stringTable.indexForString(name));
    markersTable.time.push(time);
    markersTable.data.push(_refineMockPayload(data));
    markersTable.length++;

    // Try to get a consistent profile containing all markers
    allTimes.add(time);
    if (data) {
      if (typeof data.startTime === 'number') {
        allTimes.add(data.startTime);
      }
      if (typeof data.endTime === 'number') {
        allTimes.add(data.endTime);
      }
    }
  });

  const firstMarkerTime = Math.min(...allTimes);
  const lastMarkerTime = Math.max(...allTimes);

  const { samples } = thread;

  // The first marker time should be added if there's no sample before this time.
  const shouldAddFirstMarkerTime =
    samples.length === 0 || samples.time[0] > firstMarkerTime;

  // The last marker time should be added if there's no sample after this time,
  // but only if it's different than the other time.
  const shouldAddLastMarkerTime =
    (samples.length === 0 ||
      samples.time[samples.length - 1] < lastMarkerTime) &&
    firstMarkerTime !== lastMarkerTime;

  if (shouldAddFirstMarkerTime) {
    samples.time.unshift(firstMarkerTime);
    samples.stack.unshift(null);
    samples.responsiveness.unshift(null);
    if (samples.duration) {
      samples.duration.unshift(interval);
    }
    samples.length++;
  }

  if (shouldAddLastMarkerTime) {
    samples.time.push(lastMarkerTime);
    samples.stack.push(null);
    samples.responsiveness.push(null);
    if (samples.duration) {
      samples.duration.push(interval);
    }
    samples.length++;
  }
}

export function getThreadWithMarkers(
  markers: TestDefinedMarkers,
  interval: Milliseconds
) {
  const thread = getEmptyThread();
  addMarkersToThreadWithCorrespondingSamples(thread, markers, interval);
  return thread;
}

export function getProfileWithMarkers(
  ...markersPerThread: TestDefinedMarkers[]
): Profile {
  const profile = getEmptyProfile();
  profile.threads = markersPerThread.map(testDefinedMarkers =>
    getThreadWithMarkers(testDefinedMarkers, profile.meta.interval)
  );
  return profile;
}

export function getProfileWithNamedThreads(threadNames: string[]): Profile {
  const profile = getEmptyProfile();
  profile.threads = threadNames.map(name => getEmptyThread({ name }));
  return profile;
}

/**
 * Create a profile from text representation of samples. Each column in the text provided
 * represents a sample. Each sample is made up of a list of functions.
 * Each column needs to be separated by at least two spaces.
 *
 * Example usage:
 *
 * ```
 * const { profile } = getProfileFromTextSamples(`
 *   A             A             A                A
 *   B.js          B.js          F[cat:Graphics]  F
 *   C.js          C.js          G                G
 *   D             D                              H[cat:GC / CC]
 *   E[cat:Other]  E [cat:Other]
 * `);
 * ```
 *
 * The function names are aligned vertically on the left. This would produce 4 samples
 * with the stacks based off of those functions listed, with A being the root. Single
 * spaces within a column are permitted, surrounding whitespace is trimmed.
 *
 * Functions ending in "js" are marked as JS functions in the funcTable's isJS
 * column. Functions with categories using the notation "functionName[cat:categoryName]"
 * are annotated with that category in the frameTable's category column.
 *
 * The function returns more information as well, that is:
 * * an array mapping the func indices (IndexIntoFuncTable) to their names
 * * an array mapping the func names to their indices
 *
 * Functions ending in "js" are marked as JS functions in the funcTable's isJS
 * column. It's possible to specify a JIT type by specifying in brackets like
 * this: [jit:baseline] or [jit:ion], right after the function name (see below
 * for an example). The default is no JIT.
 *
 * The funcNamesDictPerThread array can be useful when using it like this:
 * ```
 * const {
 *   profile,
 *   funcNamesDictPerThread: [{ A, B, Cjs, D }],
 * } = getProfileFromTextSamples(`
 *    A             A
 *    B             B
 *    Cjs[jit:ion]  Cjs[jit:baseline]
 *    D[cat:DOM]    D[cat:DOM]
 *    E             F
 *  `);
 * ```
 * Now the variables named A B Cjs D directly refer to the func indices and can
 * be used in tests.
 */
export function getProfileFromTextSamples(
  ...allTextSamples: string[]
): {
  profile: Profile,
  funcNamesPerThread: Array<string[]>,
  funcNamesDictPerThread: Array<{ [funcName: string]: number }>,
} {
  const profile = getEmptyProfile();
  const categories = profile.meta.categories;

  const funcNamesPerThread = [];
  const funcNamesDictPerThread = [];

  profile.threads = allTextSamples.map(textSamples => {
    // Process the text.
    const textOnlyStacks = _parseTextSamples(textSamples);

    // Flatten the textOnlyStacks into into a list of function names.
    const funcNamesSet = new Set();
    const removeModifiers = /\[.*/;
    for (let i = 0; i < textOnlyStacks.length; i++) {
      const textOnlyStack = textOnlyStacks[i];
      for (let j = 0; j < textOnlyStack.length; j++) {
        funcNamesSet.add(textOnlyStack[j].replace(removeModifiers, ''));
      }
    }
    const funcNames = [...funcNamesSet];

    const funcNamesDict = funcNames.reduce((result, item, index) => {
      result[item] = index;
      return result;
    }, {});

    funcNamesPerThread.push(funcNames);
    funcNamesDictPerThread.push(funcNamesDict);

    // Turn this into a real thread.
    return _buildThreadFromTextOnlyStacks(
      textOnlyStacks,
      funcNames,
      categories
    );
  });

  return { profile, funcNamesPerThread, funcNamesDictPerThread };
}

function _getAllMatchRanges(regex, str): Array<{ start: number, end: number }> {
  const ranges = [];

  let match;
  do {
    match = regex.exec(str);
    if (match) {
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  } while (match);

  return ranges;
}

function _getColumnPositions(line): number[] {
  const lineWithoutIndent = line.trimLeft();
  const indent = line.length - lineWithoutIndent.length;
  const trimmedLine = line.trim();

  // Find the start and end positions of all consecutive runs of two spaces or more.
  const columnSeparatorRanges = _getAllMatchRanges(/ {2,}/g, trimmedLine);
  return [indent, ...columnSeparatorRanges.map(range => range.end + indent)];
}

/**
 * Turn a text blob into a list of stacks.
 *
 * e.g:
 * const text = `
 *   A  A
 *   B  B
 *   C  C
 *      D
 *      E
 * `
 *
 * Returns:
 * [
 *   ['A', 'B', 'C'],
 *   ['A', 'B', 'C', 'D', E'],
 * ]
 */
function _parseTextSamples(textSamples: string): Array<string[]> {
  const lines = textSamples.split('\n').filter(
    // Filter out empty lines
    t => t
  );
  if (lines.length === 0) {
    throw new Error('Empty text data was sent');
  }

  // Compute the index of where the columns start in the string.
  const columnPositions = _getColumnPositions(lines[0]);

  // Create a table of string cells. Empty cells contain the empty string.
  const rows = lines.map(line =>
    columnPositions.map((pos, columnIndex) =>
      line.substring(pos, columnPositions[columnIndex + 1]).trim()
    )
  );

  // Transpose the table to go from rows to columns.
  return columnPositions.map((_, columnIndex) => {
    const column = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const value = rows[rowIndex][columnIndex];
      if (!value) {
        break;
      }
      column.push(value);
    }
    return column;
  });
}

const JIT_IMPLEMENTATIONS = ['ion', 'baseline'];

function _findJitTypeFromFuncName(funcNameWithModifier: string): string | null {
  const findJitTypeResult = /\[jit:([^\]]+)\]/.exec(funcNameWithModifier);
  let jitType = null;
  if (findJitTypeResult) {
    jitType = findJitTypeResult[1];
  }

  if (jitType && JIT_IMPLEMENTATIONS.includes(jitType)) {
    return jitType;
  }

  return null;
}

function _isJsFunctionName(funcName) {
  return funcName.endsWith('js');
}

function _findCategoryFromFuncName(
  funcNameWithModifier: string,
  funcName: string,
  categories: CategoryList
): IndexIntoCategoryList | null {
  const findCategoryResult = /\[cat:([^\]]+)\]/.exec(funcNameWithModifier);
  let categoryName;
  if (findCategoryResult) {
    categoryName = findCategoryResult[1];
  } else if (_isJsFunctionName(funcName)) {
    categoryName = 'JavaScript';
  }

  if (categoryName) {
    const category = categories.findIndex(c => c.name === categoryName);
    if (category !== -1) {
      return category;
    }
  }

  return null;
}

function _findLibNameFromFuncName(funcNameWithModifier: string): string | null {
  const findLibNameResult = /\[lib:([^\]]+)\]/.exec(funcNameWithModifier);
  if (findLibNameResult) {
    const libName = findLibNameResult[1];
    return libName;
  }

  return null;
}

function _buildThreadFromTextOnlyStacks(
  textOnlyStacks: Array<string[]>,
  funcNames: Array<string>,
  categories: CategoryList
): Thread {
  const thread = getEmptyThread();

  const {
    funcTable,
    stringTable,
    frameTable,
    stackTable,
    samples,
    resourceTable,
    libs,
  } = thread;

  // Create the FuncTable.
  funcNames.forEach(funcName => {
    funcTable.name.push(stringTable.indexForString(funcName));
    funcTable.address.push(
      funcName.startsWith('0x') ? parseInt(funcName.substr(2), 16) : -1
    );
    funcTable.fileName.push(null);
    funcTable.relevantForJS.push(funcName.endsWith('js-relevant'));
    funcTable.isJS.push(_isJsFunctionName(funcName));
    funcTable.lineNumber.push(null);
    funcTable.columnNumber.push(null);
    // Ignore resources for now, this way funcNames have really nice string indexes.
    // The resource column will be filled in the loop below.
    funcTable.length++;
  });

  const categoryOther = categories.findIndex(c => c.name === 'Other');

  // This map caches resource indexes for library names.
  const resourceIndexCache = {};

  // Create the samples, stacks, and frames.
  textOnlyStacks.forEach((column, columnIndex) => {
    let prefix = null;
    column.forEach(funcNameWithModifier => {
      const funcName = funcNameWithModifier.replace(/\[.*/, '');

      // There is a one-to-one relationship between strings and funcIndexes here, so
      // the indexes can double as both string indexes and func indexes.
      const funcIndex = stringTable.indexForString(funcName);

      // Find the library name from the function name and create an entry if needed.
      const libraryName = _findLibNameFromFuncName(funcNameWithModifier);
      let resourceIndex = -1;
      if (libraryName) {
        resourceIndex = resourceIndexCache[libraryName];
        if (resourceIndex === undefined) {
          libs.push({
            start: 0,
            end: 0,
            offset: 0,
            arch: '',
            name: libraryName,
            path: '/path/to/' + libraryName,
            debugName: libraryName,
            debugPath: '/path/to/' + libraryName,
            breakpadId: 'SOMETHING_FAKE',
          });

          resourceTable.lib.push(libs.length - 1); // The lastly inserted item.
          resourceTable.name.push(stringTable.indexForString(libraryName));
          resourceTable.type.push(resourceTypes.library);
          resourceTable.host.push(undefined);
          resourceIndex = resourceTable.length++;

          resourceIndexCache[libraryName] = resourceIndex;
        }
      }

      funcTable.resource[funcIndex] = resourceIndex;

      // Find the wanted jit type from the function name
      const jitType = _findJitTypeFromFuncName(funcNameWithModifier);
      const jitTypeIndex = jitType ? stringTable.indexForString(jitType) : null;
      const category = _findCategoryFromFuncName(
        funcNameWithModifier,
        funcName,
        categories
      );

      // Attempt to find a frame that satisfies the given funcIndex, jit type
      // and category..
      let frameIndex;
      for (let i = 0; i < frameTable.length; i++) {
        if (
          funcIndex === frameTable.func[i] &&
          jitTypeIndex === frameTable.implementation[i] &&
          category === frameTable.category[i]
        ) {
          frameIndex = i;
          break;
        }
      }

      if (frameIndex === undefined) {
        frameTable.func.push(funcIndex);
        frameTable.address.push(funcTable.address[funcIndex]);
        frameTable.category.push(category);
        frameTable.subcategory.push(0);
        frameTable.implementation.push(jitTypeIndex);
        frameTable.line.push(null);
        frameTable.column.push(null);
        frameTable.optimizations.push(null);
        frameIndex = frameTable.length++;
      }

      // Attempt to find a stack that satisfies the given frameIndex and prefix.
      let stackIndex;
      for (let i = 0; i < stackTable.length; i++) {
        if (
          stackTable.prefix[i] === prefix &&
          stackTable.frame[i] === frameIndex
        ) {
          stackIndex = i;
          break;
        }
      }

      // If we couldn't find a stack, go ahead and create it.
      if (stackIndex === undefined) {
        const frameCategory = frameTable.category[frameIndex];
        const frameSubcategory = frameTable.subcategory[frameIndex];
        const prefixCategory =
          prefix === null ? categoryOther : stackTable.category[prefix];
        const prefixSubcategory =
          prefix === null ? 0 : stackTable.subcategory[prefix];
        const stackCategory =
          frameCategory === null ? prefixCategory : frameCategory;
        const stackSubcategory =
          frameSubcategory === null ? prefixSubcategory : frameSubcategory;

        stackTable.frame.push(frameIndex);
        stackTable.prefix.push(prefix);
        stackTable.category.push(stackCategory);
        stackTable.subcategory.push(stackSubcategory);
        stackIndex = stackTable.length++;
      }

      prefix = stackIndex;
    });

    // Add a single sample for each column.
    samples.length++;
    samples.responsiveness.push(0);
    samples.stack.push(prefix);
    samples.time.push(columnIndex);
  });
  return thread;
}

/**
 * This returns a merged profile from a number of profile strings.
 */
export function getMergedProfileFromTextSamples(
  ...profileStrings: string[]
): {
  profile: Profile,
  funcNamesPerThread: Array<string[]>,
  funcNamesDictPerThread: Array<{ [funcName: string]: number }>,
} {
  const profilesAndFuncNames = profileStrings.map(str =>
    getProfileFromTextSamples(str)
  );
  const profiles = profilesAndFuncNames.map(({ profile }) => profile);
  const profileState = stateFromLocation({
    pathname: '/public/fakehash1/',
    search: '?thread=0&v=3',
    hash: '',
  });
  const { profile } = mergeProfiles(profiles, profiles.map(() => profileState));
  return {
    profile,
    funcNamesPerThread: profilesAndFuncNames.map(
      ({ funcNamesPerThread }) => funcNamesPerThread[0]
    ),
    funcNamesDictPerThread: profilesAndFuncNames.map(
      ({ funcNamesDictPerThread }) => funcNamesDictPerThread[0]
    ),
  };
}

type NetworkMarkersOptions = {|
  uri: string,
  id: number,
  startTime: number,
  fetchStart: number,
  endTime: number,
  payload: $Shape<NetworkPayload>,
|};

export function getNetworkMarkers(options: $Shape<NetworkMarkersOptions> = {}) {
  // Default values
  const { uri, id, startTime, fetchStart, endTime, payload } = {
    uri: 'https://mozilla.org',
    id: 0,
    startTime: 0,
    fetchStart: (options.startTime || 0) + 0.5,
    endTime: (options.fetchStart || (options.startTime || 0) + 0.5) + 0.5,
    payload: {},
    ...options,
  };

  const name = `Load ${id}: ${uri}`;
  const startPayload: NetworkPayload = {
    type: 'Network',
    id,
    pri: 0,
    status: 'STATUS_START',
    startTime,
    endTime: fetchStart,
    URI: uri,
  };

  const stopPayload: NetworkPayload = {
    ...startPayload,
    status: 'STATUS_STOP',
    startTime: fetchStart,
    endTime,
    ...payload,
  };

  return [
    // Note that the "time" of network markers is generally close to the
    // payload's endTime. We don't use it at all in our business logic though.
    [name, startPayload.endTime, startPayload],
    [name, stopPayload.endTime, stopPayload],
  ];
}

/**
 * This function computes a profile with network markers, which will in turn generate
 * a profile that contains a main thread track, and a network track.
 *
 * This generates 10 network markers ranged 3-4 ms on their start times.
 */
export function getNetworkTrackProfile() {
  const arrayOfNetworkMarkers = Array(10)
    .fill()
    .map((_, i) =>
      getNetworkMarkers({
        id: i,
        startTime: 3 + 0.1 * i,
      })
    );
  const profile = getProfileWithMarkers([].concat(...arrayOfNetworkMarkers));

  const docShellId = '{c03a6ebd-2430-7949-b25b-95ba9776bdbf}';
  const docshellHistoryId = 1;

  profile.pages = [
    {
      docshellId: docShellId,
      historyId: docshellHistoryId,
      url: 'https://developer.mozilla.org/en-US/',
      isSubFrame: false,
    },
  ];

  const thread = profile.threads[0];

  const loadPayloadBase = {
    type: 'tracing',
    category: 'Navigation',
    eventType: 'load',
    docShellId,
    docshellHistoryId,
  };

  const domContentLoadedBase = {
    type: 'tracing',
    category: 'Navigation',
    interval: 'start',
    docShellId,
    docshellHistoryId,
  };

  addMarkersToThreadWithCorrespondingSamples(
    thread,
    [
      [
        'Load',
        4,
        ({
          ...loadPayloadBase,
          interval: 'start',
        }: NavigationMarkerPayload),
      ],
      [
        'Load',
        5,
        ({
          ...loadPayloadBase,
          interval: 'end',
        }: NavigationMarkerPayload),
      ],
      ['TTI', 6, null],
      ['Navigation::Start', 7, null],
      ['Contentful paint at something', 8, null],
      [
        'DOMContentLoaded',
        6,
        ({
          ...domContentLoadedBase,
          interval: 'start',
        }: NavigationMarkerPayload),
      ],
      [
        'DOMContentLoaded',
        7,
        ({
          ...domContentLoadedBase,
          interval: 'end',
        }: NavigationMarkerPayload),
      ],
    ],
    profile.meta.interval
  );

  return profile;
}

export function getScreenshotTrackProfile() {
  return getProfileWithMarkers(
    Array(10)
      .fill()
      .map((_, i) => [
        'CompositorScreenshot',
        i,
        {
          type: 'CompositorScreenshot',
          url: 0, // Some arbitrary string.
          windowID: '0',
          windowWidth: 300,
          windowHeight: 150,
        },
      ])
  );
}

export function getJsTracerTable(
  stringTable: UniqueStringArray,
  events: TestDefinedJsTracerEvent[]
): JsTracerTable {
  const jsTracer = getEmptyJsTracerTable();

  for (const [event, start, end] of events) {
    const stringIndex = stringTable.indexForString(event);
    jsTracer.events.push(stringIndex);
    jsTracer.timestamps.push(start * 1000);
    jsTracer.durations.push((end - start) * 1000);
    jsTracer.lines.push(null);
    jsTracer.columns.push(null);
    jsTracer.length++;
  }

  return jsTracer;
}

export function getThreadWithJsTracerEvents(
  events: TestDefinedJsTracerEvent[]
): Thread {
  const thread = getEmptyThread();
  thread.jsTracer = getJsTracerTable(thread.stringTable, events);

  let endOfEvents = 0;
  for (const [, , end] of events) {
    endOfEvents = Math.max(endOfEvents, end);
  }

  // Create a sample table that is of the same length as the tracer data
  endOfEvents = Number.isInteger(endOfEvents)
    ? // When considering the range of a profile, this range is set to the start of the
      // first profile sample's timestamp, and the end timestamp of the last
      // sample + profile.meta.interval.
      // To keep things slightly realistic, Assume that the profile.meta.interval
      // value is 1 here.
      Math.floor(endOfEvents)
    : endOfEvents - 1;

  // Re-create the table so that it creates a Flow error if we don't handle part of it.
  thread.samples = {
    responsiveness: Array(endOfEvents).fill(null),
    stack: Array(endOfEvents).fill(null),
    time: Array(endOfEvents)
      .fill(0)
      .map((_, i) => i),
    length: endOfEvents,
  };

  return thread;
}

export function getProfileWithJsTracerEvents(
  ...eventsLists: Array<TestDefinedJsTracerEvent[]>
): Profile {
  const profile = getEmptyProfile();
  profile.threads = eventsLists.map(events =>
    getThreadWithJsTracerEvents(events)
  );
  return profile;
}

/**
 * Creates a Counter fixture for a given thread.
 */
export function getCounterForThread(
  thread: Thread,
  mainThreadIndex: ThreadIndex
): Counter {
  const counter: Counter = {
    name: 'My Counter',
    category: 'My Category',
    description: 'My Description',
    pid: thread.pid,
    mainThreadIndex,
    sampleGroups: {
      id: 0,
      samples: {
        time: thread.samples.time.slice(),
        // Create some arbitrary (positive integer) values for the number.
        number: thread.samples.time.map((_, i) =>
          Math.floor(50 * Math.sin(i) + 50)
        ),
        // Create some arbitrary values for the count.
        count: thread.samples.time.map((_, i) => Math.sin(i)),
        length: thread.samples.length,
      },
    },
  };
  return counter;
}

/**
 * Get a profile with JS allocations. The allocations will form the following call tree.
 *
 * - A (total: 15, self: —)
 *   - B (total: 15, self: —)
 *     - Fjs (total: 12, self: —)
 *       - Gjs (total: 12, self: 5)
 *         - Hjs (total: 7, self: —)
 *           - I (total: 7, self: 7)
 *     - C (total: 3, self: —)
 *       - D (total: 3, self: —)
 *         - E (total: 3, self: 3)
 */

export function getProfileWithJsAllocations(): * {
  // First create a normal sample-based profile.
  const {
    profile,
    funcNamesDictPerThread: [funcNamesDict],
  } = getProfileFromTextSamples(`
    A  A     A
    B  B     B
    C  Fjs   Fjs
    D  Gjs   Gjs
    E        Hjs
             I
  `);

  // Now add a JsAllocationsTable.
  const jsAllocations = getEmptyJsAllocationsTable();
  profile.threads[0].jsAllocations = jsAllocations;

  // The stack table is built sequentially, so we can assume that the stack indexes
  // match the func indexes.
  const { E, I, Gjs } = funcNamesDict;

  // Create a list of allocations.
  const allocations = [
    { byteSize: 3, stack: E },
    { byteSize: 5, stack: Gjs },
    { byteSize: 7, stack: I },
  ];

  // Loop through and add them to the table.
  let time = 0;
  for (const { byteSize, stack } of allocations) {
    const thisTime = time++;
    jsAllocations.time.push(thisTime);
    jsAllocations.className.push('Function');
    jsAllocations.typeName.push('JSObject');
    jsAllocations.coarseType.push('Object');
    jsAllocations.duration.push(byteSize);
    jsAllocations.inNursery.push(true);
    jsAllocations.stack.push(stack);
    jsAllocations.length++;
  }

  return { profile, funcNamesDict };
}
