/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { getContainingLibrary, getClosestLibrary } from './symbolication';
import { UniqueStringArray } from '../utils/unique-string-array';
import { resourceTypes } from './profile-data';
import { provideHostSide } from '../utils/promise-worker';
import { immutableUpdate } from '../utils/flow';
import {
  CURRENT_VERSION,
  upgradeProcessedProfileToCurrentVersion,
  isProcessedProfile,
} from './processed-profile-versioning';
import { upgradeGeckoProfileToCurrentVersion } from './gecko-profile-versioning';
import {
  isOldCleopatraFormat,
  convertOldCleopatraProfile,
} from './old-cleopatra-profile-format';
import { getEmptyTaskTracerData } from './task-tracer';
import { convertPhaseTimes } from './convert-markers';
import type {
  Profile,
  Thread,
  FrameTable,
  SamplesTable,
  StackTable,
  MarkersTable,
  Lib,
  FuncTable,
  ResourceTable,
  IndexIntoFuncTable,
  IndexIntoStringTable,
  IndexIntoResourceTable,
} from '../types/profile';
import type { Milliseconds } from '../types/units';
import type {
  GeckoProfile,
  GeckoThread,
  GeckoMarkerStruct,
  GeckoFrameStruct,
  GeckoSampleStruct,
  GeckoStackStruct,
} from '../types/gecko-profile';
import type {
  MarkerPayload,
  MarkerPayload_Gecko,
  GCSliceData_Gecko,
  GCMajorCompleted,
  GCMajorCompleted_Gecko,
  GCMajorAborted,
} from '../types/markers';

type RegExpResult = null | string[];
/**
 * Module for converting a Gecko profile into the 'processed' format.
 * @module process-profile
 */

/**
 * Turn a data table from the form `{ schema, data }` (as used in the Gecko profile
 * JSON) into a struct of arrays. This isn't very nice to read, but it
 * drastically reduces the number of JS objects the JS engine has to deal with,
 * resulting in fewer GC pauses and hopefully better performance.
 *
 * e.g Take geckoTable A data table of the form
 *   `{ schema, data }`.
 * And turn it into a data table of the form
 *  `{ length: number, field1: array, field2: array }`
 */
function _toStructOfArrays(geckoTable: Object): Object {
  const result = { length: geckoTable.data.length };
  for (const fieldName in geckoTable.schema) {
    const fieldIndex = geckoTable.schema[fieldName];
    if (typeof fieldIndex !== 'number') {
      throw new Error(
        'fieldIndex must be a number in the Gecko profile table.'
      );
    }
    result[fieldName] = geckoTable.data.map(
      entry => (fieldIndex in entry ? entry[fieldIndex] : null)
    );
  }
  return result;
}

/**
 * JS File information sometimes comes with multiple URIs which are chained
 * with " -> ". We only want the last URI in this list.
 */
function _getRealScriptURI(url: string): string {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

function _sortByField<T: Object>(fieldName: string, geckoTable: T): T {
  const fieldIndex: number = geckoTable.schema[fieldName];
  const sortedData: any[] = geckoTable.data.slice(0);
  sortedData.sort((a, b) => a[fieldIndex] - b[fieldIndex]);
  return Object.assign({}, geckoTable, { data: sortedData });
}

function _cleanFunctionName(functionName: string): string {
  const ignoredPrefix = 'non-virtual thunk to ';
  if (functionName.startsWith && functionName.startsWith(ignoredPrefix)) {
    return functionName.substr(ignoredPrefix.length);
  }
  return functionName;
}

type ExtractionInfo = {
  funcTable: FuncTable,
  resourceTable: ResourceTable,
  stringTable: UniqueStringArray,
  libs: Lib[],
  libToResourceIndex: Map<Lib, IndexIntoResourceTable>,
  originToResourceIndex: Map<string, IndexIntoResourceTable>,
  libNameToResourceIndex: Map<IndexIntoStringTable, IndexIntoResourceTable>,
  stringToNewFuncIndex: Map<string, IndexIntoFuncTable>,
};

/**
 * Resources and funcs are not part of the Gecko Profile format. This information is
 * implicitly defined in the frame tables' location strings. This function derives a new
 * FuncTable and ResourceTable for easily accesing this information in a structred format.
 *
 * The returned IndexIntoFuncTable[] value maps the index of each element in the
 * locationStringIndexes array to a func from the returned FuncTable.
 */
export function extractFuncsAndResourcesFromFrameLocations(
  locationStringIndexes: IndexIntoStringTable[],
  stringTable: UniqueStringArray,
  libs: Lib[]
): [FuncTable, ResourceTable, IndexIntoFuncTable[]] {
  // Explicitly create FuncTable. If Flow complains about this, then all of
  // the functions in this file starting with the word "extract" should be updated.
  const funcTable: FuncTable = {
    length: 0,
    name: [],
    resource: [],
    address: [],
    isJS: [],
    fileName: [],
    lineNumber: [],
  };

  // Explicitly create ResourceTable. If Flow complains about this, then all of
  // the functions in this file starting with the word "extract" should be updated.
  const resourceTable: ResourceTable = {
    length: 0,
    type: [],
    name: [],
    lib: [],
    host: [],
  };

  // Bundle all of the variables up into an object to pass them around to functions.
  const extractionInfo: ExtractionInfo = {
    funcTable,
    resourceTable,
    stringTable,
    libs,
    libToResourceIndex: new Map(),
    originToResourceIndex: new Map(),
    libNameToResourceIndex: new Map(),
    stringToNewFuncIndex: new Map(),
  };

  // Go through every frame location string, and deduce the function and resource
  // information by applying various string matching heuristics.
  const locationFuncs = locationStringIndexes.map(locationIndex => {
    const locationString = stringTable.getString(locationIndex);
    let funcIndex = extractionInfo.stringToNewFuncIndex.get(locationString);
    if (funcIndex !== undefined) {
      // The location string was already processed.
      return funcIndex;
    }

    // These nested `if` branches check for 3 cases for constructing function and
    // resource information.
    funcIndex = _extractUnsymbolicatedFunction(
      extractionInfo,
      locationString,
      locationIndex
    );
    if (funcIndex === null) {
      funcIndex = _extractCppFunction(extractionInfo, locationString);
      if (funcIndex === null) {
        funcIndex = _extractJsFunction(extractionInfo, locationString);
        if (funcIndex === null) {
          funcIndex = _extractUnknownFunctionType(
            extractionInfo,
            locationIndex
          );
        }
      }
    }

    // Cache the above results.
    extractionInfo.stringToNewFuncIndex.set(locationString, funcIndex);
    return funcIndex;
  });

  return [
    extractionInfo.funcTable,
    extractionInfo.resourceTable,
    locationFuncs,
  ];
}

/**
 * Given a location string that looks like a memory address, e.g. "0xfe9a097e0", treat
 * it as an unsymblicated memory address, add a single function to the function table,
 * as a single function, and then look up the library information based on the memory
 * offset obtained from the location string.
 */
function _extractUnsymbolicatedFunction(
  extractionInfo: ExtractionInfo,
  locationString: string,
  locationIndex: IndexIntoStringTable
): IndexIntoFuncTable | null {
  if (!locationString.startsWith('0x')) {
    return null;
  }
  const {
    libs,
    libToResourceIndex,
    resourceTable,
    funcTable,
    stringTable,
  } = extractionInfo;

  let resourceIndex = -1;
  let addressRelativeToLib = -1;

  const address = parseInt(locationString.substr(2), 16);
  // Look up to see if it's a known library address.
  const lib = getContainingLibrary(libs, address);
  if (lib) {
    // This is a known library.
    addressRelativeToLib = address - lib.start;
    resourceIndex = libToResourceIndex.get(lib);
    if (resourceIndex === undefined) {
      // This library doesn't exist in the libs array, insert it. This resou
      // A lib resource is a systems-level compiled library, for example "XUL",
      // "AppKit", or "CoreFoundation".
      resourceIndex = resourceTable.length++;
      resourceTable.lib[resourceIndex] = libs.indexOf(lib);
      resourceTable.name[resourceIndex] = stringTable.indexForString(
        lib.debugName
      );
      resourceTable.host[resourceIndex] = undefined;
      resourceTable.type[resourceIndex] = resourceTypes.library;
      libToResourceIndex.set(lib, resourceIndex);
    }
  }
  // Add the function to the funcTable.
  const funcIndex = funcTable.length++;
  funcTable.name[funcIndex] = locationIndex;
  funcTable.resource[funcIndex] = resourceIndex;
  funcTable.address[funcIndex] = addressRelativeToLib;
  funcTable.isJS[funcIndex] = false;
  funcTable.fileName[funcIndex] = null;
  funcTable.lineNumber[funcIndex] = null;
  return funcIndex;
}

/**
 * Given a location string that looks like a C++ function (by matching various regular
 * expressions) e.g. "functionName (in library name)", this function will classify it
 * as a C++ function, and add the library resource information if it's not already
 * present.
 */
function _extractCppFunction(
  extractionInfo: ExtractionInfo,
  locationString: string
): IndexIntoFuncTable | null {
  // Check for a C++ location string.
  const cppMatch: RegExpResult =
    // Given:   "functionName (in library name) + 1234"
    // Captures: 1^^^^^^^^^^^     2^^^^^^^^^^^    3^^^
    /^(.*) \(in ([^)]*)\) (\+ [0-9]+)$/.exec(locationString) ||
    // Given:   "functionName (in library name) (1234:1234)"
    // Captures: 1^^^^^^^^^^^     2^^^^^^^^^^^   3^^^^^^^^
    /^(.*) \(in ([^)]*)\) (\(.*:.*\))$/.exec(locationString) ||
    // Given:   "functionName (in library name)"
    // Captures: 1^^^^^^^^^^^     2^^^^^^^^^^^
    /^(.*) \(in ([^)]*)\)$/.exec(locationString);

  if (!cppMatch) {
    return null;
  }
  const {
    funcTable,
    stringTable,
    stringToNewFuncIndex,
    libNameToResourceIndex,
    resourceTable,
  } = extractionInfo;

  const [, funcNameRaw, libraryNameString] = cppMatch;
  const funcName = _cleanFunctionName(funcNameRaw);
  const funcNameIndex = stringTable.indexForString(funcName);
  const libraryNameStringIndex = stringTable.indexForString(libraryNameString);
  const funcIndex = stringToNewFuncIndex.get(funcName);
  if (funcIndex !== undefined) {
    // Do not insert a new function.
    return funcIndex;
  }
  let resourceIndex = libNameToResourceIndex.get(libraryNameStringIndex);
  if (resourceIndex === undefined) {
    resourceIndex = resourceTable.length++;
    libNameToResourceIndex.set(libraryNameStringIndex, resourceIndex);
    resourceTable.lib[resourceIndex] = -1;
    resourceTable.name[resourceIndex] = libraryNameStringIndex;
    resourceTable.host[resourceIndex] = undefined;
    resourceTable.type[resourceIndex] = resourceTypes.library;
  }

  const newFuncIndex = funcTable.length++;
  funcTable.name[newFuncIndex] = funcNameIndex;
  funcTable.resource[newFuncIndex] = resourceIndex;
  funcTable.address[newFuncIndex] = -1;
  funcTable.isJS[newFuncIndex] = false;
  funcTable.fileName[newFuncIndex] = null;
  funcTable.lineNumber[newFuncIndex] = null;

  return newFuncIndex;
}

/**
 * Given a location string that looks like a JS function (by matching various regular
 * expressions) e.g. "functionName:134", this function will classify it as a JS
 * function, and add the resource information if it's not already present.
 */
function _extractJsFunction(
  extractionInfo: ExtractionInfo,
  locationString: string
): IndexIntoFuncTable | null {
  // Check for a JS location string.
  const jsMatch: RegExpResult =
    // Given:   "functionName (http://script.url/:1234)"
    // Captures: 1^^^^^^^^^^  2^^^^^^^^^^^^^^^^^^ 3^^^
    /^(.*) \((.*):([0-9]+)\)$/.exec(locationString) ||
    // Given:   "http://script.url/:1234"
    // Captures: 2^^^^^^^^^^^^^^^^^ 3^^^
    /^()(.*):([0-9]+)$/.exec(locationString);

  if (!jsMatch) {
    return null;
  }

  const {
    funcTable,
    stringTable,
    resourceTable,
    originToResourceIndex,
  } = extractionInfo;

  // Case 4: JS function - A match was found in the location string in the format
  // of a JS function.
  const [, funcName, rawScriptURI] = jsMatch;
  const scriptURI = _getRealScriptURI(rawScriptURI);

  // Figure out the origin and host.
  let origin;
  let host;
  try {
    const url = new URL(scriptURI);
    if (!(url.protocol === 'http:' || url.protocol === 'https:')) {
      throw new Error('not a webhost protocol');
    }
    origin = url.origin;
    host = url.host;
  } catch (e) {
    origin = scriptURI;
    host = null;
  }

  let resourceIndex = originToResourceIndex.get(origin);
  if (resourceIndex === undefined) {
    resourceIndex = resourceTable.length++;
    const originStringIndex = stringTable.indexForString(origin);
    originToResourceIndex.set(origin, resourceIndex);
    if (host) {
      // This is a webhost URL.
      resourceTable.lib[resourceIndex] = undefined;
      resourceTable.name[resourceIndex] = originStringIndex;
      resourceTable.host[resourceIndex] = stringTable.indexForString(host);
      resourceTable.type[resourceIndex] = resourceTypes.webhost;
    } else {
      // This is a URL, but it doesn't point to something on the web, e.g. a
      // chrome url.
      resourceTable.lib[resourceIndex] = undefined;
      resourceTable.name[resourceIndex] = stringTable.indexForString(scriptURI);
      resourceTable.host[resourceIndex] = undefined;
      resourceTable.type[resourceIndex] = resourceTypes.url;
    }
  }

  let funcNameIndex;
  if (funcName) {
    funcNameIndex = stringTable.indexForString(funcName);
  } else {
    // Some JS frames don't have a function because they are for the
    // initial evaluation of the whole JS file. In that case, use the
    // file name itself, prepended by '(root scope) ', as the function
    // name.
    funcNameIndex = stringTable.indexForString(`(root scope) ${scriptURI}`);
  }
  const fileName = stringTable.indexForString(scriptURI);
  const lineNumber = parseInt(jsMatch[3], 10);

  // Add the function to the funcTable.
  const funcIndex = funcTable.length++;
  funcTable.name[funcIndex] = funcNameIndex;
  funcTable.resource[funcIndex] = resourceIndex;
  funcTable.address[funcIndex] = -1;
  funcTable.isJS[funcIndex] = true;
  funcTable.fileName[funcIndex] = fileName;
  funcTable.lineNumber[funcIndex] = lineNumber;

  return funcIndex;
}

/**
 * Nothing is known about this function. Add it without any resource information.
 */
function _extractUnknownFunctionType(
  { funcTable }: ExtractionInfo,
  locationIndex: IndexIntoStringTable
): IndexIntoFuncTable {
  const index = funcTable.length++;
  funcTable.name[index] = locationIndex;
  funcTable.resource[index] = -1;
  funcTable.address[index] = -1;
  funcTable.isJS[index] = false;
  funcTable.fileName[index] = null;
  funcTable.lineNumber[index] = null;
  return index;
}

/**
 * Explicitly recreate the frame table here to help enforce our assumptions about types.
 */
function _processFrameTable(
  geckoFrameStruct: GeckoFrameStruct,
  funcTable: FuncTable,
  frameFuncs: IndexIntoFuncTable[]
): FrameTable {
  return {
    address: frameFuncs.map(funcIndex => funcTable.address[funcIndex]),
    category: geckoFrameStruct.category,
    func: frameFuncs,
    implementation: geckoFrameStruct.implementation,
    line: geckoFrameStruct.line,
    optimizations: geckoFrameStruct.optimizations,
    length: geckoFrameStruct.length,
  };
}

/**
 * Explicitly recreate the stack table here to help enforce our assumptions about types.
 */
function _processStackTable(geckoStackTable: GeckoStackStruct): StackTable {
  return {
    frame: geckoStackTable.frame,
    prefix: geckoStackTable.prefix,
    length: geckoStackTable.length,
  };
}

/**
 * Explicitly recreate the markers here to help enforce our assumptions about types.
 */
function _processMarkers(geckoMarkers: GeckoMarkerStruct): MarkersTable {
  return {
    data: geckoMarkers.data.map(function(
      m: MarkerPayload_Gecko
    ): MarkerPayload {
      if (m) {
        switch (m.type) {
          /*
           * We want to improve the format of these markers to make them
           * easier to understand and work with, but we can't do that by
           * upgrading the gecko profile since that would break
           * compatibility with telemetry, however we can make some
           * improvements while we process a gecko profile.
           */
          case 'GCSlice': {
            const mt: GCSliceData_Gecko = m.timings;
            const timings = Object.assign({}, mt, {
              phase_times: mt.times ? convertPhaseTimes(mt.times) : {},
            });
            delete timings.times;
            return {
              type: 'GCSlice',
              startTime: m.startTime,
              endTime: m.endTime,
              timings: timings,
            };
          }
          case 'GCMajor': {
            const mt: GCMajorAborted | GCMajorCompleted_Gecko = m.timings;
            switch (mt.status) {
              case 'completed': {
                const timings: GCMajorCompleted = Object.assign({}, mt, {
                  phase_times: convertPhaseTimes(mt.totals),
                  mmu_20ms: mt.mmu_20ms / 100,
                  mmu_50ms: mt.mmu_50ms / 100,
                });
                return {
                  type: 'GCMajor',
                  startTime: m.startTime,
                  endTime: m.endTime,
                  timings: timings,
                };
              }
              case 'aborted':
                return {
                  type: 'GCMajor',
                  startTime: m.startTime,
                  endTime: m.endTime,
                  timings: { status: 'aborted' },
                };
              default:
                // Flow cannot detect that this switch is complete.
                console.log('Unknown GCMajor status');
                throw new Error('Unknown GCMajor status');
            }
          }
          default:
            return m;
        }
      } else {
        return null;
      }
    }),
    name: geckoMarkers.name,
    time: geckoMarkers.time,
    length: geckoMarkers.length,
  };
}

/**
 * Explicitly recreate the markers here to help enforce our assumptions about types.
 */
function _processSamples(geckoSamples: GeckoSampleStruct): SamplesTable {
  return {
    responsiveness: geckoSamples.responsiveness,
    stack: geckoSamples.stack,
    time: geckoSamples.time,
    rss: geckoSamples.rss,
    uss: geckoSamples.uss,
    length: geckoSamples.length,
  };
}

/**
 * Convert the given thread into processed form. See docs/gecko-profile-format for more
 * information.
 */
function _processThread(
  thread: GeckoThread,
  processProfile: GeckoProfile
): Thread {
  const geckoFrameStruct: GeckoFrameStruct = _toStructOfArrays(
    thread.frameTable
  );
  const geckoStackTable: GeckoStackStruct = _toStructOfArrays(
    thread.stackTable
  );
  const geckoSamples: GeckoSampleStruct = _toStructOfArrays(thread.samples);
  const geckoMarkers: GeckoMarkerStruct = _toStructOfArrays(
    _sortByField('time', thread.markers)
  );

  const { libs, pausedRanges, meta } = processProfile;
  const { shutdownTime } = meta;

  const stringTable = new UniqueStringArray(thread.stringTable);
  const [
    funcTable,
    resourceTable,
    frameFuncs,
  ] = extractFuncsAndResourcesFromFrameLocations(
    geckoFrameStruct.location,
    stringTable,
    libs
  );
  const frameTable: FrameTable = _processFrameTable(
    geckoFrameStruct,
    funcTable,
    frameFuncs
  );
  const stackTable = _processStackTable(geckoStackTable);
  const markers = _processMarkers(geckoMarkers);
  const samples = _processSamples(geckoSamples);

  return {
    name: thread.name,
    processType: thread.processType,
    processStartupTime: 0,
    processShutdownTime: shutdownTime,
    registerTime: thread.registerTime,
    unregisterTime: thread.unregisterTime,
    tid: thread.tid,
    pid: thread.pid,
    libs,
    pausedRanges,
    frameTable,
    funcTable,
    resourceTable,
    stackTable,
    markers,
    stringTable,
    samples,
  };
}

/**
 * This function is currently un-typed, and should be handled with properly
 * supporting TaskTracer with types and tests. See issue 438:
 * https://github.com/devtools-html/perf.html/issues/438
 */
function _addProcessedTaskTracerData(tasktracer, result, libs, startTime) {
  const { data, start, threads } = tasktracer;

  const {
    taskTable,
    tasksIdToTaskIndexMap,
    stringTable,
    addressIndicesByLib,
    addressTable,
    threadTable,
    tidToThreadIndexMap,
  } = result;

  for (const thread of threads) {
    const threadIndex = threadTable.length++;
    threadTable.tid[threadIndex] = thread.tid;
    threadTable.name[threadIndex] = stringTable.indexForString(thread.name);
    threadTable.start[threadIndex] = start;
    tidToThreadIndexMap.set(thread.tid, threadIndex);
  }

  const addressIndicesByAddress = new Map();

  for (let i = 0; i < data.length; i++) {
    const line = data[i];

    // All lines are of the form <digit> ' ' <taskId> [' ' <additional fields>]*
    // <digit> describes the type of the line.
    const firstSpacePos = 1;
    const secondSpacePos = line.indexOf(' ', firstSpacePos + 1);

    // taskIds are stored as JS strings, because they are originally uint64_t.
    const taskId = line.substring(firstSpacePos + 1, secondSpacePos);
    let taskIndex = tasksIdToTaskIndexMap.get(taskId);
    if (taskIndex === undefined) {
      taskIndex = taskTable.length++;
      tasksIdToTaskIndexMap.set(taskId, taskIndex);
    }

    switch (line.charAt(0)) {
      case '0': // DISPATCH, '0 taskId dispatchTime sourceEventId sourceEventType parentTaskId'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const fourthSpacePos = line.indexOf(' ', thirdSpacePos + 1);
          const fifthSpacePos = line.indexOf(' ', fourthSpacePos + 1);
          taskTable.dispatchTime[taskIndex] = Math.round(
            +line.substring(secondSpacePos + 1, thirdSpacePos) - startTime
          );
          taskTable.sourceEventId[taskIndex] = line.substring(
            thirdSpacePos + 1,
            fourthSpacePos
          );
          taskTable.sourceEventType[taskIndex] =
            line.substring(fourthSpacePos + 1, fifthSpacePos) | 0;
          taskTable.parentTaskId[taskIndex] = line.substring(fifthSpacePos + 1);
        }
        break;
      case '1': // BEGIN, '1 taskId beginTime processId threadId'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const fourthSpacePos = line.indexOf(' ', thirdSpacePos + 1);
          taskTable.beginTime[taskIndex] = Math.round(
            +line.substring(secondSpacePos + 1, thirdSpacePos) - startTime
          );
          taskTable.processId[taskIndex] = line.substring(
            thirdSpacePos + 1,
            fourthSpacePos
          );
          const tid = +line.substring(fourthSpacePos + 1);
          let threadIndex = tidToThreadIndexMap.get(tid);
          if (threadIndex === undefined) {
            threadIndex = threadTable.length++;
            threadTable.tid[threadIndex] = tid;
            threadTable.name[threadIndex] = stringTable.indexForString(
              `Thread ${tid}`
            );
            threadTable.start[threadIndex] = start;
            tidToThreadIndexMap.set(tid, threadIndex);
          }
          taskTable.threadIndex[taskIndex] = threadIndex;
        }
        break;
      case '2': // END, '2 taskId endTime'
        taskTable.endTime[taskIndex] = Math.round(
          +line.substring(secondSpacePos + 1) - startTime
        );
        break;
      case '3': // ADD_LABEL, '3 taskId labelTime "label"'
        {
          const thirdSpacePos = line.indexOf(' ', secondSpacePos + 1);
          const label = line.substring(thirdSpacePos + 1 + 1, line.length - 1);
          if (/^P.+::Msg_/.test(label)) {
            taskTable.ipdlMsg[taskIndex] = stringTable.indexForString(label);
          } else if (taskTable.label[taskIndex] === undefined) {
            taskTable.label[taskIndex] = [stringTable.indexForString(label)];
          } else {
            taskTable.label[taskIndex].push(stringTable.indexForString(label));
          }
        }
        break;
      case '4': // GET_VTABLE, '4 taskId address'
        {
          const hexAddress = line.substring(secondSpacePos + 1);
          const address = parseInt(hexAddress, 16);
          let addressIndex = addressIndicesByAddress.get(address);
          if (addressIndex === undefined) {
            addressIndex = addressTable.length++;
            const lib = getClosestLibrary(libs, address);
            let stringIndex;
            let addressRelativeToLib = -1;
            if (lib) {
              addressRelativeToLib = address - lib.start;
              stringIndex = stringTable.indexForString(
                `<0x${addressRelativeToLib.toString(16)} in ${lib.debugName}>`
              );
              let addressIndicesForThisLib = addressIndicesByLib.get(lib);
              if (addressIndicesForThisLib === undefined) {
                addressIndicesForThisLib = [];
                addressIndicesByLib.set(lib, addressIndicesForThisLib);
              }
              addressIndicesForThisLib.push(addressIndex);
            } else {
              stringIndex = stringTable.indexForString(
                `<unknown 0x${hexAddress}>`
              );
            }
            addressIndicesByAddress.set(address, addressIndex);
            addressTable.address[addressIndex] = addressRelativeToLib;
            addressTable.className[addressIndex] = stringIndex;
            addressTable.lib[addressIndex] = lib;
          }
          taskTable.address[taskIndex] = addressIndex;
        }
        break;
      default:
        break;
    }
  }
}

/**
 * Adjust the "time" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 */
function _adjustSampleTimestamps(
  samples: SamplesTable,
  delta: Milliseconds
): SamplesTable {
  return Object.assign({}, samples, {
    time: samples.time.map(time => time + delta),
  });
}

/**
 * Adjust all timestamp fields by the given delta. This is needed when
 * integrating subprocess profiles into the parent process profile; each
 * profile's process has its own timebase, and we don't want to keep
 * converting timestamps when we deal with the integrated profile.
 */
function _adjustMarkerTimestamps(
  markers: MarkersTable,
  delta: Milliseconds
): MarkersTable {
  return Object.assign({}, markers, {
    time: markers.time.map(time => time + delta),
    data: markers.data.map(data => {
      if (!data) {
        return data;
      }
      const newData = immutableUpdate(data);
      if ('startTime' in newData) {
        newData.startTime += delta;
      }
      if ('endTime' in newData) {
        newData.endTime += delta;
      }
      if (newData.type === 'DOMEvent' && 'timeStamp' in newData) {
        newData.timeStamp += delta;
      }
      return newData;
    }),
  });
}

/**
 * Convert a profile from the Gecko format into the processed format.
 * Throws an exception if it encounters an incompatible profile.
 * For a description of the processed format, look at docs/gecko-profile-format.md
 */
export function processProfile(geckoProfile: GeckoProfile): Profile {
  // Handle profiles from older versions of Gecko. This call might throw an
  // exception.
  upgradeGeckoProfileToCurrentVersion(geckoProfile);

  const libs = geckoProfile.libs;
  let threads = [];
  const tasktracer = getEmptyTaskTracerData();

  if (geckoProfile.tasktracer && geckoProfile.tasktracer.threads) {
    _addProcessedTaskTracerData(
      geckoProfile.tasktracer,
      tasktracer,
      libs,
      geckoProfile.meta.startTime
    );
  }

  for (const thread of geckoProfile.threads) {
    threads.push(_processThread(thread, geckoProfile));
  }

  for (const subprocessProfile of geckoProfile.processes) {
    const subprocessLibs = subprocessProfile.libs;
    const adjustTimestampsBy =
      subprocessProfile.meta.startTime - geckoProfile.meta.startTime;
    threads = threads.concat(
      subprocessProfile.threads.map(thread => {
        const newThread = _processThread(thread, subprocessProfile);
        newThread.samples = _adjustSampleTimestamps(
          newThread.samples,
          adjustTimestampsBy
        );
        newThread.markers = _adjustMarkerTimestamps(
          newThread.markers,
          adjustTimestampsBy
        );
        newThread.processStartupTime += adjustTimestampsBy;
        if (newThread.processShutdownTime !== null) {
          newThread.processShutdownTime += adjustTimestampsBy;
        }
        newThread.registerTime += adjustTimestampsBy;
        if (newThread.unregisterTime !== null) {
          newThread.unregisterTime += adjustTimestampsBy;
        }
        return newThread;
      })
    );
    if (subprocessProfile.tasktracer && subprocessProfile.tasktracer.threads) {
      _addProcessedTaskTracerData(
        subprocessProfile.tasktracer,
        tasktracer,
        subprocessLibs,
        geckoProfile.meta.startTime
      );
    }
  }

  const meta = {
    interval: geckoProfile.meta.interval,
    startTime: geckoProfile.meta.startTime,
    abi: geckoProfile.meta.abi,
    misc: geckoProfile.meta.misc,
    oscpu: geckoProfile.meta.oscpu,
    platform: geckoProfile.meta.platform,
    processType: geckoProfile.meta.processType,
    product: geckoProfile.meta.product,
    stackwalk: geckoProfile.meta.stackwalk,
    toolkit: geckoProfile.meta.toolkit,
    version: geckoProfile.meta.version,
    preprocessedProfileVersion: CURRENT_VERSION,
  };

  const result = {
    meta,
    threads,
    tasktracer,
  };
  return result;
}

/**
 * Take a processed profile and remove any non-serializable classes such as the
 * StringTable class.
 */
export function serializeProfile(profile: Profile): string {
  // stringTable -> stringArray
  const newProfile = Object.assign({}, profile, {
    threads: profile.threads.map(thread => {
      const stringTable = thread.stringTable;
      const newThread = Object.assign({}, thread);
      delete newThread.stringTable;
      newThread.stringArray = stringTable.serializeToArray();
      return newThread;
    }),
  });
  if ('tasktracer' in newProfile) {
    const newTasktracer = Object.assign({}, newProfile.tasktracer);
    const stringTable = newTasktracer.stringTable;
    delete newTasktracer.stringTable;
    newTasktracer.stringArray = stringTable.serializeToArray();
    newProfile.tasktracer = newTasktracer;
  }
  return JSON.stringify(newProfile);
}

/**
 * Take a serialized processed profile from some saved source, and re-initialize
 * any non-serializable classes.
 */
function _unserializeProfile(profile: Object): Profile {
  // stringArray -> stringTable
  const newProfile = Object.assign({}, profile, {
    threads: profile.threads.map(thread => {
      const stringArray = thread.stringArray;
      const newThread = Object.assign({}, thread);
      delete newThread.stringArray;
      newThread.stringTable = new UniqueStringArray(stringArray);
      return newThread;
    }),
  });
  if ('tasktracer' in newProfile) {
    const newTaskTracer = Object.assign({}, newProfile.tasktracer);
    const stringArray = newTaskTracer.stringArray;
    delete newTaskTracer.stringArray;
    newTaskTracer.stringTable = new UniqueStringArray(stringArray);
    newProfile.tasktracer = newTaskTracer;
  }
  return newProfile;
}

/**
 * Take some arbitrary profile file from some data source, and turn it into
 * the processed profile format.
 */
export function unserializeProfileOfArbitraryFormat(
  jsonStringOrObject: string | Object
): Profile {
  try {
    let profile =
      typeof jsonStringOrObject === 'string'
        ? JSON.parse(jsonStringOrObject)
        : jsonStringOrObject;
    if (isOldCleopatraFormat(profile)) {
      profile = convertOldCleopatraProfile(profile); // outputs preprocessed profile
    }
    if (isProcessedProfile(profile)) {
      upgradeProcessedProfileToCurrentVersion(profile);
      return _unserializeProfile(profile);
    }
    // Else: Treat it as a Gecko profile and just attempt to process it.
    return processProfile(profile);
  } catch (e) {
    throw new Error(`Unserializing the profile failed: ${e}`);
  }
}

export class ProfileProcessor {
  processProfile(geckoProfile: GeckoProfile): Promise<*> {
    return new Promise(resolve => {
      resolve(processProfile(geckoProfile));
    });
  }
}

export const ProfileProcessorThreaded = provideHostSide(
  'profile-processor-worker.js',
  ['processProfile']
);
