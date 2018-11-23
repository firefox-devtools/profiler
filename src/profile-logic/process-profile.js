/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { isChromeProfile, convertChromeProfile } from './import/chrome';
import { getContainingLibrary } from './symbolication';
import { UniqueStringArray } from '../utils/unique-string-array';
import { resourceTypes, emptyExtensions } from './profile-data';
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
import {
  isPerfScriptFormat,
  convertPerfScriptProfile,
} from './import/linux-perf';
import { convertPhaseTimes } from './convert-markers';
import type {
  Profile,
  Thread,
  ExtensionTable,
  CategoryList,
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
  DOMEventMarkerPayload,
  FrameConstructionMarkerPayload,
  MarkerPayload,
  MarkerPayload_Gecko,
  PaintProfilerMarkerTracing,
  GCSliceData_Gecko,
  GCMajorCompleted,
  GCMajorCompleted_Gecko,
  GCMajorAborted,
  StyleMarkerPayload,
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
  relevantForJSPerFrame: boolean[],
  stringTable: UniqueStringArray,
  libs: Lib[],
  extensions: ExtensionTable = emptyExtensions
): [FuncTable, ResourceTable, IndexIntoFuncTable[]] {
  // Explicitly create FuncTable. If Flow complains about this, then all of
  // the functions in this file starting with the word "extract" should be updated.
  const funcTable: FuncTable = {
    length: 0,
    name: [],
    resource: [],
    relevantForJS: [],
    address: [],
    isJS: [],
    fileName: [],
    lineNumber: [],
    columnNumber: [],
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

  for (let i = 0; i < extensions.length; i++) {
    _addExtensionOrigin(extractionInfo, extensions, i);
  }

  // Go through every frame location string, and deduce the function and resource
  // information by applying various string matching heuristics.
  const locationFuncs = locationStringIndexes.map(
    (locationIndex, frameIndex) => {
      const locationString = stringTable.getString(locationIndex);
      const relevantForJS = relevantForJSPerFrame[frameIndex];
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
              locationIndex,
              relevantForJS
            );
          }
        }
      }

      // Cache the above results.
      extractionInfo.stringToNewFuncIndex.set(locationString, funcIndex);
      return funcIndex;
    }
  );

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
    const baseAddress = lib.start - lib.offset;
    addressRelativeToLib = address - baseAddress;
    resourceIndex = libToResourceIndex.get(lib);
    if (resourceIndex === undefined) {
      // This library doesn't exist in the libs array, insert it. This resou
      // A lib resource is a systems-level compiled library, for example "XUL",
      // "AppKit", or "CoreFoundation".
      resourceIndex = resourceTable.length++;
      resourceTable.lib[resourceIndex] = libs.indexOf(lib);
      resourceTable.name[resourceIndex] = stringTable.indexForString(lib.name);
      resourceTable.host[resourceIndex] = undefined;
      resourceTable.type[resourceIndex] = resourceTypes.library;
      libToResourceIndex.set(lib, resourceIndex);
    }
  }
  // Add the function to the funcTable.
  const funcIndex = funcTable.length++;
  funcTable.name[funcIndex] = locationIndex;
  funcTable.resource[funcIndex] = resourceIndex;
  funcTable.relevantForJS[funcIndex] = false;
  funcTable.address[funcIndex] = addressRelativeToLib;
  funcTable.isJS[funcIndex] = false;
  funcTable.fileName[funcIndex] = null;
  funcTable.lineNumber[funcIndex] = null;
  funcTable.columnNumber[funcIndex] = null;
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
  funcTable.relevantForJS[newFuncIndex] = false;
  funcTable.address[newFuncIndex] = -1;
  funcTable.isJS[newFuncIndex] = false;
  funcTable.fileName[newFuncIndex] = null;
  funcTable.lineNumber[newFuncIndex] = null;
  funcTable.columnNumber[newFuncIndex] = null;

  return newFuncIndex;
}

// Adds a resource table entry for an extension's base URL origin
// string, mapping it to the extension's name and internal ID.
function _addExtensionOrigin(
  extractionInfo: ExtractionInfo,
  extensions: ExtensionTable,
  index: number
): void {
  const { originToResourceIndex, resourceTable, stringTable } = extractionInfo;
  const origin = new URL(extensions.baseURL[index]).origin;

  let resourceIndex = originToResourceIndex.get(origin);
  if (resourceIndex === undefined) {
    resourceIndex = resourceTable.length++;
    originToResourceIndex.set(origin, resourceIndex);

    const quotedName = JSON.stringify(extensions.name[index]);
    const name = `Extension ${quotedName} (ID: ${extensions.id[index]})`;

    const idIndex = stringTable.indexForString(extensions.id[index]);

    resourceTable.lib[resourceIndex] = undefined;
    resourceTable.name[resourceIndex] = stringTable.indexForString(name);
    resourceTable.host[resourceIndex] = idIndex;
    resourceTable.type[resourceIndex] = resourceTypes.addon;
  }
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
    // Given:   "functionName (http://script.url/:1234:1234)"
    // Captures: 1^^^^^^^^^^  2^^^^^^^^^^^^^^^^^^ 3^^^ 4^^^
    /^(.*) \((.+?):([0-9]+)(?::([0-9]+))?\)$/.exec(locationString) ||
    // Given:   "http://script.url/:1234:1234"
    // Captures: 2^^^^^^^^^^^^^^^^^ 3^^^ 4^^^
    /^()(.+?):([0-9]+)(?::([0-9]+))?$/.exec(locationString);

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
    if (
      !(
        url.protocol === 'http:' ||
        url.protocol === 'https:' ||
        url.protocol === 'moz-extension:'
      )
    ) {
      throw new Error('not a webhost or extension protocol');
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
  const columnNumber = jsMatch[4] ? parseInt(jsMatch[4], 10) : null;

  // Add the function to the funcTable.
  const funcIndex = funcTable.length++;
  funcTable.name[funcIndex] = funcNameIndex;
  funcTable.resource[funcIndex] = resourceIndex;
  funcTable.relevantForJS[funcIndex] = false;
  funcTable.address[funcIndex] = -1;
  funcTable.isJS[funcIndex] = true;
  funcTable.fileName[funcIndex] = fileName;
  funcTable.lineNumber[funcIndex] = lineNumber;
  funcTable.columnNumber[funcIndex] = columnNumber;

  return funcIndex;
}

/**
 * Nothing is known about this function. Add it without any resource information.
 */
function _extractUnknownFunctionType(
  { funcTable }: ExtractionInfo,
  locationIndex: IndexIntoStringTable,
  relevantForJS: boolean
): IndexIntoFuncTable {
  const index = funcTable.length++;
  funcTable.name[index] = locationIndex;
  funcTable.resource[index] = -1;
  funcTable.relevantForJS[index] = relevantForJS;
  funcTable.address[index] = -1;
  funcTable.isJS[index] = false;
  funcTable.fileName[index] = null;
  funcTable.lineNumber[index] = null;
  funcTable.columnNumber[index] = null;
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
    column: geckoFrameStruct.column,
    optimizations: geckoFrameStruct.optimizations,
    length: geckoFrameStruct.length,
  };
}

/**
 * Explicitly recreate the stack table here to help enforce our assumptions about types.
 * Also add a category column.
 */
function _processStackTable(
  geckoStackTable: GeckoStackStruct,
  frameTable: FrameTable,
  categories: CategoryList
): StackTable {
  // Compute a non-null category for every stack
  const defaultCategory = categories.findIndex(c => c.color === 'grey') || 0;
  const categoryColumn = new Array(geckoStackTable.length);
  for (let stackIndex = 0; stackIndex < geckoStackTable.length; stackIndex++) {
    const frameCategory =
      frameTable.category[geckoStackTable.frame[stackIndex]];
    let stackCategory;
    if (frameCategory !== null) {
      stackCategory = frameCategory;
    } else {
      const prefix = geckoStackTable.prefix[stackIndex];
      if (prefix !== null) {
        // Because of the structure of the stack table, prefix < stackIndex.
        // So we've already computed the category for the prefix.
        stackCategory = categoryColumn[prefix];
      } else {
        stackCategory = defaultCategory;
      }
    }
    categoryColumn[stackIndex] = stackCategory;
  }

  return {
    frame: geckoStackTable.frame,
    category: categoryColumn,
    prefix: geckoStackTable.prefix,
    length: geckoStackTable.length,
  };
}

/**
 * Convert stack field to cause field for the given payload.
 */
function _convertStackToCause(data: Object) {
  if ('stack' in data && data.stack && data.stack.samples.data.length > 0) {
    const stack = data.stack;
    delete data.stack;
    const stackIndex = stack.samples.data[0][stack.samples.schema.stack];
    const time = stack.samples.data[0][stack.samples.schema.time];
    if (stackIndex !== null) {
      data.cause = { time, stack: stackIndex };
    }
  }
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
            const { times, ...partialMt } = mt;
            const timings = {
              ...partialMt,
              phase_times: times ? convertPhaseTimes(times) : {},
            };
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
                const { totals, ...partialMt } = mt;
                const timings: GCMajorCompleted = {
                  ...partialMt,
                  phase_times: convertPhaseTimes(totals),
                  mmu_20ms: mt.mmu_20ms / 100,
                  mmu_50ms: mt.mmu_50ms / 100,
                };
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
          /*
           * This type exists in profiles from newer gecko only, while
           * profiles from older gecko will be of type "tracing".
           */
          case 'Styles': {
            const newData = { ...m };
            _convertStackToCause(newData);
            // We had to use any here because _convertStackToCause is not
            // providing the type system with information how it's operating
            const result: StyleMarkerPayload = (newData: any);
            return result;
          }
          case 'tracing': {
            const newData = immutableUpdate(m);
            _convertStackToCause(newData);
            // We had to use any here because _convertStackToCause is not
            // providing the type system with information how it's operating
            switch (newData.category) {
              case 'DOMEvent':
                return ((newData: any): DOMEventMarkerPayload);
              case 'FrameConstruction':
                return ((newData: any): FrameConstructionMarkerPayload);
              default:
                return ((newData: any): PaintProfilerMarkerTracing);
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
 * Convert the given thread into processed form. See docs-developer/gecko-profile-format for more
 * information.
 */
function _processThread(
  thread: GeckoThread,
  processProfile: GeckoProfile,
  extensions: ExtensionTable
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
  const { categories, shutdownTime } = meta;

  const stringTable = new UniqueStringArray(thread.stringTable);
  const [
    funcTable,
    resourceTable,
    frameFuncs,
  ] = extractFuncsAndResourcesFromFrameLocations(
    geckoFrameStruct.location,
    geckoFrameStruct.relevantForJS,
    stringTable,
    libs,
    extensions
  );
  const frameTable: FrameTable = _processFrameTable(
    geckoFrameStruct,
    funcTable,
    frameFuncs
  );
  const stackTable = _processStackTable(
    geckoStackTable,
    frameTable,
    categories
  );
  const markers = _processMarkers(geckoMarkers);
  const samples = _processSamples(geckoSamples);

  return {
    name: thread.name,
    processType: thread.processType,
    processName:
      typeof thread.processName === 'string' ? thread.processName : '',
    processStartupTime: 0,
    processShutdownTime: shutdownTime,
    registerTime: thread.registerTime,
    unregisterTime: thread.unregisterTime,
    tid: thread.tid,
    pid: thread.pid,
    libs,
    pausedRanges: pausedRanges || [],
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
      if (typeof newData.startTime === 'number') {
        newData.startTime += delta;
      }
      if (typeof newData.endTime === 'number') {
        newData.endTime += delta;
      }
      if (newData.type === 'tracing' || newData.type === 'Styles') {
        if (newData.cause) {
          newData.cause.time += delta;
        }
        if (newData.category === 'DOMEvent' && 'timeStamp' in newData) {
          newData.timeStamp += delta;
        }
      }
      return newData;
    }),
  });
}

/**
 * Convert a profile from the Gecko format into the processed format.
 * Throws an exception if it encounters an incompatible profile.
 * For a description of the processed format, look at docs-developer/gecko-profile-format.md
 */
export function processProfile(
  rawProfile: GeckoProfile | { profile: GeckoProfile }
): Profile {
  // We may have been given a DevTools profile, in that case extract the Gecko Profile.
  const geckoProfile = rawProfile.profile ? rawProfile.profile : rawProfile;

  // Handle profiles from older versions of Gecko. This call might throw an
  // exception.
  upgradeGeckoProfileToCurrentVersion(geckoProfile);

  let threads = [];

  const extensions: ExtensionTable = geckoProfile.meta.extensions
    ? _toStructOfArrays(geckoProfile.meta.extensions)
    : emptyExtensions;

  for (const thread of geckoProfile.threads) {
    threads.push(_processThread(thread, geckoProfile, extensions));
  }

  for (const subprocessProfile of geckoProfile.processes) {
    const adjustTimestampsBy =
      subprocessProfile.meta.startTime - geckoProfile.meta.startTime;
    threads = threads.concat(
      subprocessProfile.threads.map(thread => {
        const newThread = _processThread(thread, subprocessProfile, extensions);
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
  }

  let pages = [...(geckoProfile.pages || [])];

  for (const subprocessProfile of geckoProfile.processes) {
    pages = pages.concat(subprocessProfile.pages || []);
  }

  const meta = {
    interval: geckoProfile.meta.interval,
    startTime: geckoProfile.meta.startTime,
    abi: geckoProfile.meta.abi,
    extensions: extensions,
    misc: geckoProfile.meta.misc,
    oscpu: geckoProfile.meta.oscpu,
    platform: geckoProfile.meta.platform,
    processType: geckoProfile.meta.processType,
    product: geckoProfile.meta.product,
    stackwalk: geckoProfile.meta.stackwalk,
    toolkit: geckoProfile.meta.toolkit,
    version: geckoProfile.meta.version,
    categories: geckoProfile.meta.categories,
    preprocessedProfileVersion: CURRENT_VERSION,
    appBuildID: geckoProfile.meta.appBuildID,
    // A link to the source code revision for this build.
    sourceURL: geckoProfile.meta.sourceURL,
    physicalCPUs: geckoProfile.meta.physicalCPUs,
    logicalCPUs: geckoProfile.meta.logicalCPUs,
    // Gecko always sends the profile with URLs.
    networkURLsRemoved: false,
  };

  const result = {
    meta,
    pages,
    threads,
  };
  return result;
}

/**
 * Take a processed profile and remove any non-serializable classes such as the
 * StringTable class.
 */
export function serializeProfile(
  profile: Profile,
  includeNetworkUrls: boolean = true
): string {
  // stringTable -> stringArray
  let urlCounter = 0;
  const newProfile = Object.assign({}, profile, {
    meta: { ...profile.meta, networkURLsRemoved: !includeNetworkUrls },
    pages:
      includeNetworkUrls === false && profile.pages
        ? profile.pages.map(page =>
            Object.assign({}, page, {
              url: 'Page #' + urlCounter++,
            })
          )
        : profile.pages,
    threads: profile.threads.map(thread => {
      const stringArray = thread.stringTable.serializeToArray();
      const newThread = Object.assign({}, thread);
      delete newThread.stringTable;
      if (includeNetworkUrls === false) {
        for (let i = 0; i < newThread.markers.length; i++) {
          const currentMarker = newThread.markers.data[i];
          if (
            currentMarker &&
            currentMarker.type &&
            currentMarker.type === 'Network'
          ) {
            // Remove the URI fields from marker payload.
            currentMarker.URI = '';
            currentMarker.RedirectURI = '';
            // Strip the URL from the marker name
            const stringIndex = newThread.markers.name[i];
            stringArray[stringIndex] = stringArray[stringIndex].replace(
              /:.*/,
              ''
            );
          }
        }
      }
      newThread.stringArray = stringArray;
      return newThread;
    }),
  });
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
  return newProfile;
}

/**
 * Take some arbitrary profile file from some data source, and turn it into
 * the processed profile format.
 */
export async function unserializeProfileOfArbitraryFormat(
  stringOrObject: string | Object
): Promise<Profile> {
  try {
    let profile = null;
    if (typeof stringOrObject === 'string') {
      try {
        profile = JSON.parse(stringOrObject);
      } catch (e) {
        // The string is not json. It might be the output from `perf script`.
        if (isPerfScriptFormat(stringOrObject)) {
          profile = convertPerfScriptProfile(stringOrObject);
        } else {
          throw e;
        }
      }
    } else {
      profile = stringOrObject;
    }

    if (isOldCleopatraFormat(profile)) {
      profile = convertOldCleopatraProfile(profile); // outputs preprocessed profile
    }
    if (isProcessedProfile(profile)) {
      upgradeProcessedProfileToCurrentVersion(profile);
      return _unserializeProfile(profile);
    }
    if (isChromeProfile(profile)) {
      return convertChromeProfile(profile);
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
