/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { attemptToConvertChromeProfile } from './import/chrome';
import { getContainingLibrary } from './symbolication';
import { UniqueStringArray } from '../utils/unique-string-array';
import {
  resourceTypes,
  getEmptyExtensions,
  getEmptyFuncTable,
  getEmptyResourceTable,
  getEmptyRawMarkerTable,
  getEmptyJsAllocationsTable,
  getEmptyUnbalancedNativeAllocationsTable,
} from './data-structures';
import { immutableUpdate, ensureExists, coerce } from '../utils/flow';
import { attemptToUpgradeProcessedProfileThroughMutation } from './processed-profile-versioning';
import { upgradeGeckoProfileToCurrentVersion } from './gecko-profile-versioning';
import {
  isPerfScriptFormat,
  convertPerfScriptProfile,
} from './import/linux-perf';
import { PROCESSED_PROFILE_VERSION } from '../app-logic/constants';
import {
  getFriendlyThreadName,
  getOrCreateURIResource,
} from '../profile-logic/profile-data';
import { convertJsTracerToThread } from '../profile-logic/js-tracer';

import type {
  Profile,
  Thread,
  Counter,
  ExtensionTable,
  CategoryList,
  FrameTable,
  SamplesTable,
  StackTable,
  RawMarkerTable,
  Lib,
  FuncTable,
  ResourceTable,
  IndexIntoStackTable,
  IndexIntoFuncTable,
  IndexIntoStringTable,
  IndexIntoResourceTable,
  JsTracerTable,
  JsAllocationsTable,
  ProfilerOverhead,
  NativeAllocationsTable,
  Milliseconds,
  Microseconds,
  Address,
  MemoryOffset,
  GeckoProfile,
  GeckoSubprocessProfile,
  GeckoThread,
  GeckoMarkers,
  GeckoMarkerStruct,
  GeckoFrameStruct,
  GeckoSampleStruct,
  GeckoStackStruct,
  GeckoProfilerOverhead,
  GCSliceMarkerPayload,
  GCMajorMarkerPayload,
  MarkerPayload,
  MarkerPayload_Gecko,
  GCSliceData_Gecko,
  GCMajorCompleted,
  GCMajorCompleted_Gecko,
  GCMajorAborted,
  PhaseTimes,
  SerializableProfile,
  MarkerSchema,
} from 'firefox-profiler/types';

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
function _toStructOfArrays(geckoTable: any): any {
  const result = { length: geckoTable.data.length };
  for (const fieldName in geckoTable.schema) {
    const fieldIndex = geckoTable.schema[fieldName];
    if (typeof fieldIndex !== 'number') {
      throw new Error(
        'fieldIndex must be a number in the Gecko profile table.'
      );
    }
    result[fieldName] = geckoTable.data.map(entry =>
      fieldIndex in entry ? entry[fieldIndex] : null
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

function _sortMarkers(markers: GeckoMarkers): GeckoMarkers {
  const { startTime, endTime } = markers.schema;
  const sortedData = markers.data.slice(0);
  // Sort the markers based on their startTime. If there is no startTime, then use
  // endtime.
  sortedData.sort((a, b) => {
    const aTime: null | Milliseconds = a[endTime] || a[startTime];
    const bTime: null | Milliseconds = b[endTime] || b[startTime];
    if (aTime === null) {
      console.error(a);
      throw new Error('A marker had null start and end time.');
    }
    if (bTime === null) {
      console.error(b);
      throw new Error('A marker had null start and end time.');
    }
    return aTime - bTime;
  });

  return Object.assign({}, markers, { data: sortedData });
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
  extensions: ExtensionTable = getEmptyExtensions()
): [FuncTable, ResourceTable, IndexIntoFuncTable[]] {
  // Important! If the flow type for the FuncTable was changed, update all the functions
  // in this file that start with the word "extract".
  const funcTable = getEmptyFuncTable();

  // Important! If the flow type for the ResourceTable was changed, update all the functions
  // in this file that start with the word "extract".
  const resourceTable = getEmptyResourceTable();

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
  let addressRelativeToLib: Address = -1;

  // The frame address, as observed in the profiled process. This address was
  // valid in the (virtual memory) address space of the profiled process.
  const address: MemoryOffset = parseInt(locationString.substr(2), 16);

  // We want to turn this address into a library-relative offset.
  // Look up to see if it falls into one of the libraries that were mapped into
  // the profiled process, according to the libs list.
  const lib = getContainingLibrary(libs, address);
  if (lib) {
    // Yes, we found the library whose mapping covers this address!
    const libBaseAddress = lib.start - lib.offset;
    addressRelativeToLib = address - libBaseAddress;

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

  const resourceIndex = getOrCreateURIResource(
    scriptURI,
    resourceTable,
    stringTable,
    originToResourceIndex
  );

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
    subcategory: geckoFrameStruct.subcategory,
    func: frameFuncs,
    innerWindowID: geckoFrameStruct.innerWindowID,
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
  const subcategoryColumn = new Array(geckoStackTable.length);
  for (let stackIndex = 0; stackIndex < geckoStackTable.length; stackIndex++) {
    const frameIndex = geckoStackTable.frame[stackIndex];
    const frameCategory = frameTable.category[frameIndex];
    const frameSubcategory = frameTable.subcategory[frameIndex];
    let stackCategory;
    let stackSubcategory;
    if (frameCategory !== null) {
      stackCategory = frameCategory;
      stackSubcategory = frameSubcategory || 0;
    } else {
      const prefix = geckoStackTable.prefix[stackIndex];
      if (prefix !== null) {
        // Because of the structure of the stack table, prefix < stackIndex.
        // So we've already computed the category for the prefix.
        stackCategory = categoryColumn[prefix];
        stackSubcategory = subcategoryColumn[prefix];
      } else {
        stackCategory = defaultCategory;
        stackSubcategory = 0;
      }
    }
    categoryColumn[stackIndex] = stackCategory;
    subcategoryColumn[stackIndex] = stackSubcategory;
  }

  return {
    frame: geckoStackTable.frame,
    category: categoryColumn,
    subcategory: subcategoryColumn,
    prefix: geckoStackTable.prefix,
    length: geckoStackTable.length,
  };
}

/**
 * Convert stack field to cause field for the given payload. A cause field includes
 * the thread ID (tid), an IndexIntoStackTable, and the time the stack was captured.
 * If the stack was captured within the start and end time of the marker, this was a
 * synchronous stack. Otherwise, if it happened before, it was an async stack, and is
 * most likely some event that happened in the past that triggered the marker.
 */
function _convertStackToCause(data: any): any {
  if ('stack' in data && data.stack && data.stack.samples.data.length > 0) {
    const { stack, ...newData } = data;
    const stackIndex = stack.samples.data[0][stack.samples.schema.stack];
    const time = stack.samples.data[0][stack.samples.schema.time];
    if (stackIndex !== null) {
      newData.cause = { tid: stack.tid, time, stack: stackIndex };
    }
    return newData;
  }
  return data;
}

/**
 * Sometimes we don't want to extract a cause, but rather just the stack index
 * from a gecko payload.
 */
function _convertPayloadStackToIndex(
  data: MarkerPayload_Gecko
): IndexIntoStackTable | null {
  if (!data) {
    return null;
  }
  if (data.stack && data.stack.samples.data.length > 0) {
    const { samples } = data.stack;
    return samples.data[0][samples.schema.stack];
  }
  return null;
}

/**
 * Process the markers.
 *  Convert stacks to causes.
 *  Process GC markers.
 *  Extract JS allocations into the JsAllocationsTable.
 *  Extract Native allocations into the NativeAllocationsTable.
 */
function _processMarkers(
  geckoMarkers: GeckoMarkerStruct
): {|
  markers: RawMarkerTable,
  jsAllocations: JsAllocationsTable | null,
  nativeAllocations: NativeAllocationsTable | null,
|} {
  const markers = getEmptyRawMarkerTable();
  const jsAllocations = getEmptyJsAllocationsTable();
  const inProgressNativeAllocations = getEmptyUnbalancedNativeAllocationsTable();
  const memoryAddress: number[] = [];
  const threadId: number[] = [];

  // Determine if native allocations have memory addresses.
  let hasMemoryAddresses;

  for (let markerIndex = 0; markerIndex < geckoMarkers.length; markerIndex++) {
    const geckoPayload: MarkerPayload_Gecko = geckoMarkers.data[markerIndex];

    if (geckoPayload) {
      switch (geckoPayload.type) {
        case 'JS allocation': {
          // Build up a separate table for the JS allocation data, and do not
          // include it in the marker information.
          jsAllocations.time.push(
            ensureExists(
              geckoMarkers.startTime[markerIndex],
              'JS Allocations are assumed to have a startTime'
            )
          );
          jsAllocations.className.push(geckoPayload.className);
          jsAllocations.typeName.push(geckoPayload.typeName);
          jsAllocations.coarseType.push(geckoPayload.coarseType);
          jsAllocations.weight.push(geckoPayload.size);
          jsAllocations.inNursery.push(geckoPayload.inNursery);
          jsAllocations.stack.push(_convertPayloadStackToIndex(geckoPayload));
          jsAllocations.length++;

          // Do not process the marker and add it to the marker list.
          continue;
        }
        case 'Native allocation': {
          if (hasMemoryAddresses === undefined) {
            // If one payload as the memory address, then all of them should.
            hasMemoryAddresses = 'memoryAddress' in geckoPayload;
          }
          // Build up a separate table for the native allocation data, and do not
          // include it in the marker information.
          inProgressNativeAllocations.time.push(
            ensureExists(
              geckoMarkers.startTime[markerIndex],
              'Native Allocations are assumed to have a startTime'
            )
          );
          inProgressNativeAllocations.weight.push(geckoPayload.size);
          inProgressNativeAllocations.stack.push(
            _convertPayloadStackToIndex(geckoPayload)
          );
          inProgressNativeAllocations.length++;

          if (hasMemoryAddresses) {
            memoryAddress.push(
              ensureExists(
                geckoPayload.memoryAddress,
                'Could not find the memoryAddress property on a gecko marker payload.'
              )
            );
            threadId.push(
              ensureExists(
                geckoPayload.threadId,
                'Could not find a threadId property on a gecko marker payload.'
              )
            );
          }
          // Do not process the marker and add it to the marker list.
          continue;
        }
        default:
        // This is not an allocation, continue on to process the marker.
      }
    }

    const payload = _processMarkerPayload(geckoPayload);
    const name = geckoMarkers.name[markerIndex];
    const startTime = geckoMarkers.startTime[markerIndex];
    const endTime = geckoMarkers.endTime[markerIndex];
    const phase = geckoMarkers.phase[markerIndex];
    const category = geckoMarkers.category[markerIndex];

    markers.name.push(name);
    markers.startTime.push(startTime);
    markers.endTime.push(endTime);
    markers.phase.push(phase);
    markers.category.push(category);
    markers.data.push(payload);
    markers.length++;
  }

  // Properly handle the different cases of native allocations.
  let nativeAllocations;
  if (inProgressNativeAllocations.length === 0) {
    // There are none, don't add it.
    nativeAllocations = null;
  } else if (hasMemoryAddresses) {
    // This is the newer native allocations with memory addresses.
    nativeAllocations = {
      time: inProgressNativeAllocations.time,
      weight: inProgressNativeAllocations.weight,
      weightType: inProgressNativeAllocations.weightType,
      stack: inProgressNativeAllocations.stack,
      memoryAddress,
      threadId,
      length: inProgressNativeAllocations.length,
    };
  } else {
    // There is the older native allocations, without memory addresses.
    nativeAllocations = {
      time: inProgressNativeAllocations.time,
      weight: inProgressNativeAllocations.weight,
      weightType: inProgressNativeAllocations.weightType,
      stack: inProgressNativeAllocations.stack,
      length: inProgressNativeAllocations.length,
    };
  }

  return {
    markers: markers,
    jsAllocations: jsAllocations.length === 0 ? null : jsAllocations,
    nativeAllocations,
  };
}

function convertPhaseTimes(
  old_phases: PhaseTimes<Milliseconds>
): PhaseTimes<Microseconds> {
  const phases = {};
  for (const phase in old_phases) {
    phases[phase] = old_phases[phase] * 1000;
  }
  return phases;
}

/**
 * Process just the marker payload. This converts stacks into causes, and augments
 * the GC information.
 */
function _processMarkerPayload(
  geckoPayload: MarkerPayload_Gecko
): MarkerPayload {
  if (!geckoPayload) {
    return null;
  }

  // If there is a "stack" field, convert it to a "cause" field. This is
  // pre-emptively done for every single marker payload.
  //
  // Warning: This function converts the payload into an any type
  const payload = _convertStackToCause(geckoPayload);

  switch (payload.type) {
    /*
     * We want to improve the format of these markers to make them
     * easier to understand and work with, but we can't do that by
     * upgrading the gecko profile since that would break
     * compatibility with telemetry, however we can make some
     * improvements while we process a gecko profile.
     */
    case 'GCSlice': {
      const { times, ...partialTimings }: GCSliceData_Gecko = payload.timings;

      return ({
        type: 'GCSlice',
        timings: {
          ...partialTimings,
          phase_times: times ? convertPhaseTimes(times) : {},
        },
      }: GCSliceMarkerPayload);
    }
    case 'GCMajor': {
      const geckoTimings: GCMajorAborted | GCMajorCompleted_Gecko =
        payload.timings;
      switch (geckoTimings.status) {
        case 'completed': {
          const { totals, ...partialMt } = geckoTimings;
          const timings: GCMajorCompleted = {
            ...partialMt,
            phase_times: convertPhaseTimes(totals),
            mmu_20ms: geckoTimings.mmu_20ms / 100,
            mmu_50ms: geckoTimings.mmu_50ms / 100,
          };
          return ({
            type: 'GCMajor',
            timings: timings,
          }: GCMajorMarkerPayload);
        }
        case 'aborted':
          return ({
            type: 'GCMajor',
            timings: { status: 'aborted' },
          }: GCMajorMarkerPayload);
        default:
          // Flow cannot detect that this switch is complete.
          console.log('Unknown GCMajor status');
          throw new Error('Unknown GCMajor status');
      }
    }
    default:
      // Coerce the payload into a MarkerPayload. This doesn't really provide
      // any more type safety, but it shows the intent of going from an object
      // without much type safety, to a specific type definition.
      return (payload: MarkerPayload);
  }
}

/**
 * Explicitly recreate the markers here to help enforce our assumptions about types.
 */
function _processSamples(geckoSamples: GeckoSampleStruct): SamplesTable {
  const samples: SamplesTable = {
    stack: geckoSamples.stack,
    time: geckoSamples.time,
    weightType: 'samples',
    weight: null,
    length: geckoSamples.length,
  };

  if (geckoSamples.eventDelay) {
    samples.eventDelay = geckoSamples.eventDelay;
  } else if (geckoSamples.responsiveness) {
    samples.responsiveness = geckoSamples.responsiveness;
  } else {
    throw new Error(
      'The profile processor expected an eventDelay or responsiveness array in the samples table, but none was found.'
    );
  }

  return samples;
}

/**
 * Converts the Gecko list of counters into the processed format.
 */
function _processCounters(
  geckoProfile: GeckoProfile | GeckoSubprocessProfile,
  // The counters are listed independently from the threads, so we need an index that
  // references back into a stable list of threads. The threads list in the processing
  // step is built dynamically, so the "stableThreadList" variable is a hint that this
  // should be a stable and sorted list of threads.
  stableThreadList: Thread[],
  // The timing across processes must be normalized, this is the timing delta between
  // various processes.
  delta: Milliseconds
): Counter[] {
  const geckoCounters = geckoProfile.counters;
  const mainThread = geckoProfile.threads.find(
    thread => thread.name === 'GeckoMain'
  );

  if (!mainThread || !geckoCounters) {
    // Counters or a main thread weren't found, bail out, and return an empty array.
    return [];
  }

  // The gecko profile's process don't map to the final thread list. Use the stable
  // thread list to look up the thread index for the main thread in this profile.
  const mainThreadIndex = stableThreadList.findIndex(
    thread => thread.name === 'GeckoMain' && thread.pid === mainThread.pid
  );

  if (mainThreadIndex === -1) {
    throw new Error(
      'Unable to find the main thread in the stable thread list. This means that the ' +
        'logic in the _processCounters function is wrong.'
    );
  }

  return geckoCounters.reduce(
    (result, { name, category, description, sample_groups }) => {
      if (sample_groups.length === 0) {
        // It's possible that no sample has been collected during our capture
        // session, ignore this counter if that's the case.
        return result;
      }

      const sampleGroups = sample_groups.map(sampleGroup => ({
        id: sampleGroup.id,
        samples: adjustTableTimestamps(
          _toStructOfArrays(sampleGroup.samples),
          delta
        ),
      }));

      result.push({
        name,
        category,
        description,
        pid: mainThread.pid,
        mainThreadIndex,
        sampleGroups,
      });
      return result;
    },
    []
  );
}

/**
 * Converts the Gecko profiler overhead into the processed format.
 */
function _processProfilerOverhead(
  geckoProfile: GeckoProfile | GeckoSubprocessProfile,
  // The overhead data is listed independently from the threads, so we need an index that
  // references back into a stable list of threads. The threads list in the processing
  // step is built dynamically, so the "stableThreadList" variable is a hint that this
  // should be a stable and sorted list of threads.
  stableThreadList: Thread[],
  // The timing across processes must be normalized, this is the timing delta between
  // various processes.
  delta: Milliseconds
): ProfilerOverhead | null {
  const geckoProfilerOverhead: ?GeckoProfilerOverhead =
    geckoProfile.profilerOverhead;
  const mainThread = geckoProfile.threads.find(
    thread => thread.name === 'GeckoMain'
  );

  if (!mainThread || !geckoProfilerOverhead) {
    // Profiler overhead or a main thread weren't found, bail out, and return an empty array.
    return null;
  }

  // The gecko profile's process don't map to the final thread list. Use the stable
  // thread list to look up the thread index for the main thread in this profile.
  const mainThreadIndex = stableThreadList.findIndex(
    thread => thread.name === 'GeckoMain' && thread.pid === mainThread.pid
  );

  if (mainThreadIndex === -1) {
    throw new Error(
      'Unable to find the main thread in the stable thread list. This means that the ' +
        'logic in the _processProfilerOverhead function is wrong.'
    );
  }

  return {
    samples: adjustProfilerOverheadTimestamps(
      _toStructOfArrays(geckoProfilerOverhead.samples),
      delta
    ),
    pid: mainThread.pid,
    mainThreadIndex,
    statistics: geckoProfilerOverhead.statistics,
  };
}

/**
 * Convert the given thread into processed form. See docs-developer/gecko-profile-format for more
 * information.
 */
function _processThread(
  thread: GeckoThread,
  processProfile: GeckoProfile | GeckoSubprocessProfile,
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
    _sortMarkers(thread.markers)
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
  const { markers, jsAllocations, nativeAllocations } = _processMarkers(
    geckoMarkers
  );
  const samples = _processSamples(geckoSamples);

  const newThread: Thread = {
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

  if (jsAllocations) {
    // Only add the JS allocations if they exist.
    newThread.jsAllocations = jsAllocations;
  }

  if (nativeAllocations) {
    // Only add the Native allocations if they exist.
    newThread.nativeAllocations = nativeAllocations;
  }

  function processJsTracer() {
    // Optionally extract the JS Tracer information, if they exist.
    const { jsTracerEvents } = thread;
    const { jsTracerDictionary } = processProfile;
    if (jsTracerEvents && jsTracerDictionary) {
      // Add the JS tracer's strings to the thread's existing string table, and create
      // a mapping from the old string indexes to the new ones. Use an Array rather
      // than a Map because it saves ~150ms out of ~300ms in one example.
      const geckoToProcessedStringIndex: number[] = new Array(
        jsTracerDictionary.length
      );
      for (let i = 0; i < jsTracerDictionary.length; i++) {
        geckoToProcessedStringIndex[i] = newThread.stringTable.indexForString(
          jsTracerDictionary[i]
        );
      }

      // Use a manual .slice() and for loop instead of map because it went from
      // taking ~150ms to ~30ms on one example. Omitting the .slice() resulted
      // in ~8ms, but mutating the original structure is probably a bad idea.
      const newEvents = jsTracerEvents.events.slice();
      for (let i = 0; i < newEvents.length; i++) {
        const geckoStringIndex = newEvents[i];
        newEvents[i] = geckoToProcessedStringIndex[geckoStringIndex];
      }

      newThread.jsTracer = {
        ...jsTracerEvents,
        events: newEvents,
      };
    }
  }

  processJsTracer();

  return newThread;
}

/**
 * Adjust the "time" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 */
export function adjustTableTimestamps<Table: { time: Milliseconds[] }>(
  table: Table,
  delta: Milliseconds
): Table {
  return {
    ...table,
    time: table.time.map(time => time + delta),
  };
}

/**
 * Adjust the "timestamp" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 */
function _adjustJsTracerTimestamps(
  jsTracer: JsTracerTable,
  delta: Milliseconds
): JsTracerTable {
  const deltaMicroseconds = delta * 1000;
  return {
    ...jsTracer,
    timestamps: jsTracer.timestamps.map(time => time + deltaMicroseconds),
  };
}

/**
 * Adjust the "timestamp" field of overhead data by the given delta. This is
 * needed when integrating subprocess profiles into the parent process profile;
 * each profile's process has its own timebase, and we don't want to keep
 * converting timestamps when we deal with the integrated profile. Differently,
 * time field of profiler overhead is in microseconds, so we have to convert it
 * into milliseconds.
 */
export function adjustProfilerOverheadTimestamps<
  Table: { time: Microseconds[] }
>(table: Table, delta: Milliseconds): Table {
  return {
    ...table,
    // Converting microseconds to milliseconds here since we use milliseconds
    // inside the tracks.
    time: table.time.map(time => time / 1000 + delta),
  };
}

/**
 * Adjust all timestamp fields by the given delta. This is needed when
 * integrating subprocess profiles into the parent process profile; each
 * profile's process has its own timebase, and we don't want to keep
 * converting timestamps when we deal with the integrated profile.
 */
export function adjustMarkerTimestamps(
  markers: RawMarkerTable,
  delta: Milliseconds
): RawMarkerTable {
  function adjustTimeIfNotNull(time: number | null) {
    return time === null ? time : time + delta;
  }
  return {
    ...markers,
    startTime: markers.startTime.map(adjustTimeIfNotNull),
    endTime: markers.endTime.map(adjustTimeIfNotNull),
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
      }
      if (newData.type === 'Network') {
        if (typeof newData.domainLookupStart === 'number') {
          newData.domainLookupStart += delta;
        }
        if (typeof newData.domainLookupEnd === 'number') {
          newData.domainLookupEnd += delta;
        }
        if (typeof newData.connectStart === 'number') {
          newData.connectStart += delta;
        }
        if (typeof newData.tcpConnectEnd === 'number') {
          newData.tcpConnectEnd += delta;
        }
        if (typeof newData.secureConnectionStart === 'number') {
          newData.secureConnectionStart += delta;
        }
        if (typeof newData.connectEnd === 'number') {
          newData.connectEnd += delta;
        }
        if (typeof newData.requestStart === 'number') {
          newData.requestStart += delta;
        }
        if (typeof newData.responseStart === 'number') {
          newData.responseStart += delta;
        }
        if (typeof newData.responseEnd === 'number') {
          newData.responseEnd += delta;
        }
      }
      // Note: When adding code for new fields here, you may need to fix up
      // existing processed profiles that were missing the relevant adjustments.
      // This should be done by adding an upgrader in processed-profile-versioning.js.
      // In fact, that file already includes code duplicated from this function
      // for at least two cases where we forgot to do the adjustment initially.
      return newData;
    }),
  };
}

/**
 * Marker schemas are only emitted for markers that are used. Each subprocess
 * can have a different list, as the processes are not coordinating with each
 * other in Gecko. These per-process lists need to be consolidated into a
 * primary list that is stored on the processed profile's meta object.
 */
function processMarkerSchema(geckoProfile: GeckoProfile): MarkerSchema[] {
  const combinedSchemas: MarkerSchema[] = geckoProfile.meta.markerSchema;
  const names: Set<string> = new Set(
    geckoProfile.meta.markerSchema.map(({ name }) => name)
  );

  for (const subprocess of geckoProfile.processes) {
    for (const markerSchema of subprocess.meta.markerSchema) {
      if (!names.has(markerSchema.name)) {
        names.add(markerSchema.name);
        combinedSchemas.push(markerSchema);
      }
    }
  }

  return combinedSchemas;
}

/**
 * Convert an unknown profile from either the Gecko format or the DevTools format
 * into the processed format. Throws if there is an error.
 */
export function processGeckoOrDevToolsProfile(json: mixed): Profile {
  if (!json) {
    throw new Error('The profile was empty.');
  }
  if (typeof json !== 'object') {
    throw new Error('The profile was not an object');
  }

  // The profile can be embedded in an object if it's exported from the old DevTools
  // performance panel.
  // { profile: GeckoProfile }
  const geckoProfile = coerce<mixed, GeckoProfile>(
    json.profile ? json.profile : json
  );

  // Double check that there is a meta object, since this is the first time we've
  // coerced a "mixed" object to a GeckoProfile.
  if (!geckoProfile.meta) {
    throw new Error(
      'This does not appear to be a valid Gecko Profile, there is no meta field.'
    );
  }

  return processGeckoProfile(geckoProfile);
}

/**
 * Convert a profile from the Gecko format into the processed format.
 * Throws an exception if it encounters an incompatible profile.
 * For a description of the processed format, look at docs-developer/gecko-profile-format.md
 */
export function processGeckoProfile(geckoProfile: GeckoProfile): Profile {
  // Handle profiles from older versions of Gecko. This call might throw an
  // exception.
  upgradeGeckoProfileToCurrentVersion(geckoProfile);

  let threads = [];

  const extensions: ExtensionTable = geckoProfile.meta.extensions
    ? _toStructOfArrays(geckoProfile.meta.extensions)
    : getEmptyExtensions();

  for (const thread of geckoProfile.threads) {
    threads.push(_processThread(thread, geckoProfile, extensions));
  }
  const counters: Counter[] = _processCounters(geckoProfile, threads, 0);
  const nullableProfilerOverhead: Array<ProfilerOverhead | null> = [
    _processProfilerOverhead(geckoProfile, threads, 0),
  ];

  for (const subprocessProfile of geckoProfile.processes) {
    const adjustTimestampsBy =
      subprocessProfile.meta.startTime - geckoProfile.meta.startTime;
    threads = threads.concat(
      subprocessProfile.threads.map(thread => {
        const newThread: Thread = _processThread(
          thread,
          subprocessProfile,
          extensions
        );
        newThread.samples = adjustTableTimestamps(
          newThread.samples,
          adjustTimestampsBy
        );
        newThread.markers = adjustMarkerTimestamps(
          newThread.markers,
          adjustTimestampsBy
        );
        if (newThread.jsTracer) {
          newThread.jsTracer = _adjustJsTracerTimestamps(
            newThread.jsTracer,
            adjustTimestampsBy
          );
        }
        if (newThread.jsAllocations) {
          newThread.jsAllocations = adjustTableTimestamps(
            newThread.jsAllocations,
            adjustTimestampsBy
          );
        }
        if (newThread.nativeAllocations) {
          newThread.nativeAllocations = adjustTableTimestamps(
            newThread.nativeAllocations,
            adjustTimestampsBy
          );
        }
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

    counters.push(
      ..._processCounters(subprocessProfile, threads, adjustTimestampsBy)
    );

    nullableProfilerOverhead.push(
      _processProfilerOverhead(subprocessProfile, threads, adjustTimestampsBy)
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
    product: geckoProfile.meta.product || '',
    stackwalk: geckoProfile.meta.stackwalk,
    debug: !!geckoProfile.meta.debug,
    toolkit: geckoProfile.meta.toolkit,
    version: geckoProfile.meta.version,
    categories: geckoProfile.meta.categories,
    preprocessedProfileVersion: PROCESSED_PROFILE_VERSION,
    appBuildID: geckoProfile.meta.appBuildID,
    visualMetrics: geckoProfile.meta.visualMetrics,
    configuration: geckoProfile.meta.configuration,
    // A link to the source code revision for this build.
    sourceURL: geckoProfile.meta.sourceURL,
    physicalCPUs: geckoProfile.meta.physicalCPUs,
    logicalCPUs: geckoProfile.meta.logicalCPUs,
    // `presymbolicated` indicates whether this gecko profile includes already
    // symbolicated frames. This will be missing for profiles coming from Gecko
    // but may be specified for profiles imported from other formats (eg: linux
    // perf). If it's present and true, then we indicate that the process is
    // already symbolicated, otherwise we indicate it needs to be symbolicated.
    symbolicated: !!geckoProfile.meta.presymbolicated,
    updateChannel: geckoProfile.meta.updateChannel,
    markerSchema: processMarkerSchema(geckoProfile),
  };

  const profilerOverhead: ProfilerOverhead[] = nullableProfilerOverhead.reduce(
    (acc, overhead) => {
      if (overhead !== null) {
        acc.push(overhead);
      }
      return acc;
    },
    []
  );

  // Convert JS tracer information into their own threads. This mutates
  // the threads array.
  for (const thread of threads.slice()) {
    const { jsTracer } = thread;
    if (jsTracer) {
      const friendlyThreadName = getFriendlyThreadName(threads, thread);
      const jsTracerThread = convertJsTracerToThread(
        thread,
        jsTracer,
        meta.categories
      );
      jsTracerThread.isJsTracer = true;
      jsTracerThread.name = `JS Tracer of ${friendlyThreadName}`;
      threads.push(jsTracerThread);

      // Delete the reference to the original jsTracer data, but keep it on this thread.
      delete thread.jsTracer;
    }
  }

  const result = {
    meta,
    pages,
    counters,
    profilerOverhead,
    threads,
  };
  return result;
}

/**
 * The UniqueStringArray is a class, and is not serializable. This function turns
 * a profile into the serializable variant.
 */
export function makeProfileSerializable({
  threads,
  ...restOfProfile
}: Profile): SerializableProfile {
  return {
    ...restOfProfile,
    threads: threads.map(({ stringTable, ...restOfThread }) => {
      return {
        ...restOfThread,
        stringArray: stringTable.serializeToArray(),
      };
    }),
  };
}

/**
 * Take a processed profile and remove any non-serializable classes such as the
 * StringTable class.
 */
export function serializeProfile(profile: Profile): string {
  return JSON.stringify(makeProfileSerializable(profile));
}

/**
 * Take a serialized processed profile from some saved source, and re-initialize
 * any non-serializable classes.
 */
function _unserializeProfile({
  threads,
  ...restOfProfile
}: SerializableProfile): Profile {
  return {
    ...restOfProfile,
    threads: threads.map(({ stringArray, ...restOfThread }) => {
      return {
        ...restOfThread,
        stringTable: new UniqueStringArray(stringArray),
      };
    }),
  };
}

/**
 * Take some arbitrary profile file from some data source, and turn it into
 * the processed profile format.
 */
export async function unserializeProfileOfArbitraryFormat(
  arbitraryFormat: mixed
): Promise<Profile> {
  try {
    let json: mixed;
    if (typeof arbitraryFormat === 'string') {
      try {
        json = JSON.parse(arbitraryFormat);
      } catch (e) {
        // The string is not json. It might be the output from `perf script`.
        if (isPerfScriptFormat(arbitraryFormat)) {
          json = convertPerfScriptProfile(arbitraryFormat);
        } else {
          throw e;
        }
      }
    } else {
      json = arbitraryFormat;
    }

    const processedProfile = attemptToUpgradeProcessedProfileThroughMutation(
      json
    );
    if (processedProfile) {
      return _unserializeProfile(processedProfile);
    }

    const processedChromeProfile = attemptToConvertChromeProfile(json);
    if (processedChromeProfile) {
      return processedChromeProfile;
    }

    // Else: Treat it as a Gecko profile and just attempt to process it.
    return processGeckoOrDevToolsProfile(json);
  } catch (e) {
    throw new Error(`Unserializing the profile failed: ${e}`);
  }
}
