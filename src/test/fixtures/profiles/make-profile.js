/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getEmptyProfile } from '../../../profile-logic/profile-data';
import { UniqueStringArray } from '../../../utils/unique-string-array';
import type {
  Profile,
  Thread,
  IndexIntoCategoryList,
  CategoryList,
} from '../../../types/profile';
import type { MarkerPayload, NetworkPayload } from '../../../types/markers';
import type { Milliseconds } from '../../../types/units';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;
type MockPayload = {| startTime: Milliseconds, endTime: Milliseconds |};
type TestDefinedMarkers = Array<
  [MarkerName, MarkerTime, MarkerPayload | MockPayload]
>;

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

export { getEmptyProfile } from '../../../profile-logic/profile-data';

export function addMarkersToThreadWithCorrespondingSamples(
  thread: Thread,
  markers: TestDefinedMarkers
) {
  const stringTable = thread.stringTable;
  const markersTable = thread.markers;
  const samples = thread.samples;

  markers.forEach(([name, time, data]) => {
    markersTable.name.push(stringTable.indexForString(name));
    markersTable.time.push(time);
    markersTable.data.push(_refineMockPayload(data));
    markersTable.length++;

    // Try to get a consistent profile with a sample for each marker.
    const startTime = time;
    // If we have no data, endTime is the same as startTime.
    const endTime =
      data && typeof data.endTime === 'number' ? data.endTime : time;

    // Push on the start and end time.
    samples.time.push(startTime, endTime);
    samples.stack.push(null, null);
    samples.length += 2;
  });

  samples.time.sort();
}

export function getThreadWithMarkers(markers: TestDefinedMarkers) {
  const thread = getEmptyThread();
  addMarkersToThreadWithCorrespondingSamples(thread, markers);
  return thread;
}

export function getProfileWithMarkers(
  ...markersPerThread: TestDefinedMarkers[]
): Profile {
  const profile = getEmptyProfile();
  profile.threads = markersPerThread.map(testDefinedMarkers =>
    getThreadWithMarkers(testDefinedMarkers)
  );
  return profile;
}

export function getProfileWithNamedThreads(threadNames: string[]): Profile {
  const profile = getEmptyProfile();
  profile.threads = threadNames.map(name => getEmptyThread({ name }));
  return profile;
}

export function getEmptyThread(overrides: ?Object): Thread {
  return Object.assign(
    {
      processType: 'default',
      name: 'Empty',
      pid: 0,
      tid: 0,
      samples: {
        responsiveness: [],
        stack: [],
        time: [],
        rss: [],
        uss: [],
        length: 0,
      },
      markers: {
        data: [],
        name: [],
        time: [],
        length: 0,
      },
      stackTable: {
        frame: [],
        prefix: [],
        category: [],
        length: 0,
      },
      frameTable: {
        address: [],
        category: [],
        func: [],
        implementation: [],
        line: [],
        column: [],
        optimizations: [],
        length: 0,
      },
      stringTable: new UniqueStringArray(),
      libs: [],
      funcTable: {
        address: [],
        isJS: [],
        relevantForJS: [],
        name: [],
        resource: [],
        fileName: [],
        lineNumber: [],
        columnNumber: [],
        length: 0,
      },
      resourceTable: {
        addonId: [],
        icon: [],
        length: 0,
        lib: [],
        name: [],
        host: [],
        type: [],
      },
    },
    overrides
  );
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
    const funcNames = textOnlyStacks
      // Flatten the arrays.
      .reduce((memo, row) => [...memo, ...row], [])
      // remove modifiers
      .map(func => func.replace(/\[.*/, ''))
      // Make the list unique.
      .filter((item, index, array) => array.indexOf(item) === index);

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
  while ((match = regex.exec(str)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
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

function _findCategoryFromFuncName(
  funcNameWithModifier: string,
  categories: CategoryList
): IndexIntoCategoryList | null {
  const findCategoryResult = /\[cat:([^\]]+)\]/.exec(funcNameWithModifier);
  if (findCategoryResult) {
    const categoryName = findCategoryResult[1];
    const category = categories.findIndex(c => c.name === categoryName);
    if (category !== -1) {
      return category;
    }
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

  const resourceIndexCache = {};

  // Create the FuncTable.
  funcNames.forEach(funcName => {
    funcTable.name.push(stringTable.indexForString(funcName));
    funcTable.address.push(
      funcName.startsWith('0x') ? parseInt(funcName.substr(2), 16) : 0
    );
    funcTable.fileName.push(null);
    funcTable.relevantForJS.push(funcName.endsWith('js-relevant'));
    funcTable.isJS.push(funcName.endsWith('js'));
    funcTable.lineNumber.push(null);
    funcTable.columnNumber.push(null);
    // Ignore resources for now, this way funcNames have really nice string indexes.
    // The resource column will be filled in the loop below.
    funcTable.length++;
  });

  // Go back through and create resources as needed.
  funcNames.forEach(funcName => {
    // See if this sample has a resource like "funcName:libraryName".
    const [, libraryName] = funcName.match(/\w+:(\w+)/) || [];
    let resourceIndex = resourceIndexCache[libraryName];
    if (resourceIndex === undefined) {
      const libIndex = libs.length;
      if (libraryName) {
        libs.push({
          start: 0,
          end: 0,
          offset: 0,
          arch: '',
          name: libraryName,
          path: '/path/to/' + libraryName,
          debugName: libraryName,
          debugPath: '/path/to/' + libraryName,
          breakpadId: '',
        });
        resourceIndex = resourceTable.length++;
        resourceTable.lib.push(libIndex);
        resourceTable.name.push(stringTable.indexForString(libraryName));
        resourceTable.type.push(0);
        resourceTable.host.push(undefined);
      } else {
        resourceIndex = -1;
      }
      resourceIndexCache[libraryName] = resourceIndex;
    }

    funcTable.resource.push(resourceIndex);
  });

  const categoryOther = categories.findIndex(c => c.name === 'Other');

  // Create the samples, stacks, and frames.
  textOnlyStacks.forEach((column, columnIndex) => {
    let prefix = null;
    column.forEach(funcNameWithModifier => {
      const funcName = funcNameWithModifier.replace(/\[.*/, '');

      // There is a one-to-one relationship between strings and funcIndexes here, so
      // the indexes can double as both string indexes and func indexes.
      const funcIndex = stringTable.indexForString(funcName);

      // Find the wanted jit type from the function name
      const jitType = _findJitTypeFromFuncName(funcNameWithModifier);
      const jitTypeIndex = jitType ? stringTable.indexForString(jitType) : null;
      const category = _findCategoryFromFuncName(
        funcNameWithModifier,
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
        frameTable.address.push(0);
        frameTable.category.push(category);
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
        const prefixCategory =
          prefix === null ? categoryOther : stackTable.category[prefix];
        const stackCategory =
          frameCategory === null ? prefixCategory : frameCategory;

        stackTable.frame.push(frameIndex);
        stackTable.prefix.push(prefix);
        stackTable.category.push(stackCategory);
        stackIndex = stackTable.length++;
      }

      prefix = stackIndex;
    });

    // Add a single sample for each column.
    samples.length++;
    samples.responsiveness.push(0);
    samples.rss.push(null);
    samples.uss.push(null);
    samples.stack.push(prefix);
    samples.time.push(columnIndex);
  });
  return thread;
}

export function getNetworkMarker(startTime: number, id: number) {
  const payload: NetworkPayload = {
    type: 'Network',
    id,
    pri: 0,
    status: 'STOP',
    startTime,
    endTime: startTime + 1,
    URI: 'https://mozilla.org',
    RedirectURI: 'https://mozilla.org',
    dur: 0.2345,
    name: 'load 123: https://mozilla.org',
    title: '',
  };
  return ['Network', startTime, payload];
}

/**
 * This function computes a profile with network markers, which will in turn generate
 * a profile that contains a main thread track, and a network track.
 *
 * This generates 10 network markers ranged 3-4 ms on their start times.
 */
export function getNetworkTrackProfile() {
  return getProfileWithMarkers(
    Array(10)
      .fill()
      .map((_, i) => getNetworkMarker(3 + 0.1 * i, i))
  );
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
