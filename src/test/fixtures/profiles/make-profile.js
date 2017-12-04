/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { getEmptyProfile } from '../../../profile-logic/profile-data';
import { UniqueStringArray } from '../../../utils/unique-string-array';
import type { Profile, Thread } from '../../../types/profile';
import type { MarkerPayload } from '../../../types/markers';
import type { Milliseconds } from '../../../types/units';

// Array<[MarkerName, Milliseconds, Data]>
type MarkerName = string;
type MarkerTime = Milliseconds;
type DataPayload =
  | MarkerPayload
  | {| startTime: Milliseconds, endTime: Milliseconds |};
type TestDefinedMarkers = Array<[MarkerName, MarkerTime, DataPayload]>;

export { getEmptyProfile } from '../../../profile-logic/profile-data';

export function addMarkersToProfileReplacingSamples(
  markers: TestDefinedMarkers,
  profile: Profile
) {
  const thread = profile.threads[0];
  const stringTable = thread.stringTable;
  const markersTable = thread.markers;
  const samples = {
    time: [],
    responsiveness: [],
    stack: [],
    rss: [],
    uss: [],
    length: 0,
  };
  thread.samples = samples;

  markers.forEach(([name, time, data]) => {
    if (data && !data.type) {
      data = {
        type: 'DummyForTests',
        startTime: data.startTime,
        endTime: data.endTime,
      };
    }
    markersTable.name.push(stringTable.indexForString(name));
    markersTable.time.push(time);
    markersTable.data.push(data);
    markersTable.length++;

    // trying to get a consistent profile with a sample for each marker
    const startTime = time;
    // If we have no data, endTime is the same as startTime
    const endTime = data ? data.endTime : time;
    samples.time.push(startTime, endTime);
    samples.length++;
  });

  samples.time.sort();
}

export function getProfileWithMarkers(markers: TestDefinedMarkers): Profile {
  const profile = getEmptyProfile();
  profile.threads.push(getEmptyThread());
  addMarkersToProfileReplacingSamples(markers, profile);
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
        frameNumber: [],
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
        length: 0,
      },
      frameTable: {
        address: [],
        category: [],
        func: [],
        implementation: [],
        line: [],
        optimizations: [],
        length: 0,
      },
      stringTable: new UniqueStringArray(),
      libs: [],
      funcTable: {
        address: [],
        isJS: [],
        name: [],
        resource: [],
        fileName: [],
        lineNumber: [],
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
 *
 * Example usage:
 *
 * ```
 * const profile = getProfileFromTextSamples(`
 *   A       A        A     A
 *   B.js    B.js     F     F
 *   C.js    C.js     G     G
 *   D       D              H
 *   E       E
 * `);
 * ```
 *
 * The function names are aligned vertically on the left. This would produce 4 samples
 * with the stacks based off of those functions listed, with A being the root. Whitespace
 * is trimmed.
 */
export function getProfileFromTextSamples(
  text: string
): { profile: Profile, funcNames: string[] } {
  const nonEmpty = t => t;
  const lines = text.split('\n').filter(nonEmpty);

  // Compute the index of where the columns start in the string. String.prototype.split
  // can't be used here because it would put functions on the wrong sample. In the example
  // usage from the function comment above, the third sample would have the stack
  // [A, F, G, H] if splitting was used, misaligning the function H.
  const columnIndexes = [];
  {
    const firstLine = lines[0];
    if (!firstLine) {
      throw new Error('Empty text data was sent');
    }
    let searchWhitespace = true;
    for (let i = 0; i < firstLine.length; i++) {
      const isSpace = firstLine[i] === ' ';
      if (searchWhitespace) {
        if (!isSpace) {
          columnIndexes.push(i);
          searchWhitespace = false;
        }
      } else {
        if (isSpace) {
          searchWhitespace = true;
        }
      }
    }
  }

  // Split up each line into rows of characters
  const rows = lines.map(line => {
    return columnIndexes.map(columnIndex => {
      let funcName = '';
      for (let i = columnIndex; i < line.length; i++) {
        const char = line[i];
        if (char === ' ') {
          break;
        } else {
          funcName += char;
        }
      }
      return funcName;
    });
  });

  const firstRow = rows[0];
  if (!firstRow) {
    throw new Error('No valid data.');
  }

  // Go from rows to columns
  const columns = firstRow.map((_, columnIndex) => {
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

  const profile = getEmptyProfile();
  const thread = getEmptyThread();
  profile.threads.push(thread);
  const {
    funcTable,
    stringTable,
    frameTable,
    stackTable,
    samples,
    resourceTable,
    libs,
  } = thread;

  const funcNames = columns
    // Flatten the arrays.
    .reduce((memo, row) => [...memo, ...row], [])
    // Make the list unique.
    .filter((item, index, array) => array.indexOf(item) === index);

  const resourceIndexCache = {};

  // Create the FuncTable.
  funcNames.forEach(funcName => {
    funcTable.name.push(stringTable.indexForString(funcName));
    funcTable.address.push(0);
    funcTable.fileName.push(null);
    funcTable.isJS.push(funcName.endsWith('js'));
    funcTable.lineNumber.push(null);
    // Ignore resources for now, this way funcNames have really nice string indexes.
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

  // Create the samples, stacks, and frames.
  columns.forEach((column, columnIndex) => {
    let prefix = null;
    column.forEach(funcName => {
      // There is a one-to-one relationship between strings and funcIndexes here, so
      // the indexes can double as both string indexes and func indexes.
      const funcIndex = stringTable.indexForString(funcName);

      // Attempt to find a stack that satisfies the given funcIndex and prefix.
      let stackIndex;
      for (let i = 0; i < stackTable.length; i++) {
        if (stackTable.prefix[i] === prefix) {
          const frameIndex = stackTable.frame[i];
          if (funcIndex === frameTable.func[frameIndex]) {
            stackIndex = i;
            break;
          }
        }
      }

      // If we couldn't find a stack, go ahead and create a stack and frame.
      if (stackIndex === undefined) {
        const frameIndex = frameTable.length++;
        frameTable.func.push(funcIndex);
        frameTable.address.push(0);
        frameTable.category.push(null);
        frameTable.implementation.push(null);
        frameTable.line.push(null);
        frameTable.optimizations.push(null);

        stackTable.frame.push(frameIndex);
        stackTable.prefix.push(prefix);
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

  return { profile, funcNames };
}
