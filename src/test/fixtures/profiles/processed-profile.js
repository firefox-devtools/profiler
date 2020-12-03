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
  getEmptyUnbalancedNativeAllocationsTable,
  getEmptyBalancedNativeAllocationsTable,
} from '../../../profile-logic/data-structures';
import { mergeProfilesForDiffing } from '../../../profile-logic/merge-compare';
import { stateFromLocation } from '../../../app-logic/url-handling';
import { UniqueStringArray } from '../../../utils/unique-string-array';
import { ensureExists } from '../../../utils/flow';
import {
  INTERVAL,
  INSTANT,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';

import type {
  Profile,
  Thread,
  ThreadIndex,
  IndexIntoCategoryList,
  CategoryList,
  JsTracerTable,
  Counter,
  BrowsingContextID,
  MarkerPayload,
  NetworkPayload,
  NavigationMarkerPayload,
  IPCMarkerPayload,
  UserTimingMarkerPayload,
  Milliseconds,
  MarkerPhase,
} from 'firefox-profiler/types';
import {
  deriveMarkersFromRawMarkerTable,
  IPCMarkerCorrelations,
} from '../../../profile-logic/marker-data';
import { getTimeRangeForThread } from '../../../profile-logic/profile-data';
import { markerSchemaForTests } from './marker-schema';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;
type MockPayload = {| startTime: Milliseconds, endTime: Milliseconds |};

// These markers can create an Instant or a complete Interval marker, depending
// on if an end time is passed in. The definition uses a union, becaus as far
// as I can tell, Flow doesn't support multiple arity tuples.
export type TestDefinedMarkers = Array<
  // Instant marker:
  | [MarkerName, MarkerTime]
  // No payload:
  | [
      MarkerName,
      MarkerTime, // start time
      MarkerTime | null // end time
    ]
  | [
      MarkerName,
      MarkerTime, // start time
      MarkerTime | null, // end time
      MarkerPayload | MockPayload
    ]
>;

// This type is used when needing to create a specific RawMarkerTable.
export type TestDefinedRawMarker = {|
  +name?: string,
  +startTime: Milliseconds | null,
  +endTime: Milliseconds | null,
  +phase: MarkerPhase,
  +category?: IndexIntoCategoryList,
  +data?: MarkerPayload,
|};

export type TestDefinedJsTracerEvent = [
  // Event name:
  string,
  // Start time:
  Milliseconds,
  // End time:
  Milliseconds
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
    };
  }
  // There is no way to refine the payload type to just the { startTime, endTime }
  // mock marker. So check for those conditions above, and coerce the final result
  // into a MarkerPayload using the function signature.
  return (payload: any);
}

export function addRawMarkersToThread(
  thread: Thread,
  markers: TestDefinedRawMarker[]
) {
  const stringTable = thread.stringTable;
  const markersTable = thread.markers;

  for (const { name, startTime, endTime, phase, category, data } of markers) {
    markersTable.name.push(
      stringTable.indexForString(name || 'TestDefinedMarker')
    );
    markersTable.phase.push(phase);
    markersTable.startTime.push(startTime);
    markersTable.endTime.push(endTime);
    markersTable.data.push(data ? _refineMockPayload(data) : null);
    markersTable.category.push(category || 0);
    markersTable.length++;
  }
}

export function addMarkersToThreadWithCorrespondingSamples(
  thread: Thread,
  markers: TestDefinedMarkers
) {
  const stringTable = thread.stringTable;
  const markersTable = thread.markers;

  markers.forEach(tuple => {
    const name = tuple[0];
    const startTime = tuple[1];
    // Flow doesn't support variadic tuple types.
    const maybeEndTime = (tuple: any)[2] || null;
    const maybeData = (tuple: any)[3] || null;

    markersTable.name.push(stringTable.indexForString(name));
    const payload = _refineMockPayload(maybeData);
    if (maybeEndTime === null) {
      markersTable.phase.push(INSTANT);
      markersTable.startTime.push(startTime);
      markersTable.endTime.push(null);
    } else {
      markersTable.phase.push(INTERVAL);
      markersTable.startTime.push(startTime);
      markersTable.endTime.push(maybeEndTime);
    }
    markersTable.data.push(payload);
    markersTable.category.push(0);
    markersTable.length++;
  });
}

export function getThreadWithMarkers(markers: TestDefinedMarkers) {
  const thread = getEmptyThread();
  addMarkersToThreadWithCorrespondingSamples(thread, markers);
  return thread;
}

export function getThreadWithRawMarkers(markers: TestDefinedRawMarker[]) {
  const thread = getEmptyThread();
  addRawMarkersToThread(thread, markers);
  return thread;
}

/**
 * This can be a little annoying to derive with all of the dependencies,
 * so provide an easy interface to do so here.
 */
export function getTestFriendlyDerivedMarkerInfo(thread: Thread) {
  return deriveMarkersFromRawMarkerTable(
    thread.markers,
    thread.stringTable,
    thread.tid || 0,
    getTimeRangeForThread(thread, 1),
    new IPCMarkerCorrelations()
  );
}

/**
 * A utility to make TestDefinedRawMarker
 */
export function makeStartMarker(
  name: string,
  startTime: Milliseconds
): TestDefinedRawMarker {
  return {
    name,
    startTime,
    endTime: null,
    phase: INTERVAL_START,
  };
}

/**
 * A utility to make TestDefinedRawMarker
 */
export function makeEndMarker(
  name: string,
  endTime: Milliseconds
): TestDefinedRawMarker {
  return {
    name,
    startTime: null,
    endTime,
    phase: INTERVAL_END,
  };
}

/**
 * A utility to make TestDefinedRawMarker
 */
export function makeInstantMarker(
  name: string,
  startTime: Milliseconds
): TestDefinedRawMarker {
  return {
    name,
    startTime,
    endTime: null,
    phase: INSTANT,
  };
}

/**
 * A utility to make TestDefinedRawMarker
 */
export function makeIntervalMarker(
  name: string,
  startTime: Milliseconds,
  endTime: Milliseconds
): TestDefinedRawMarker {
  return {
    name,
    startTime,
    endTime,
    phase: INTERVAL,
  };
}

/**
 * A utility to make TestDefinedRawMarker
 */
export function makeCompositorScreenshot(
  startTime: Milliseconds
): TestDefinedRawMarker {
  return {
    ...makeInstantMarker('CompositorScreenshot', startTime),
    data: {
      type: 'CompositorScreenshot',
      url: 0,
      windowID: '',
      windowWidth: 100,
      windowHeight: 100,
    },
  };
}

export function getUserTiming(
  name: string,
  startTime: number,
  duration: number
) {
  const endTime = startTime + duration;
  return [
    'UserTiming',
    startTime,
    endTime,
    ({
      type: 'UserTiming',
      name,
      entryType: 'measure',
    }: UserTimingMarkerPayload),
  ];
}

export function getProfileWithMarkers(
  ...markersPerThread: TestDefinedMarkers[]
): Profile {
  const profile = getEmptyProfile();
  // Provide a useful marker schema, rather than an empty one.
  profile.meta.markerSchema = markerSchemaForTests;

  if (markersPerThread.length === 0) {
    throw new Error(
      'getProfileWithMarkers expected to get at least one list of markers.'
    );
  }
  profile.threads = markersPerThread.map(testDefinedMarkers =>
    getThreadWithMarkers(testDefinedMarkers)
  );
  return profile;
}

/**
 * This profile is useful for marker table tests. The markers were taken from
 * real-world values.
 */
export function getMarkerTableProfile() {
  return getProfileWithMarkers(
    [
      [
        'UserTiming',
        12.5,
        12.5,
        {
          type: 'UserTiming',
          name: 'foobar',
          entryType: 'mark',
        },
      ],
      [
        'NotifyDidPaint',
        14.5,
        null,
        {
          type: 'tracing',
          category: 'Paint',
        },
      ],
      [
        'setTimeout',
        165.87091900000001,
        165.871503,
        {
          type: 'Text',
          name: '5.5',
        },
      ],
      [
        'IPC',
        120,
        120,
        {
          type: 'IPC',
          startTime: 120,
          endTime: 120,
          otherPid: 2222,
          messageType: 'PContent::Msg_PreferenceUpdate',
          messageSeqno: 1,
          side: 'parent',
          direction: 'sending',
          phase: 'endpoint',
          sync: false,
          niceDirection: 'sending to 2222',
        },
      ],
      [
        'LogMessages',
        170,
        null,
        {
          type: 'Log',
          name: 'nsJARChannel::nsJARChannel [this=0x87f1ec80]\n',
          module: 'nsJarProtocol',
        },
      ],
      [
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed eget magna sed magna vehicula congue id id nulla. Ut convallis, neque consequat aliquam egestas, dui urna interdum quam, id semper magna erat et nisi. Vivamus molestie quis ligula eget aliquam. Sed facilisis, turpis sed facilisis posuere, risus odio convallis velit, vitae vehicula justo risus at ipsum. Proin non porttitor neque. Vivamus fringilla ex nec iaculis cursus. Vestibulum suscipit mauris sem, vitae gravida ipsum fermentum id. Quisque pulvinar blandit ullamcorper. Donec id justo at metus scelerisque pulvinar. Proin suscipit suscipit nisi, quis tempus ipsum vulputate quis. Pellentesque sodales rutrum eros, eget pulvinar ante condimentum a. Donec accumsan, ante ut facilisis cursus, nibh quam congue eros, vitae placerat tortor magna vel lacus. Etiam odio diam, venenatis eu sollicitudin non, ultrices ut urna. Aliquam vehicula diam eu eros eleifend, ac vulputate purus faucibus.',
        165.87091900000001,
        165.871503,
        {
          type: 'Text',
          name: '5.5',
        },
      ],
      [
        'FileIO',
        174,
        175,
        {
          type: 'FileIO',
          source: 'PoisonIOInterposer',
          filename: '/foo/bar',
          operation: 'create/open',
        },
      ],
    ].sort((a, b) => a[1] - b[1])
  );
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
 * The time of the sample can also be set by making the first row all numbers:
 * ```
 *   const { profile } = getProfileFromTextSamples(`
 *    0  1  5  6
 *    A  A  A  C
 *       B
 *  `);
 * ```
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
  // Provide a useful marker schema, rather than an empty one.
  profile.meta.markerSchema = markerSchemaForTests;
  const categories = profile.meta.categories;

  const funcNamesPerThread = [];
  const funcNamesDictPerThread = [];

  profile.threads = allTextSamples.map(textSamples => {
    // Process the text.
    const textOnlyStacks = _parseTextSamples(textSamples);

    // See if the first row contains only numbers, if so this is the time of the sample.
    let sampleTimes = null;

    // Check if the first row is made by base 10 integers. 0x200 and other will parse
    // as numbers, but they can be used as valid function names.
    const isFirstRowMadeOfNumbers = textOnlyStacks.every(stack =>
      /^\d+$/.test(stack[0])
    );
    if (isFirstRowMadeOfNumbers) {
      sampleTimes = textOnlyStacks.map(stack => parseInt(stack[0]));
      for (const stack of textOnlyStacks) {
        // Remove the number.
        stack.shift();
      }
    }

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
      categories,
      sampleTimes
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

const JIT_IMPLEMENTATIONS = ['ion', 'baseline', 'blinterp'];

function _findJitTypeFromFuncName(funcNameWithModifier: string): string | null {
  const findJitTypeResult = /\[jit:([^\]]+)\]/.exec(funcNameWithModifier);
  let jitType = null;
  if (findJitTypeResult) {
    jitType = findJitTypeResult[1];
  }

  if (jitType) {
    if (JIT_IMPLEMENTATIONS.includes(jitType)) {
      return jitType;
    }
    throw new Error(
      `The jitType '${jitType}' is unknown to this tool. Is it a typo or should you update the list of possible values?`
    );
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
  categories: CategoryList,
  sampleTimes: number[] | null
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
        frameTable.innerWindowID.push(0);
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
    ensureExists(samples.eventDelay).push(0);
    samples.stack.push(prefix);
    samples.time.push(columnIndex);
  });

  if (sampleTimes) {
    samples.time = sampleTimes;
  }

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
  const { profile } = mergeProfilesForDiffing(
    profiles,
    profiles.map(() => profileState)
  );
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
    startTime,
    endTime: fetchStart,
    pri: 0,
    status: 'STATUS_START',
    URI: uri,
  };

  const stopPayload: NetworkPayload = {
    ...startPayload,
    status: 'STATUS_STOP',
    startTime: fetchStart,
    endTime,
    contentType: 'text/html',
    ...payload,
  };

  return [
    [name, startTime, fetchStart, startPayload],
    [name, fetchStart, endTime, stopPayload],
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

  const browsingContextID = 123123;
  const innerWindowID = 1;

  profile.pages = [
    {
      browsingContextID: browsingContextID,
      innerWindowID: innerWindowID,
      url: 'https://developer.mozilla.org/en-US/',
      embedderInnerWindowID: 0,
    },
  ];

  const thread = profile.threads[0];

  const loadPayloadBase = {
    type: 'tracing',
    category: 'Navigation',
    eventType: 'load',
    innerWindowID: innerWindowID,
  };

  const domContentLoadedBase = {
    type: 'tracing',
    category: 'Navigation',
    innerWindowID: innerWindowID,
  };

  addMarkersToThreadWithCorrespondingSamples(thread, [
    [
      'Load',
      4,
      5,
      ({
        ...loadPayloadBase,
      }: NavigationMarkerPayload),
    ],
    ['TTI', 6],
    ['Navigation::Start', 7],
    ['Contentful paint at something', 8],
    [
      'DOMContentLoaded',
      6,
      7,
      ({
        ...domContentLoadedBase,
      }: NavigationMarkerPayload),
    ],
  ]);

  return profile;
}

type IPCMarkersOptions = {|
  startTime: number,
  endTime: number,
  otherPid: number,
  messageType: string,
  messageSeqno: number,
  side: 'parent' | 'child',
  direction: 'sending' | 'receiving',
  phase: 'endpoint' | 'transferStart' | 'transferEnd',
  sync: boolean,
|};

function _getIPCMarkers(
  options: $Shape<IPCMarkersOptions> = {}
): TestDefinedMarkers {
  const payload: IPCMarkerPayload = {
    type: 'IPC',
    startTime: 0,
    endTime: (options.startTime || 0) + 0.1,
    otherPid: 1234,
    messageType: 'PContent::Msg_PreferenceUpdate',
    messageSeqno: 0,
    side: 'parent',
    direction: 'sending',
    phase: 'endpoint',
    sync: false,
    niceDirection: 'sending to 1234',
    ...options,
  };

  return [
    [
      'IPC',
      options.startTime || 0,
      ensureExists(
        payload.endTime,
        'Expected to find an endTime on the IPC marker'
      ),
      payload,
    ],
  ];
}

export function getIPCTrackProfile() {
  const arrayOfIPCMarkers = Array(10)
    .fill()
    .map((_, i) =>
      _getIPCMarkers({
        messageSeqno: i,
        startTime: 3 + 0.1 * i,
      })
    );
  return getProfileWithMarkers([].concat(...arrayOfIPCMarkers));
}

export function getScreenshotTrackProfile() {
  const screenshotMarkersForWindowId = windowID =>
    Array(10)
      .fill()
      .map((_, i) => [
        'CompositorScreenshot',
        i,
        null,
        {
          type: 'CompositorScreenshot',
          url: 0, // Some arbitrary string.
          windowID,
          windowWidth: 300,
          windowHeight: 150,
        },
      ]);
  return getProfileWithMarkers([
    ...screenshotMarkersForWindowId('0'),
    ...screenshotMarkersForWindowId('1'),
  ]);
}

export function getVisualProgressTrackProfile(profileString: string): Profile {
  const { profile } = getProfileFromTextSamples(profileString);
  profile.meta.visualMetrics = {
    SpeedIndex: 2942,
    FirstVisualChange: 960,
    LastVisualChange: 10480,
    VisualProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 17 },
      { timestamp: 5511.321044921875, percent: 17 },
      { timestamp: 5591.321044921875, percent: 22 },
      { timestamp: 5631.321044921875, percent: 42 },
      { timestamp: 5751.321044921875, percent: 70 },
      { timestamp: 5911.321044921875, percent: 76 },
    ],
    ContentfulSpeedIndex: 2303,
    ContentfulSpeedIndexProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 41 },
      { timestamp: 5511.321044921875, percent: 46 },
      { timestamp: 5591.321044921875, percent: 48 },
      { timestamp: 5631.321044921875, percent: 49 },
      { timestamp: 5751.321044921875, percent: 49 },
    ],
    PerceptualSpeedIndex: 8314,
    PerceptualSpeedIndexProgress: [
      { timestamp: 4431.321044921875, percent: 0 },
      { timestamp: 5391.321044921875, percent: 11 },
      { timestamp: 5511.321044921875, percent: 12 },
      { timestamp: 5591.321044921875, percent: 13 },
      { timestamp: 5631.321044921875, percent: 13 },
      { timestamp: 5751.321044921875, percent: 15 },
    ],
    VisualReadiness: 9520,
    VisualComplete85: 6480,
    VisualComplete95: 10200,
    VisualComplete99: 10200,
  };
  return profile;
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
    jsTracer.line.push(null);
    jsTracer.column.push(null);
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
    eventDelay: Array(endOfEvents).fill(null),
    stack: Array(endOfEvents).fill(null),
    time: Array(endOfEvents)
      .fill(0)
      .map((_, i) => i),
    weightType: 'samples',
    weight: null,
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
    sampleGroups: [
      {
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
    ],
  };
  return counter;
}

/**
 * Creates a profile that includes a thread with eventDelay values.
 */
export function getProfileWithEventDelays(
  userEventDelay?: Milliseconds[]
): Profile {
  const profile = getEmptyProfile();
  profile.meta.markerSchema = markerSchemaForTests;
  profile.threads = [getThreadWithEventDelay(userEventDelay)];
  return profile;
}

/**
 * Creates a thread with eventDelay values.
 */
export function getThreadWithEventDelay(
  userEventDelay?: Milliseconds[]
): Thread {
  const thread = getEmptyThread();

  // Creating some empty event delays because they will be filled with the pre-process.
  let eventDelay = Array(50).fill(0);

  if (userEventDelay !== undefined && userEventDelay !== null) {
    eventDelay = [...eventDelay, ...userEventDelay];
  } else {
    for (let i = 0; i < 100; i++) {
      eventDelay.push(i % 30);
    }
  }

  // Re-construct the samples table with new event delay values.
  thread.samples = {
    eventDelay: eventDelay,
    stack: Array(eventDelay.length).fill(null),
    time: Array.from({ length: eventDelay.length }, (_, i) => i),
    weight: null,
    weightType: 'samples',
    length: eventDelay.length,
  };

  return thread;
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

export function getProfileWithJsAllocations() {
  // First create a normal sample-based profile.
  const {
    profile,
    funcNamesDictPerThread: [funcNamesDict],
  } = getProfileFromTextSamples(`
    A  A     A
    B  B     B
    C  Fjs   Fjs
    D  Gjs   Gjs
    E        Hjs[lib:jQuery.js]
             I[lib:libI.so]
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
    jsAllocations.weight.push(byteSize);
    jsAllocations.inNursery.push(true);
    jsAllocations.stack.push(stack);
    jsAllocations.length++;
  }

  return { profile, funcNamesDict };
}

/**
 * Get a profile with unbalanced native allocations. The allocations will form the
 * following trees. The profile is unbalanced because the allocations do not have
 * the memory addresses where they were allocated/deallocated from, and so
 * cannot be matched up to form a balanced view.
 *
 * Retained Allocations:
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
 *
 * Deallocations:
 *
 * - A (total: -41, self: —)
 *   - B (total: -41, self: —)
 *     - Fjs (total: -30, self: —)
 *       - Gjs (total: -30, self: -13)
 *         - Hjs (total: -17, self: —)
 *           - I (total: -17, self: -17)
 *     - C (total: -11, self: —)
 *       - D (total: -11, self: —)
 *         - E (total: -11, self: -11)
 */
export function getProfileWithUnbalancedNativeAllocations() {
  // First create a normal sample-based profile.
  const {
    profile,
    funcNamesDictPerThread: [funcNamesDict],
  } = getProfileFromTextSamples(`
    A  A     A
    B  B     B
    C  Fjs   Fjs
    D  Gjs   Gjs
    E        Hjs[lib:jQuery.js]
             I[lib:libI.so]
  `);

  // Now add a NativeAllocationsTable.
  const nativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
  profile.threads[0].nativeAllocations = nativeAllocations;

  // The stack table is built sequentially, so we can assume that the stack indexes
  // match the func indexes.
  const { E, I, Gjs } = funcNamesDict;

  // Create a list of allocations.
  const allocations = [
    // Allocations:
    { byteSize: 3, stack: E },
    { byteSize: 5, stack: Gjs },
    { byteSize: 7, stack: I },
    // Deallocations:
    { byteSize: -11, stack: E },
    { byteSize: -13, stack: Gjs },
    { byteSize: -17, stack: I },
  ];

  // Loop through and add them to the table.
  let time = 0;
  for (const { byteSize, stack } of allocations) {
    const thisTime = time++;
    nativeAllocations.time.push(thisTime);
    nativeAllocations.weight.push(byteSize);
    nativeAllocations.stack.push(stack);
    nativeAllocations.length++;
  }

  return { profile, funcNamesDict };
}

/**
 * Get a profile with balanced native allocations. The allocations will form the
 * following trees. The profile is balanced because the allocations have memory
 * addresses, so the allocations and deallocations can be balanced based on the
 * allocation site.
 *
 * Retained Allocations:
 *
 * - A (total: 30, self: —)
 *   - B (total: 30, self: —)
 *     - C (total: 17, self: —)
 *       - D (total: 17, self: —)
 *         - E (total: 17, self: 17)
 *     - Fjs (total: 13, self: —)
 *       - Gjs (total: 13, self: 13)
 */

export function getProfileWithBalancedNativeAllocations() {
  // First create a normal sample-based profile.
  const {
    profile,
    funcNamesDictPerThread: [funcNamesDict],
  } = getProfileFromTextSamples(`
    A  A     A
    B  B     B
    C  Fjs   Fjs
    D  Gjs   Gjs
    E        Hjs[lib:jQuery.js]
             I[lib:libI.so]
  `);

  // Now add a NativeAllocationsTable.
  const nativeAllocations = getEmptyBalancedNativeAllocationsTable();
  const [thread] = profile.threads;
  thread.nativeAllocations = nativeAllocations;
  const threadId = ensureExists(
    thread.tid,
    'Expected there to be a tid on the thread'
  );

  // The stack table is built sequentially, so we can assume that the stack indexes
  // match the func indexes.
  const { E, I, Gjs } = funcNamesDict;

  // Create a list of allocations.
  const allocations = [
    // Matched allocations:
    { byteSize: 3, stack: E, memoryAddress: 0x10 },
    { byteSize: 5, stack: Gjs, memoryAddress: 0x11 },
    { byteSize: 7, stack: I, memoryAddress: 0x12 },
    // Unmatched allocations:
    { byteSize: 11, stack: E, memoryAddress: 0x20 },
    { byteSize: 13, stack: Gjs, memoryAddress: 0x21 },
    { byteSize: 17, stack: I, memoryAddress: 0x22 },
    // Deallocations that match the first group.
    { byteSize: -3, stack: E, memoryAddress: 0x10 },
    { byteSize: -5, stack: Gjs, memoryAddress: 0x11 },
    { byteSize: -7, stack: I, memoryAddress: 0x12 },
    // Unmatched deallocations:
    { byteSize: -19, stack: E, memoryAddress: 0x30 },
    { byteSize: -23, stack: Gjs, memoryAddress: 0x31 },
    { byteSize: -29, stack: I, memoryAddress: 0x32 },
  ];

  // Loop through and add them to the table.
  let time = 0;
  for (const { byteSize, stack, memoryAddress } of allocations) {
    const thisTime = time++;
    nativeAllocations.time.push(thisTime);
    nativeAllocations.weight.push(byteSize);
    nativeAllocations.stack.push(stack);
    nativeAllocations.memoryAddress.push(memoryAddress);
    nativeAllocations.threadId.push(threadId);
    nativeAllocations.length++;
  }

  return { profile, funcNamesDict };
}

/**
 * Add pages array and activeTabBrowsingContextID to the given profile.
 * Pages array has the following relationship:
 * Tab #1                           Tab #2
 * --------------                --------------
 * Page #1                        Page #4
 * |- Page #2                     |
 * |  |- Page #3                  Page #6
 * |
 * Page #5
 */
export function addActiveTabInformationToProfile(
  profile: Profile,
  activeBrowsingContextID?: BrowsingContextID
) {
  const firstTabBrowsingContextID = 1;
  const secondTabBrowsingContextID = 4;
  const parentInnerWindowIDsWithChildren = 11111111111;
  const iframeInnerWindowIDsWithChild = 11111111112;
  const fistTabInnerWindowIDs = [
    parentInnerWindowIDsWithChildren,
    iframeInnerWindowIDsWithChild,
    11111111113,
    11111111115,
  ];
  const secondTabInnerWindowIDs = [11111111114, 11111111116];

  // Default to first tab browsingContextID if not given
  activeBrowsingContextID =
    activeBrowsingContextID === undefined
      ? firstTabBrowsingContextID
      : activeBrowsingContextID;

  // Add the pages array
  profile.pages = [
    // A top most page in the first tab
    {
      browsingContextID: firstTabBrowsingContextID,
      innerWindowID: parentInnerWindowIDsWithChildren,
      url: 'Page #1',
      embedderInnerWindowID: 0,
    },
    // An iframe page inside the previous page
    {
      browsingContextID: 2,
      innerWindowID: iframeInnerWindowIDsWithChild,
      url: 'Page #2',
      embedderInnerWindowID: parentInnerWindowIDsWithChildren,
    },
    // Another iframe page inside the previous iframe
    {
      browsingContextID: 3,
      innerWindowID: fistTabInnerWindowIDs[2],
      url: 'Page #3',
      embedderInnerWindowID: iframeInnerWindowIDsWithChild,
    },
    // A top most frame from the second tab
    {
      browsingContextID: secondTabBrowsingContextID,
      innerWindowID: secondTabInnerWindowIDs[0],
      url: 'Page #4',
      embedderInnerWindowID: 0,
    },
    // Another top most frame from the first tab
    // Their browsingContextIDs are the same because of that.
    {
      browsingContextID: firstTabBrowsingContextID,
      innerWindowID: fistTabInnerWindowIDs[3],
      url: 'Page #5',
      embedderInnerWindowID: 0,
    },
    // Another top most frame from the second tab
    {
      browsingContextID: secondTabBrowsingContextID,
      innerWindowID: secondTabInnerWindowIDs[1],
      url: 'Page #4',
      embedderInnerWindowID: 0,
    },
  ];

  // Set the active BrowsingContext ID.
  profile.meta.configuration = {
    activeBrowsingContextID,
    capacity: 1,
    features: [],
    threads: [],
  };

  return {
    profile,
    firstTabBrowsingContextID,
    secondTabBrowsingContextID,
    parentInnerWindowIDsWithChildren,
    iframeInnerWindowIDsWithChild,
    activeBrowsingContextID,
    fistTabInnerWindowIDs,
    secondTabInnerWindowIDs,
  };
}
