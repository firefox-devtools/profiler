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
import { computeReferenceCPUDeltaPerMs } from '../../../profile-logic/cpu';
import { stateFromLocation } from '../../../app-logic/url-handling';
import { StringTable } from '../../../utils/string-table';
import { computeThreadFromRawThread } from '../utils';
import { ensureExists } from '../../../utils/flow';
import {
  INTERVAL,
  INSTANT,
  INTERVAL_START,
  INTERVAL_END,
} from 'firefox-profiler/app-logic/constants';

import type {
  Profile,
  RawThread,
  Thread,
  ThreadIndex,
  IndexIntoCategoryList,
  IndexIntoStackTable,
  CategoryList,
  JsTracerTable,
  RawCounter,
  TabID,
  MarkerPayload,
  NetworkPayload,
  NavigationMarkerPayload,
  IPCMarkerPayload,
  UserTimingMarkerPayload,
  Milliseconds,
  MarkerPhase,
  ThreadCPUDeltaUnit,
  LineNumber,
  Address,
  Bytes,
  CallNodePath,
  Pid,
  MarkerSchema,
} from 'firefox-profiler/types';
import {
  deriveMarkersFromRawMarkerTable,
  IPCMarkerCorrelations,
} from '../../../profile-logic/marker-data';
import {
  getTimeRangeForThread,
  computeTimeColumnForRawSamplesTable,
} from '../../../profile-logic/profile-data';
import { markerSchemaForTests } from './marker-schema';
import { GlobalDataCollector } from 'firefox-profiler/profile-logic/process-profile';
import { getVisualMetrics } from './gecko-profile';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;

// These markers can create an Instant or a complete Interval marker, depending
// on if an end time is passed in.
//
// If the data field is left out (undefined), a default value { type: MarkerName }
// is used. If the data field is manually set to null, a null data is used.
//
// The definition uses a union, becaus as far
// as I can tell, Flow doesn't support multiple arity tuples.
export type TestDefinedMarkers = Array<
  // Instant marker, payload defaulting to { type: MarkerName }:
  | [MarkerName, MarkerTime]
  // Interval marker:
  | [
      MarkerName,
      MarkerTime, // start time
      MarkerTime | null, // end time
    ]
  // Marker with manual payload:
  | [
      MarkerName,
      MarkerTime, // start time
      MarkerTime | null, // end time
      MixedObject | null, // data payload
    ],
>;

// This type is used when needing to create a specific RawMarkerTable.
export type TestDefinedRawMarker = {|
  +name?: string,
  +startTime: Milliseconds | null,
  +endTime: Milliseconds | null,
  +phase: MarkerPhase,
  +category?: IndexIntoCategoryList,
  +data?: MarkerPayload | null,
|};

export type TestDefinedJsTracerEvent = [
  // Event name:
  string,
  // Start time:
  Milliseconds,
  // End time:
  Milliseconds,
];

export function addRawMarkersToThread(
  thread: RawThread,
  markers: TestDefinedRawMarker[]
) {
  const stringTable = StringTable.withBackingArray(thread.stringArray);
  const markersTable = thread.markers;

  for (const { name, startTime, endTime, phase, category, data } of markers) {
    markersTable.name.push(
      stringTable.indexForString(name || 'TestDefinedMarker')
    );
    markersTable.phase.push(phase);
    markersTable.startTime.push(startTime);
    markersTable.endTime.push(endTime);
    markersTable.data.push(data || null);
    markersTable.category.push(category || 0);
    markersTable.length++;
  }
}

// This function is called with test-defined payloads. For convenience, we allow
// providing payload values as strings, and then this function makes it so that,
// for fields of type 'unique-string', the values become string indexes.
function _replaceUniqueStringFieldValuesWithStringIndexesInMarkerPayload(
  payload: MixedObject | null,
  markerSchemas: MarkerSchema[],
  stringTable: StringTable
) {
  if (payload === null) {
    return;
  }
  const markerType = payload.type;
  if (markerType === undefined) {
    return;
  }
  const schema = markerSchemas.find((schema) => schema.name === markerType);
  if (schema === undefined) {
    return;
  }
  for (const fieldSchema of schema.fields) {
    if (fieldSchema.format !== 'unique-string') {
      continue;
    }
    const { key } = fieldSchema;
    if (typeof payload[key] === 'string') {
      // Replace string with string index
      payload[key] = stringTable.indexForString(payload[key]);
    }
  }
}

// This is used in tests, with TestDefinedMarkers.
export function addMarkersToThreadWithCorrespondingSamples(
  thread: RawThread,
  markers: TestDefinedMarkers
) {
  const stringTable = StringTable.withBackingArray(thread.stringArray);
  const markersTable = thread.markers;
  const allTimes = new Set();

  markers.forEach((tuple) => {
    const name = tuple[0];
    const startTime = tuple[1];
    // Flow doesn't support variadic tuple types.
    const maybeEndTime = (tuple: any)[2] || null;
    const maybePayload: MarkerPayload | null | void = (tuple: any)[3];
    const payload = maybePayload === undefined ? { type: name } : maybePayload;

    markersTable.name.push(stringTable.indexForString(name));
    if (maybeEndTime === null) {
      markersTable.phase.push(INSTANT);
      markersTable.startTime.push(startTime);
      markersTable.endTime.push(null);
    } else {
      markersTable.phase.push(INTERVAL);
      markersTable.startTime.push(startTime);
      markersTable.endTime.push(maybeEndTime);
      allTimes.add(maybeEndTime);
    }
    allTimes.add(startTime);
    _replaceUniqueStringFieldValuesWithStringIndexesInMarkerPayload(
      payload,
      markerSchemaForTests,
      stringTable
    );
    markersTable.data.push((payload: any));
    markersTable.category.push(0);
    markersTable.length++;
  });

  // When the profile contains at least 1 sample, we use only the samples to
  // control the initial range. Because of that we need to add samples so that
  // the range includes these markers. Note that when a thread has no sample,
  // then the markers are used to compute the initial range.
  const { samples } = thread;
  if (samples.length) {
    const firstMarkerTime = Math.min(...allTimes);
    const lastMarkerTime = Math.max(...allTimes);

    const sampleTimes = ensureExists(samples.time);

    // The first marker time should be added if there's no sample before this time.
    const shouldAddFirstMarkerTime = sampleTimes[0] > firstMarkerTime;

    // The last marker time should be added if there's no sample after this time,
    // but only if it's different than the other time.
    const shouldAddLastMarkerTime =
      sampleTimes[samples.length - 1] < lastMarkerTime &&
      firstMarkerTime !== lastMarkerTime;

    if (shouldAddFirstMarkerTime) {
      sampleTimes.unshift(firstMarkerTime);
      samples.stack.unshift(null);
      if (samples.responsiveness) {
        samples.responsiveness.unshift(null);
      }
      if (samples.eventDelay) {
        samples.eventDelay.unshift(null);
      }
      if (samples.weight) {
        samples.weight.unshift(samples.weight[0]);
      }
      samples.length++;
    }

    if (shouldAddLastMarkerTime) {
      sampleTimes.push(lastMarkerTime);
      samples.stack.push(null);
      if (samples.responsiveness) {
        samples.responsiveness.push(null);
      }
      if (samples.eventDelay) {
        samples.eventDelay.push(null);
      }
      if (samples.weight) {
        samples.weight.push(samples.weight[0]);
      }
      samples.length++;
    }
  }
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
export function getTestFriendlyDerivedMarkerInfo(thread: RawThread) {
  return deriveMarkersFromRawMarkerTable(
    thread.markers,
    thread.stringArray,
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
  startTime: Milliseconds,
  duration: Milliseconds | null = null
) {
  const endTime = duration === null ? null : startTime + duration;
  const entryType = duration === null ? 'mark' : 'measure';
  return [
    'UserTiming',
    startTime,
    endTime,
    ({
      type: 'UserTiming',
      name,
      entryType,
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
  profile.threads = markersPerThread.map((testDefinedMarkers, i) => ({
    ...getThreadWithMarkers(testDefinedMarkers),
    tid: i,
  }));
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
          otherPid: '2222',
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
  profile.threads = threadNames.map((name) => getEmptyThread({ name }));
  return profile;
}

export type ProfileWithDicts = {
  profile: Profile,
  derivedThreads: Thread[],
  funcNamesPerThread: Array<string[]>,
  funcNamesDictPerThread: Array<{ [funcName: string]: number }>,
  nativeSymbolsDictPerThread: Array<{ [nativeSymbolName: string]: number }>,
  defaultCategory: IndexIntoCategoryList,
};

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
 * column.
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
 *    Cjs           Cjs
 *    D[cat:DOM]    D[cat:DOM]
 *    E             F
 *  `);
 * ```
 * Now the variables named A B Cjs D directly refer to the func indices and can
 * be used in tests.
 *
 * The following func and frame attributes are supported:
 *  - [cat:*] - The category name, affects frameTable.category
 *  - [lib:*] - The library name, affects funcTable.resource + resourceTable + libs
 *  - [file:*] - The filename, affects funcTable.file
 *  - [line:*] - The line, affects frameTable.line
 *  - [address:*] - The frame address, affects frameTable.address
 *  - [inl:*] - The inline depth, affects frameTable.inlineDepth
 *  - [sym:<name>:<hex_address>:<hex_size>] - The native symbol, affects frameTable.nativeSymbol (keyed on <name>)

```js
// Execute the code below in the web console in the profiler to get a stack that's
// ready to be pasted into getProfileFromTextSamples.

function getFrame(
  { stackTable, frameTable, funcTable, stringTable, resourceTable, nativeSymbols, libs },
  frameIndex
) {
  const funcIndex = frameTable.func[frameIndex];
  let s = stringTable.getString(funcTable.name[funcIndex]);
  const libIndex = resourceTable.lib[funcTable.resource[funcIndex]];
  if (libIndex !== null) {
    const libName = libs[libIndex].name;
    s += `[lib:${libName}]`;
  }
  const fileStringIndex = funcTable.fileName[funcIndex];
  if (fileStringIndex !== null) {
    s += `[file:${stringTable.getString(fileStringIndex)}]`;
  }
  const line = frameTable.line[frameIndex];
  if (line !== null) {
    s += `[line:${line}]`;
  }
  const address = frameTable.address[frameIndex];
  if (address !== -1) {
    s += `[address:${address.toString(16)}]`;
  }
  const nativeSymbol = frameTable.nativeSymbol[frameIndex];
  if (nativeSymbol !== null) {
    const symName = stringTable.getString(nativeSymbols.name[nativeSymbol]);
    const symAddrStr = nativeSymbols.address[nativeSymbol].toString(16);
    const functionSize = nativeSymbols.functionSize[nativeSymbol];
    cost symSizeStr = functionSize !== null ? functionSize.toString(16) : '';
    s += `[sym:${symName}:${symAddrStr}:${symSizeStr}]`;
  }
  const inlineDepth = frameTable.inlineDepth[frameIndex];
  if (inlineDepth !== 0) {
    s += `[inl:${inlineDepth}]`;
  }
  return s;
}

function getStack(thread, stackIndex) {
  const { stackTable } = thread;
  const stack = [];
  while (stackIndex !== null) {
    stack.unshift(getFrame(thread, stackTable.frame[stackIndex]));
    stackIndex = stackTable.prefix[stackIndex];
  }
  return stack;
}

getStack(filteredThread, filteredThread.samples.stack[0])
```
*/
export function getProfileFromTextSamples(
  ...allTextSamples: string[]
): ProfileWithDicts {
  let profile = getEmptyProfile();
  // Provide a useful marker schema, rather than an empty one.
  profile.meta.markerSchema = markerSchemaForTests;
  const categories = ensureExists(
    profile.meta.categories,
    'Expected to find categories.'
  );

  const globalDataCollector = new GlobalDataCollector();

  profile.threads = allTextSamples.map((textSamples, i) => {
    // Process the text.
    const textOnlyStacks = _parseTextSamples(textSamples);

    // See if the first row contains only numbers, if so this is the time of the sample.
    let sampleTimes = null;

    // Check if the first row is made by base 10 integers. 0x200 and other will parse
    // as numbers, but they can be used as valid function names.
    const isFirstRowMadeOfNumbers = textOnlyStacks.every((stack) =>
      /^\d+$/.test(stack[0])
    );
    if (isFirstRowMadeOfNumbers) {
      sampleTimes = textOnlyStacks.map((stack) => parseInt(stack[0]));
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

    // Turn this into a real thread.
    const thread = _buildThreadFromTextOnlyStacks(
      textOnlyStacks,
      funcNames,
      categories,
      globalDataCollector,
      sampleTimes
    );

    // Make sure all threads have a unique tid
    thread.tid = i;

    return thread;
  });

  profile = { ...profile, ...globalDataCollector.finish() };

  return getProfileWithDicts(profile);
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
  return [indent, ...columnSeparatorRanges.map((range) => range.end + indent)];
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
    (t) => t
  );
  if (lines.length === 0) {
    throw new Error('Empty text data was sent');
  }

  // Compute the index of where the columns start in the string.
  const columnPositions = _getColumnPositions(lines[0]);

  // Create a table of string cells. Empty cells contain the empty string.
  const rows = lines.map((line) =>
    columnPositions.map((pos, columnIndex) =>
      line.substring(pos, columnPositions[columnIndex + 1]).trim()
    )
  );

  // Transpose the table to go from columns to rows.
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
    const category = categories.findIndex((c) => c.name === categoryName);
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

function _findFileNameFromFuncName(
  funcNameWithModifier: string
): string | null {
  const findFileNameResult = /\[file:([^\]]+)\]/.exec(funcNameWithModifier);
  if (findFileNameResult) {
    const fileName = findFileNameResult[1];
    return fileName;
  }

  return null;
}

function _findLineNumberFromFuncName(
  funcNameWithModifier: string
): LineNumber | null {
  const findLineNumberResult = /\[line:([0-9]+)\]/.exec(funcNameWithModifier);
  if (findLineNumberResult) {
    return +findLineNumberResult[1];
  }

  return null;
}

function _findAddressFromFuncName(
  funcNameWithModifier: string
): Address | null {
  const findAddressResult = /\[address:([0-9a-f]+)\]/.exec(
    funcNameWithModifier
  );
  if (findAddressResult) {
    return parseInt(findAddressResult[1], 16);
  }

  return null;
}

function _findInlineDepthFromFuncName(
  funcNameWithModifier: string
): Address | null {
  const findInlineDepthResult = /\[inl:([0-9]+)\]/.exec(funcNameWithModifier);
  if (findInlineDepthResult) {
    return +findInlineDepthResult[1];
  }

  return null;
}

function _findNativeSymbolNameFromFuncName(
  funcNameWithModifier: string
): {| name: string, address: Address, functionSize: Bytes | null |} | null {
  const findNativeSymbolResult = /\[sym:([^\]]+)\]/.exec(funcNameWithModifier);
  if (findNativeSymbolResult) {
    const s = findNativeSymbolResult[1];
    const symbolInfoResult = /([^:]+):([0-9a-f]+):([0-9a-f]*)/.exec(s);
    if (!symbolInfoResult) {
      throw new Error(`Incorrect [sym:...] syntax: ${s}`);
    }
    return {
      name: symbolInfoResult[1],
      address: parseInt(symbolInfoResult[2], 16),
      functionSize:
        symbolInfoResult[3] !== '' ? parseInt(symbolInfoResult[3], 16) : null,
    };
  }

  return null;
}

function _buildThreadFromTextOnlyStacks(
  textOnlyStacks: Array<string[]>,
  funcNames: Array<string>,
  categories: CategoryList,
  globalDataCollector: GlobalDataCollector,
  sampleTimes: number[] | null
): RawThread {
  const thread = getEmptyThread();

  const {
    funcTable,
    stringArray,
    frameTable,
    stackTable,
    samples,
    resourceTable,
    nativeSymbols,
  } = thread;
  const stringTable = StringTable.withBackingArray(stringArray);

  // Create the FuncTable.
  funcNames.forEach((funcName) => {
    funcTable.name.push(stringTable.indexForString(funcName));
    funcTable.fileName.push(null);
    funcTable.relevantForJS.push(funcName.endsWith('-relevantForJS'));
    funcTable.isJS.push(_isJsFunctionName(funcName));
    funcTable.lineNumber.push(null);
    funcTable.columnNumber.push(null);
    // Ignore resources for now, this way funcNames have really nice string indexes.
    // The resource column will be filled in the loop below.
    funcTable.length++;
  });

  // This map caches resource indexes for library names.
  const resourceIndexCache = {};

  // Create the samples, stacks, and frames.
  textOnlyStacks.forEach((column, columnIndex) => {
    let prefix = null;
    column.forEach((funcNameWithModifier) => {
      const funcName = funcNameWithModifier.replace(/\[.*/, '');

      // There is a one-to-one relationship between strings and funcIndexes here, so
      // the indexes can double as both string indexes and func indexes.
      const funcIndex = stringTable.indexForString(funcName);

      // Find the library name from the function name and create an entry if needed.
      const libraryName = _findLibNameFromFuncName(funcNameWithModifier);
      let resourceIndex = -1;
      let libIndex = null;
      if (libraryName) {
        resourceIndex = resourceIndexCache[libraryName];
        if (resourceIndex === undefined) {
          libIndex = globalDataCollector.indexForLib({
            arch: '',
            name: libraryName,
            path: '/path/to/' + libraryName,
            debugName: libraryName,
            debugPath: '/path/to/' + libraryName,
            breakpadId: 'SOMETHING_FAKE',
            codeId: null,
          });

          resourceTable.lib.push(libIndex);
          resourceTable.name.push(stringTable.indexForString(libraryName));
          resourceTable.type.push(resourceTypes.library);
          resourceTable.host.push(null);
          resourceIndex = resourceTable.length++;

          resourceIndexCache[libraryName] = resourceIndex;
        } else {
          libIndex = resourceTable.lib[resourceIndex];
        }
      }

      funcTable.resource[funcIndex] = resourceIndex;

      // Find the file name from the function name
      const fileName = _findFileNameFromFuncName(funcNameWithModifier);
      if (fileName) {
        funcTable.fileName[funcIndex] = stringTable.indexForString(fileName);
      }

      const category = _findCategoryFromFuncName(
        funcNameWithModifier,
        funcName,
        categories
      );
      const lineNumber = _findLineNumberFromFuncName(funcNameWithModifier);
      const address =
        _findAddressFromFuncName(funcNameWithModifier) ??
        (funcName.startsWith('0x') ? parseInt(funcName.substr(2), 16) : -1);

      let nativeSymbol = null;
      const nativeSymbolInfo =
        _findNativeSymbolNameFromFuncName(funcNameWithModifier);
      if (nativeSymbolInfo) {
        const nativeSymbolNameStringIndex = stringTable.indexForString(
          nativeSymbolInfo.name
        );
        const nativeSymbolIndex = nativeSymbols.name.indexOf(
          nativeSymbolNameStringIndex
        );
        if (nativeSymbolIndex !== -1) {
          nativeSymbol = nativeSymbolIndex;
        } else if (libIndex !== null) {
          nativeSymbol = nativeSymbols.length++;
          nativeSymbols.libIndex.push(libIndex);
          nativeSymbols.address.push(nativeSymbolInfo.address);
          nativeSymbols.name.push(nativeSymbolNameStringIndex);
          nativeSymbols.functionSize.push(nativeSymbolInfo.functionSize);
        } else {
          throw new Error(
            `[sym:] has to be used together with [lib:] - missing lib in "${funcNameWithModifier}"`
          );
        }
      }
      const inlineDepth =
        _findInlineDepthFromFuncName(funcNameWithModifier) ?? 0;

      // Attempt to find a frame that satisfies the given funcIndex,
      // category, and line number.
      let frameIndex;
      for (let i = 0; i < frameTable.length; i++) {
        if (
          funcIndex === frameTable.func[i] &&
          category === frameTable.category[i] &&
          lineNumber === frameTable.line[i] &&
          address === frameTable.address[i] &&
          inlineDepth === frameTable.inlineDepth[i] &&
          nativeSymbol === frameTable.nativeSymbol[i]
        ) {
          frameIndex = i;
          break;
        }
      }

      if (frameIndex === undefined) {
        frameTable.func.push(funcIndex);
        frameTable.address.push(address);
        frameTable.inlineDepth.push(inlineDepth);
        frameTable.category.push(category);
        frameTable.subcategory.push(0);
        frameTable.innerWindowID.push(0);
        frameTable.nativeSymbol.push(nativeSymbol);
        frameTable.line.push(lineNumber);
        frameTable.column.push(null);
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
        stackTable.frame.push(frameIndex);
        stackTable.prefix.push(prefix);
        stackIndex = stackTable.length++;
      }

      prefix = stackIndex;
    });

    // Add a single sample for each column.
    samples.length++;
    ensureExists(samples.eventDelay).push(0);
    samples.stack.push(prefix);
    ensureExists(samples.time).push(columnIndex);
  });

  if (sampleTimes) {
    samples.time = sampleTimes;
  }

  return thread;
}

export function getFuncNamesDictForThread(thread: Thread): {
  funcNames: string[],
  funcNamesDict: { [funcName: string]: number },
} {
  const { funcTable, stringTable } = thread;
  const funcNames = [];
  const funcNamesDict = {};
  for (let i = 0; i < funcTable.length; i++) {
    const funcName = stringTable.getString(funcTable.name[i]);
    funcNames[i] = funcName;
    funcNamesDict[funcName] = i;
  }
  return { funcNames, funcNamesDict };
}

export function getNativeSymbolsDictForThread(thread: Thread): {
  [nativeSymbolName: string]: number,
} {
  const { nativeSymbols, stringTable } = thread;
  const nativeSymbolsDict = {};
  for (let i = 0; i < nativeSymbols.length; i++) {
    const name = stringTable.getString(nativeSymbols.name[i]);
    nativeSymbolsDict[name] = i;
  }
  return nativeSymbolsDict;
}

export function getProfileWithDicts(profile: Profile): ProfileWithDicts {
  const defaultCategory = ensureExists(
    profile.meta.categories,
    'Expected to find categories'
  ).findIndex((c) => c.name === 'Other');

  const referenceCPUDeltaPerMs = computeReferenceCPUDeltaPerMs(profile);
  const derivedThreads = profile.threads.map((rawThread) =>
    computeThreadFromRawThread(
      rawThread,
      profile.meta.sampleUnits,
      referenceCPUDeltaPerMs,
      defaultCategory
    )
  );
  const funcNameDicts = derivedThreads.map(getFuncNamesDictForThread);
  const funcNamesPerThread = funcNameDicts.map(({ funcNames }) => funcNames);
  const funcNamesDictPerThread = funcNameDicts.map(
    ({ funcNamesDict }) => funcNamesDict
  );
  const nativeSymbolsDictPerThread = derivedThreads.map(
    getNativeSymbolsDictForThread
  );

  return {
    profile,
    derivedThreads,
    funcNamesPerThread,
    funcNamesDictPerThread,
    nativeSymbolsDictPerThread,
    defaultCategory,
  };
}

/**
 * This returns a merged profile from a number of profile strings.
 */
export function getMergedProfileFromTextSamples(
  profileStrings: string[],
  cpuValuesPerProfile: Array<{|
    threadCPUDelta: Array<number | null>,
    threadCPUDeltaUnit: ThreadCPUDeltaUnit,
  |} | null> = []
): ProfileWithDicts {
  const profilesAndFuncNames = profileStrings.map((str) =>
    getProfileFromTextSamples(str)
  );
  const profiles = profilesAndFuncNames.map(({ profile }) => profile);
  cpuValuesPerProfile.forEach((cpuValues, profileIndex) => {
    if (cpuValues) {
      addCpuUsageValues(
        profiles[profileIndex],
        cpuValues.threadCPUDelta,
        cpuValues.threadCPUDeltaUnit
      );
    }
  });

  const profileState = stateFromLocation({
    pathname: '/public/fakehash1/',
    search: '?thread=0&v=3',
    hash: '',
  });
  const { profile } = mergeProfilesForDiffing(
    profiles,
    profiles.map(() => profileState)
  );
  return getProfileWithDicts(profile);
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

  if (payload.innerWindowID !== undefined) {
    startPayload.innerWindowID = payload.innerWindowID;
  }

  if (payload.isPrivateBrowsing !== undefined) {
    startPayload.isPrivateBrowsing = payload.isPrivateBrowsing;
  }

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

  const tabID = 123123;
  const innerWindowID = 1;

  profile.pages = [
    {
      tabID: tabID,
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
      6,
      ({
        ...loadPayloadBase,
      }: NavigationMarkerPayload),
    ],
    ['TTI', 6],
    [
      'Navigation::Start',
      7,
      null,
      ({
        ...domContentLoadedBase,
      }: NavigationMarkerPayload),
    ],
    ['Navigation::Start', 8],
    ['FirstContentfulPaint', 7, 8],
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
  otherPid: Pid,
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
    otherPid: '1234',
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

export function getScreenshotMarkersForWindowId(
  windowID: string,
  count: number
): TestDefinedMarkers {
  return Array(count)
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
}

export function getScreenshotTrackProfile() {
  return getProfileWithMarkers([
    ...getScreenshotMarkersForWindowId('0', 5), // This window isn't closed, so we should repeat the last screenshot
    ...getScreenshotMarkersForWindowId('1', 5), // This window is closed after screenshot 6.
    ...getScreenshotMarkersForWindowId('2', 10), // This window isn't closed and define the profile length
    [
      'CompositorScreenshotWindowDestroyed',
      6,
      null,
      {
        type: 'CompositorScreenshot',
        windowID: '1',
        url: undefined,
      },
    ],
  ]);
}

/**
 * Add IPC marker pair to both the sender and receiver threads.
 * This is a helper function to make it easy to add it to both threads.
 */
export function addIPCMarkerPairToThreads(
  payload: $Shape<IPCMarkerPayload>,
  senderThread: RawThread,
  receiverThread: RawThread
) {
  const ipcMarker = (
    direction: 'sending' | 'receiving',
    isParent: boolean,
    otherThread: RawThread
  ) => [
    'IPC',
    payload.startTime,
    payload.endTime,
    {
      type: 'IPC',
      startTime: 1,
      endTime: 10,
      otherPid: otherThread.pid,
      messageSeqno: 1,
      messageType: 'PContent::Msg_PreferenceUpdate',
      side: isParent ? 'parent' : 'child',
      direction: direction,
      phase: 'endpoint',
      sync: false,
      niceDirection: `sending to ${receiverThread.name}`,
      sendTid: senderThread.tid,
      sendThreadName: senderThread.name,
      recvTid: receiverThread.tid,
      recvThreadName: receiverThread.name,
      ...payload,
    },
  ];

  const isSenderParent =
    senderThread.name === 'GeckoMain' && senderThread.processType === 'default'
      ? true
      : false;
  addMarkersToThreadWithCorrespondingSamples(senderThread, [
    ipcMarker('sending', isSenderParent, receiverThread),
  ]);

  addMarkersToThreadWithCorrespondingSamples(receiverThread, [
    ipcMarker('receiving', !isSenderParent, senderThread),
  ]);
}

export function getVisualProgressTrackProfile(profileString: string): Profile {
  const { profile } = getProfileFromTextSamples(profileString);
  profile.meta.visualMetrics = getVisualMetrics();
  return profile;
}

export function getJsTracerTable(
  stringTable: StringTable,
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
): RawThread {
  const thread = getEmptyThread();
  const stringTable = StringTable.withBackingArray(thread.stringArray);
  thread.jsTracer = getJsTracerTable(stringTable, events);

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
  profile.threads = eventsLists.map((events) =>
    getThreadWithJsTracerEvents(events)
  );
  return profile;
}

/**
 * Creates a Counter fixture for a given thread.
 */
export function getCounterForThread(
  thread: RawThread,
  mainThreadIndex: ThreadIndex,
  config: { hasCountNumber: boolean } = {}
): RawCounter {
  const sampleTimes = computeTimeColumnForRawSamplesTable(thread.samples);
  const counter: RawCounter = {
    name: 'My Counter',
    category: 'My Category',
    description: 'My Description',
    pid: thread.pid,
    mainThreadIndex,
    samples: {
      time: sampleTimes.slice(),
      // Create some arbitrary (positive integer) values for the number.
      number: config.hasCountNumber
        ? sampleTimes.map((_, i) => Math.floor(50 * Math.sin(i) + 50))
        : undefined,
      // Create some arbitrary values for the count.
      count: sampleTimes.map((_, i) => Math.sin(i)),
      length: thread.samples.length,
    },
  };
  return counter;
}

/**
 * Creates a Counter fixture for a given thread with the given samples.
 */
export function getCounterForThreadWithSamples(
  thread: RawThread,
  mainThreadIndex: ThreadIndex,
  samples: {
    time?: number[],
    number?: number[],
    count?: number[],
    length: number,
  },
  name?: string,
  category?: string
): RawCounter {
  const newSamples = {
    time: samples.time
      ? samples.time
      : Array.from({ length: samples.length }, (_, i) => i),
    number: samples.number ? samples.number : Array(samples.length).fill(0),
    count: samples.count
      ? samples.count
      : Array(samples.length).map((_, i) => Math.sin(i)),
    length: samples.length,
  };

  const counter: RawCounter = {
    name: name ?? 'My Counter',
    category: category ?? 'My Category',
    description: 'My Description',
    pid: thread.pid,
    mainThreadIndex,
    samples: newSamples,
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
): RawThread {
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
    funcNamesPerThread: [funcNames],
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

  return { profile, funcNamesDict, funcNames };
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
  } = getProfileFromTextSamples(
    // We need to take care that A, B, Gjs, Gjs has the most samples, because
    // some tests rely on this.
    `
      A  A    A                           A  A  A    A
      B  B    B                           B  B  B    B
      C  Fjs  Fjs                         C  C  Fjs  Fjs
      D  Gjs  Gjs                         J  J  Gjs  Gjs
      E       Hjs[lib:jQuery.js]             K
              I[lib:libI.so][cat:Layout]
    `
  );

  // Now add a NativeAllocationsTable.
  const nativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
  profile.threads[0].nativeAllocations = nativeAllocations;

  // The stack table is built sequentially, so we can assume that the stack indexes
  // match the func indexes.
  const { E, I, Gjs, J, K } = funcNamesDict;

  // Create a list of allocations.
  const allocations = [
    // Allocations:
    { byteSize: 3, stack: E },
    { byteSize: 5, stack: Gjs },
    { byteSize: 7, stack: I },
    // Deallocations:
    { byteSize: -11, stack: J },
    { byteSize: -13, stack: K },
    { byteSize: -17, stack: Gjs },
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
  } = getProfileFromTextSamples(
    // We need to take care that A, B, Gjs, Gjs has the most samples, because
    // some tests rely on this.
    `
      A  A    A                   A  A  A    A
      B  B    B                   B  B  B    B
      C  Fjs  Fjs                 C  C  Fjs  Fjs
      D  Gjs  Gjs                 J  J  Gjs  Gjs
      E       Hjs[lib:jQuery.js]     K
              I[lib:libI.so]
    `
  );

  // Now add a NativeAllocationsTable.
  const nativeAllocations = getEmptyBalancedNativeAllocationsTable();
  const [thread] = profile.threads;
  thread.nativeAllocations = nativeAllocations;
  const threadId = thread.tid;
  if (typeof threadId !== 'number') {
    throw new Error(
      'Expected to have a number threadId in the thread structure.'
    );
  }

  // The stack table is built sequentially, so we can assume that the stack indexes
  // match the func indexes.
  const { E, I, Gjs, J, K } = funcNamesDict;

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
    // Deallocations that match the first group. Deallocations don't always
    // happen at the same stack.
    { byteSize: -3, stack: J, memoryAddress: 0x10 },
    { byteSize: -5, stack: K, memoryAddress: 0x11 },
    { byteSize: -7, stack: Gjs, memoryAddress: 0x12 },
    // Unmatched deallocations:
    { byteSize: -3, stack: J, memoryAddress: 0x10 }, // This is testing that we don't match it twice.
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
 * Add pages array and activeTabTabID to the given profile.
 * Pages array has the following relationship:
 * Tab #1                           Tab #2
 * --------------                --------------
 * cnn.com                        profiler.firefox.com
 * |- youtube.com                 |
 * |  |- google.com               google.com
 * |
 * mozilla.org
 */
export function addActiveTabInformationToProfile(
  profile: Profile,
  activeTabID?: TabID
) {
  const firstTabTabID = 1;
  const secondTabTabID = 4;
  const parentInnerWindowIDsWithChildren = 11111111111;
  const iframeInnerWindowIDsWithChild = 11111111112;
  const firstTabInnerWindowIDs = [
    parentInnerWindowIDsWithChildren,
    iframeInnerWindowIDsWithChild,
    11111111113,
    11111111115,
  ];
  const secondTabInnerWindowIDs = [11111111114, 11111111116];

  // Default to first tab tabID if not given
  activeTabID = activeTabID === undefined ? firstTabTabID : activeTabID;

  // Add the pages array
  const pages = [
    // A top most page in the first tab
    {
      tabID: firstTabTabID,
      innerWindowID: parentInnerWindowIDsWithChildren,
      url: 'https://www.cnn.com/',
      embedderInnerWindowID: 0,
    },
    // An iframe page inside the previous page
    {
      tabID: firstTabTabID,
      innerWindowID: iframeInnerWindowIDsWithChild,
      url: 'https://www.youtube.com/',
      embedderInnerWindowID: parentInnerWindowIDsWithChildren,
    },
    // Another iframe page inside the previous iframe
    {
      tabID: firstTabTabID,
      innerWindowID: firstTabInnerWindowIDs[2],
      url: 'https://www.google.com/',
      embedderInnerWindowID: iframeInnerWindowIDsWithChild,
    },
    // A top most frame from the second tab
    {
      tabID: secondTabTabID,
      innerWindowID: secondTabInnerWindowIDs[0],
      url: 'https://profiler.firefox.com/',
      embedderInnerWindowID: 0,
    },
    // Another top most frame from the first tab
    // Their tabIDs are the same because of that.
    {
      tabID: firstTabTabID,
      innerWindowID: firstTabInnerWindowIDs[3],
      url: 'https://mozilla.org/',
      embedderInnerWindowID: 0,
    },
    // Another top most frame from the second tab
    {
      tabID: secondTabTabID,
      innerWindowID: secondTabInnerWindowIDs[1],
      url: 'https://www.google.com/',
      embedderInnerWindowID: secondTabInnerWindowIDs[0],
    },
  ];

  profile.pages = pages;

  // Set the active Tab ID.
  profile.meta.configuration = {
    activeTabID,
    capacity: 1,
    features: [],
    threads: [],
  };

  return {
    profile,
    firstTabTabID,
    secondTabTabID,
    parentInnerWindowIDsWithChildren,
    iframeInnerWindowIDsWithChild,
    activeTabID,
    firstTabInnerWindowIDs,
    secondTabInnerWindowIDs,
  };
}

/**
 * Use this function to create a profile that has private browsing data.
 * This profile should first be run through addActiveTabInformationToProfile to
 * add pages information.
 * To add markers with private browsing information, please use
 * addMarkersToThreadWithCorrespondingSamples directly.
 *
 * Then:
 * @param profile The profile to change
 * @param privateBrowsingPages The array of page IDs to switch to private
 * @param threads Optional, this specifies the threads to set to private. This
 *                happens in Firefox in Fission mode, but not otherwise.
 */
export function markTabIdsAsPrivateBrowsing(
  profile: Profile,
  privateBrowsingPages: TabID[]
) {
  const pages = profile.pages;
  if (!pages) {
    throw new Error(
      `Can't add private browsing data to a profile without pages. Please run addActiveTabInformationToProfile on this profile first.`
    );
  }

  for (const page of pages) {
    if (privateBrowsingPages.includes(page.tabID)) {
      page.isPrivateBrowsing = true;
    }
  }
}

// /!\ This algorithm is good enough for tests, but it's not correct for
// general cases.
function getStackIndexForCallNodePath(
  { stackTable, frameTable }: RawThread,
  callNodePath: CallNodePath
): IndexIntoStackTable {
  let currentFuncInCallNodePath = 0;
  let currentFuncIndexToFind = callNodePath[0];
  let foundStackIndex = null;
  for (let stackIndex = 0; stackIndex < stackTable.length; stackIndex++) {
    const frameIndex = stackTable.frame[stackIndex];
    const funcIndex = frameTable.func[frameIndex];

    if (currentFuncIndexToFind === funcIndex) {
      currentFuncInCallNodePath++;
      if (currentFuncInCallNodePath === callNodePath.length) {
        foundStackIndex = stackIndex;
        break;
      }

      currentFuncIndexToFind = callNodePath[currentFuncInCallNodePath];
    }
  }

  if (foundStackIndex === null) {
    throw new Error(
      `The call node path [${String(
        callNodePath
      )}] wasn't found in the stack table.`
    );
  }

  return foundStackIndex;
}

/**
 * Use this function to add window id information to frames, using call node
 * paths to point to frames using stacks.
 *
 * @param thread The thread to mutate.
 * @param listOfOperations A list of pairs { innerWindowID, callNodes }
 *                         indicating which call nodes this innerWindowID will
 *                         be assigned to.
 * @param callNodesToDupe These call nodes point to frames that will be duped to
 *                        get all passed innerWindowIDs
 */
export function addInnerWindowIdToStacks(
  thread: RawThread,
  listOfOperations: Array<{ innerWindowID: number, callNodes: CallNodePath[] }>,
  callNodesToDupe?: CallNodePath[]
) {
  const { stackTable, frameTable, samples } = thread;

  for (const { innerWindowID, callNodes } of listOfOperations) {
    for (const callNode of callNodes) {
      const stackIndex = getStackIndexForCallNodePath(thread, callNode);
      const foundFrameIndex = stackTable.frame[stackIndex];
      frameTable.innerWindowID[foundFrameIndex] = innerWindowID;
    }
  }

  if (callNodesToDupe) {
    if (listOfOperations.length !== 2) {
      throw new Error(
        `This tool doesn't support more than 2 innerWindowIDs for duping.`
      );
    }

    // callNodesToChange contains the call nodes we want to dupe so that the
    // original comes from a non-private browsing window, while the dupe comes
    // from a private browsing window.

    const mapStackIndexToDupe = new Map();

    for (const callNode of callNodesToDupe) {
      const stackIndex = getStackIndexForCallNodePath(thread, callNode);
      const foundFrameIndex = stackTable.frame[stackIndex];
      // The found one comes from the first tab.
      frameTable.innerWindowID[foundFrameIndex] =
        listOfOperations[0].innerWindowID;

      // Clone this frame
      const newFrameIndex = frameTable.length++;
      frameTable.address.push(frameTable.address[foundFrameIndex]);
      frameTable.inlineDepth.push(frameTable.inlineDepth[foundFrameIndex]);
      frameTable.category.push(frameTable.category[foundFrameIndex]);
      frameTable.subcategory.push(frameTable.subcategory[foundFrameIndex]);
      frameTable.func.push(frameTable.func[foundFrameIndex]);
      frameTable.nativeSymbol.push(frameTable.nativeSymbol[foundFrameIndex]);
      frameTable.line.push(frameTable.line[foundFrameIndex]);
      frameTable.column.push(frameTable.column[foundFrameIndex]);

      // And that one comes from the second tab.
      frameTable.innerWindowID.push(listOfOperations[1].innerWindowID);

      // Clone the stack
      const newStackIndex = stackTable.length++;
      stackTable.prefix.push(stackTable.prefix[stackIndex]);
      // Using the cloned frame index.
      stackTable.frame.push(newFrameIndex);

      mapStackIndexToDupe.set(stackIndex, newStackIndex);
    }

    const sampleTimes = ensureExists(samples.time);
    for (let sampleIndex = samples.length; sampleIndex >= 0; sampleIndex--) {
      // We're looping from the end because we'll push some samples to the end
      // and don't want to look at them.
      const stackIndex = samples.stack[sampleIndex];
      const newStackIndex = mapStackIndexToDupe.get(stackIndex);
      if (newStackIndex === undefined) {
        continue;
      }

      // Dupe the sample
      sampleTimes.push(sampleTimes[samples.length - 1] + 1);
      samples.stack.push(newStackIndex);
      if (samples.eventDelay) {
        samples.eventDelay.push(samples.eventDelay[sampleIndex]);
      }
      if (samples.responsiveness) {
        samples.responsiveness.push(samples.responsiveness[sampleIndex]);
      }
      if (samples.threadCPUDelta) {
        samples.threadCPUDelta.push(samples.threadCPUDelta[sampleIndex]);
      }
      if (samples.weight) {
        samples.weight.push(samples.weight[sampleIndex]);
      }
      samples.length++;
    }
  }
}

/**
 * Creates a profile that includes a thread with threadCPUDelta values.
 */
export function getProfileWithThreadCPUDelta(
  threadCPUDeltaPerThread: Array<Array<number | null> | void>,
  unit: ThreadCPUDeltaUnit = 'ns',
  interval: Milliseconds = 1
): Profile {
  if (threadCPUDeltaPerThread.length === 0) {
    throw new Error(
      'getProfileWithThreadCPUDelta expected to get at least one array of threadCPUDelta.'
    );
  }

  const profile = getEmptyProfile();
  profile.meta.markerSchema = markerSchemaForTests;
  profile.threads = threadCPUDeltaPerThread.map((threadCPUDelta) =>
    getThreadWithThreadCPUDelta(threadCPUDelta, interval)
  );
  profile.meta.sampleUnits = {
    time: 'ms',
    eventDelay: 'ms',
    threadCPUDelta: unit,
  };

  return profile;
}

/**
 * Creates a thread with threadCPUDelta values.
 */
export function getThreadWithThreadCPUDelta(
  userThreadCPUDelta?: Array<number | null>,
  interval: Milliseconds = 1
): RawThread {
  const thread = getEmptyThread();
  const samplesLength = userThreadCPUDelta ? userThreadCPUDelta.length : 10;

  // Re-construct the samples table with new threadCPUDelta values.
  thread.samples = {
    threadCPUDelta: userThreadCPUDelta,
    eventDelay: Array(samplesLength).fill(null),
    stack: Array(samplesLength).fill(null),
    time: Array.from({ length: samplesLength }, (_, i) => i * interval),
    weight: null,
    weightType: 'samples',
    length: samplesLength,
  };

  return thread;
}

/**
 * Adds the necessary CPU usage values to the given profile.
 */
export function addCpuUsageValues(
  profile: Profile,
  threadCPUDelta: Array<number | null>,
  threadCPUDeltaUnit: ThreadCPUDeltaUnit,
  interval: Milliseconds = 1
) {
  profile.meta.interval = interval;
  profile.meta.sampleUnits = {
    time: 'ms',
    eventDelay: 'ms',
    threadCPUDelta: threadCPUDeltaUnit,
  };
  profile.threads[0].samples.threadCPUDelta = threadCPUDelta;
}
