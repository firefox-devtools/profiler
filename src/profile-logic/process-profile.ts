/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { attemptToConvertChromeProfile } from './import/chrome';
import { attemptToConvertDhat } from './import/dhat';
import { AddressLocator } from './address-locator';
import { StringTable } from '../utils/string-table';
import {
  resourceTypes,
  getEmptyExtensions,
  getEmptyFuncTable,
  getEmptyResourceTable,
  getEmptyRawMarkerTable,
  getEmptyJsAllocationsTable,
  getEmptyUnbalancedNativeAllocationsTable,
  getEmptyNativeSymbolTable,
} from './data-structures';
import { immutableUpdate, ensureExists, coerce } from '../utils/flow';
import { verifyMagic, SIMPLEPERF as SIMPLEPERF_MAGIC } from '../utils/magic';
import { attemptToUpgradeProcessedProfileThroughMutation } from './processed-profile-versioning';
import { upgradeGeckoProfileToCurrentVersion } from './gecko-profile-versioning';
import {
  isPerfScriptFormat,
  convertPerfScriptProfile,
} from './import/linux-perf';
import { isArtTraceFormat, convertArtTraceProfile } from './import/art-trace';
import {
  PROCESSED_PROFILE_VERSION,
  INTERVAL,
  INTERVAL_END,
  INSTANT,
} from '../app-logic/constants';
import {
  getFriendlyThreadName,
  getOrCreateURIResource,
  nudgeReturnAddresses,
} from '../profile-logic/profile-data';
import { computeStringIndexMarkerFieldsByDataType } from '../profile-logic/marker-schema';
import { convertJsTracerToThread } from '../profile-logic/js-tracer';

import type {
  Profile,
  RawProfileSharedData,
  RawThread,
  RawCounter,
  ExtensionTable,
  FrameTable,
  RawCounterSamplesTable,
  RawSamplesTable,
  RawStackTable,
  RawMarkerTable,
  Lib,
  LibMapping,
  FuncTable,
  ResourceTable,
  IndexIntoLibs,
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
  GeckoCounter,
  GeckoProfile,
  GeckoSubprocessProfile,
  GeckoThread,
  GeckoMetaMarkerSchema,
  GeckoStaticFieldSchemaData,
  GeckoMarkers,
  GeckoMarkerStruct,
  GeckoMarkerTuple,
  GeckoFrameStruct,
  GeckoSampleStruct,
  GeckoStackStruct,
  GeckoCounterSamplesStruct,
  GeckoProfilerOverhead,
  IndexIntoGeckoThreadStringTable,
  GCSliceMarkerPayload,
  GCMajorMarkerPayload,
  MarkerPayload,
  MarkerPayload_Gecko,
  GCSliceData_Gecko,
  GCMajorCompleted,
  GCMajorCompleted_Gecko,
  GCMajorAborted,
  PhaseTimes,
  ExternalMarkersData,
  MarkerSchema,
  MarkerSchemaField,
  ProfileMeta,
  PageList,
  ThreadIndex,
  BrowsertimeMarkerPayload,
  MarkerPhase,
  Pid,
  GeckoMarkerSchema,
} from 'firefox-profiler/types';
import { decompress, isGzip } from 'firefox-profiler/utils/gz';

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
  const result: any = { length: geckoTable.data.length };
  for (const fieldName in geckoTable.schema) {
    const fieldIndex = geckoTable.schema[fieldName];
    if (typeof fieldIndex !== 'number') {
      throw new Error(
        'fieldIndex must be a number in the Gecko profile table.'
      );
    }
    result[fieldName] = geckoTable.data.map((entry: any) =>
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

/**
 * GlobalDataCollector collects data which is global in the processed profile
 * format but per-process or per-thread in the Gecko profile format. It
 * de-duplicates elements and builds one shared list of each type.
 * For now it only de-duplicates libraries, but in the future we may move more
 * tables to be global.
 * You could also call this class an "interner".
 */
export class GlobalDataCollector {
  _libs: Lib[] = [];
  _libKeyToLibIndex: Map<string, IndexIntoLibs> = new Map();
  _stringArray: string[] = [];
  _stringTable: StringTable = StringTable.withBackingArray(this._stringArray);

  // Return the global index for this library, adding it to the global list if
  // necessary.
  indexForLib(libMapping: LibMapping | Lib): IndexIntoLibs {
    const { debugName, breakpadId } = libMapping;
    const libKey = `${debugName}/${breakpadId}`;
    let index = this._libKeyToLibIndex.get(libKey);
    if (index === undefined) {
      index = this._libs.length;
      const { arch, name, path, debugPath, codeId } = libMapping;
      this._libs.push({
        arch,
        name,
        path,
        debugName,
        debugPath,
        breakpadId,
        codeId: codeId ?? null,
      });
      this._libKeyToLibIndex.set(libKey, index);
    }
    return index;
  }

  getStringTable(): StringTable {
    return this._stringTable;
  }

  // Package up all de-duplicated global tables so that they can be embedded in
  // the profile.
  finish(): { libs: Lib[]; shared: RawProfileSharedData } {
    return { libs: this._libs, shared: { stringArray: this._stringArray } };
  }
}

type ExtractionInfo = {
  funcTable: FuncTable;
  resourceTable: ResourceTable;
  geckoThreadStringArray: string[];
  stringTable: StringTable;
  addressLocator: AddressLocator;
  libToResourceIndex: Map<IndexIntoLibs, IndexIntoResourceTable>;
  originToResourceIndex: Map<string, IndexIntoResourceTable>;
  libNameToResourceIndex: Map<IndexIntoStringTable, IndexIntoResourceTable>;
  stringToNewFuncIndexAndFrameAddress: Map<
    string,
    { funcIndex: IndexIntoFuncTable; frameAddress: Address | null }
  >;
  globalDataCollector: GlobalDataCollector;
};

/**
 * Resources and funcs are not part of the Gecko Profile format. This information is
 * implicitly defined in the frame tables' location strings. This function derives a new
 * FuncTable and ResourceTable for easily accesing this information in a structred format.
 *
 * The returned IndexIntoFuncTable[] value maps the index of each element in the
 * frameLocations array to a func from the returned FuncTable.
 */
export function extractFuncsAndResourcesFromFrameLocations(
  frameLocations: IndexIntoGeckoThreadStringTable[],
  relevantForJSPerFrame: boolean[],
  geckoThreadStringArray: string[],
  libs: LibMapping[],
  extensions: ExtensionTable = getEmptyExtensions(),
  globalDataCollector: GlobalDataCollector
): {
  funcTable: FuncTable;
  resourceTable: ResourceTable;
  frameFuncs: IndexIntoFuncTable[];
  frameAddresses: (Address | null)[];
} {
  // Important! If the flow type for the FuncTable was changed, update all the functions
  // in this file that start with the word "extract".
  const funcTable = getEmptyFuncTable();

  // Important! If the flow type for the ResourceTable was changed, update all the functions
  // in this file that start with the word "extract".
  const resourceTable = getEmptyResourceTable();

  const stringTable = globalDataCollector.getStringTable();

  // Bundle all of the variables up into an object to pass them around to functions.
  const extractionInfo: ExtractionInfo = {
    funcTable,
    resourceTable,
    geckoThreadStringArray,
    stringTable,
    addressLocator: new AddressLocator(libs),
    libToResourceIndex: new Map(),
    originToResourceIndex: new Map(),
    libNameToResourceIndex: new Map(),
    stringToNewFuncIndexAndFrameAddress: new Map(),
    globalDataCollector,
  };

  for (let i = 0; i < extensions.length; i++) {
    _addExtensionOrigin(extractionInfo, extensions, i);
  }

  // Go through every frame location string, and deduce the function and resource
  // information by applying various string matching heuristics.
  const frameFuncs = [];
  const frameAddresses = [];
  for (let frameIndex = 0; frameIndex < frameLocations.length; frameIndex++) {
    const originalLocationIndex = frameLocations[frameIndex];
    const locationString = ensureExists(
      geckoThreadStringArray[originalLocationIndex]
    );
    const locationIndex = stringTable.indexForString(locationString);
    const relevantForJS = relevantForJSPerFrame[frameIndex];
    const info =
      extractionInfo.stringToNewFuncIndexAndFrameAddress.get(locationString);
    if (info !== undefined) {
      // The location string was already processed.
      const { funcIndex, frameAddress } = info;
      frameFuncs.push(funcIndex);
      frameAddresses.push(frameAddress);
      continue;
    }

    // These nested `if` branches check for 3 cases for constructing function and
    // resource information.
    let funcIndex = null;
    let frameAddress = null;
    const unsymbolicatedInfo = _extractUnsymbolicatedFunction(
      extractionInfo,
      locationString,
      locationIndex
    );
    if (unsymbolicatedInfo !== null) {
      funcIndex = unsymbolicatedInfo.funcIndex;
      frameAddress = unsymbolicatedInfo.frameAddress;
    } else {
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
    extractionInfo.stringToNewFuncIndexAndFrameAddress.set(locationString, {
      funcIndex,
      frameAddress,
    });

    frameFuncs.push(funcIndex);
    frameAddresses.push(frameAddress);
  }

  return {
    funcTable: extractionInfo.funcTable,
    resourceTable: extractionInfo.resourceTable,
    frameFuncs,
    frameAddresses,
  };
}

/**
 * Given a location string that looks like a memory address, e.g. "0xfe9a097e0", treat
 * it as an unsymblicated memory address and add a new function for it to the function table.
 * This happens before we have any symbol info, so we do not know which addresses fall
 * into the same function, so cannot do any function grouping. So we get one "function" per
 * address.
 * We also associate the address with the library that contains it, and convert the address
 * into a library-relative offset. This association is established via the function's
 * "resource": The function points to the resource (of type resourceTypes.library), and the
 * resource has the index to the library in thread.libs.
 * We return the index of the newly-added function, and the address as a library-relative
 * offset.
 */
function _extractUnsymbolicatedFunction(
  extractionInfo: ExtractionInfo,
  locationString: string,
  locationIndex: IndexIntoStringTable
): { funcIndex: IndexIntoFuncTable; frameAddress: Address } | null {
  if (!locationString.startsWith('0x')) {
    return null;
  }
  const {
    addressLocator,
    libToResourceIndex,
    resourceTable,
    funcTable,
    stringTable,
  } = extractionInfo;

  let resourceIndex = -1;
  let addressRelativeToLib: Address = -1;

  try {
    // The frame address, as observed in the profiled process. This address was
    // valid in the (virtual memory) address space of the profiled process.
    // It can be a very large u64 value, larger than Number.MAX_SAFE_INTEGER.
    // To make sure we don't lose precision, we leave it as a hex string.
    const addressHex = locationString;

    // We want to turn this address into a library-relative offset.
    // Look up to see if it falls into one of the libraries that were mapped into
    // the profiled process, according to the libs list.
    // This call will throw if addressHex is not a valid hex number.
    const { lib, relativeAddress } = addressLocator.locateAddress(addressHex);
    if (lib !== null) {
      // Yes, we found the library whose mapping covers this address!
      addressRelativeToLib = relativeAddress;

      const libIndex = extractionInfo.globalDataCollector.indexForLib(lib);

      const resourceIndexOrUndefined = libToResourceIndex.get(libIndex);
      if (resourceIndexOrUndefined !== undefined) {
        resourceIndex = resourceIndexOrUndefined;
      } else {
        // This library doesn't exist in the libs array, insert it. This resou
        // A lib resource is a systems-level compiled library, for example "XUL",
        // "AppKit", or "CoreFoundation".
        resourceIndex = resourceTable.length++;
        resourceTable.lib[resourceIndex] = libIndex;
        resourceTable.name[resourceIndex] = stringTable.indexForString(
          lib.name
        );
        resourceTable.host[resourceIndex] = null;
        resourceTable.type[resourceIndex] = resourceTypes.library;
        libToResourceIndex.set(libIndex, resourceIndex);
      }
    }
  } catch (e) {
    // Probably a hex parse error. Ignore.
  }
  // Add the function to the funcTable.
  const funcIndex = funcTable.length++;
  funcTable.name[funcIndex] = locationIndex;
  funcTable.resource[funcIndex] = resourceIndex;
  funcTable.relevantForJS[funcIndex] = false;
  funcTable.isJS[funcIndex] = false;
  funcTable.fileName[funcIndex] = null;
  funcTable.lineNumber[funcIndex] = null;
  funcTable.columnNumber[funcIndex] = null;
  return { funcIndex, frameAddress: addressRelativeToLib };
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
    stringToNewFuncIndexAndFrameAddress,
    libNameToResourceIndex,
    resourceTable,
  } = extractionInfo;

  const [, funcNameRaw, libraryNameString] = cppMatch;
  const funcName = _cleanFunctionName(funcNameRaw);
  const funcNameIndex = stringTable.indexForString(funcName);
  const libraryNameStringIndex = stringTable.indexForString(libraryNameString);
  const frameInfo = stringToNewFuncIndexAndFrameAddress.get(funcName);
  if (frameInfo !== undefined) {
    // Do not insert a new function.
    return frameInfo.funcIndex;
  }
  let resourceIndex = libNameToResourceIndex.get(libraryNameStringIndex);
  if (resourceIndex === undefined) {
    resourceIndex = resourceTable.length++;
    libNameToResourceIndex.set(libraryNameStringIndex, resourceIndex);
    resourceTable.lib[resourceIndex] = null;
    resourceTable.name[resourceIndex] = libraryNameStringIndex;
    resourceTable.host[resourceIndex] = null;
    resourceTable.type[resourceIndex] = resourceTypes.library;
  }

  const newFuncIndex = funcTable.length++;
  funcTable.name[newFuncIndex] = funcNameIndex;
  funcTable.resource[newFuncIndex] = resourceIndex;
  funcTable.relevantForJS[newFuncIndex] = false;
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

    resourceTable.lib[resourceIndex] = null;
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

  const { funcTable, stringTable, resourceTable, originToResourceIndex } =
    extractionInfo;

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
  frameFuncs: IndexIntoFuncTable[],
  frameAddresses: (Address | null)[]
): FrameTable {
  return {
    address: frameAddresses.map((a) => a ?? -1),
    inlineDepth: Array(geckoFrameStruct.length).fill(0),
    category: geckoFrameStruct.category,
    subcategory: geckoFrameStruct.subcategory,
    func: frameFuncs,
    nativeSymbol: Array(geckoFrameStruct.length).fill(null),
    innerWindowID: geckoFrameStruct.innerWindowID,
    line: geckoFrameStruct.line,
    column: geckoFrameStruct.column,
    length: geckoFrameStruct.length,
  };
}

/**
 * Explicitly recreate the stack table here to help enforce our assumptions about types.
 * Also add a category column.
 */
function _processStackTable(geckoStackTable: GeckoStackStruct): RawStackTable {
  return {
    frame: geckoStackTable.frame,
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
function _convertStackToCause(data: MarkerPayload_Gecko) {
  if ('stack' in data && data.stack && data.stack.samples.data.length > 0) {
    const { stack, ...newData } = data;
    const stackIndex = stack.samples.data[0][stack.samples.schema.stack];
    const time = stack.samples.data[0][stack.samples.schema.time];
    if (stackIndex !== null) {
      return {
        ...newData,
        cause: { tid: stack.tid, time, stack: stackIndex },
      };
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
  data: MarkerPayload_Gecko | null
): IndexIntoStackTable | null {
  if (!data) {
    return null;
  }
  if ('stack' in data && data.stack && data.stack.samples.data.length > 0) {
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
  geckoMarkers: GeckoMarkerStruct,
  stringArray: string[],
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  globalDataCollector: GlobalDataCollector
): {
  markers: RawMarkerTable;
  jsAllocations: JsAllocationsTable | null;
  nativeAllocations: NativeAllocationsTable | null;
} {
  const markers = getEmptyRawMarkerTable();
  const jsAllocations = getEmptyJsAllocationsTable();
  const inProgressNativeAllocations =
    getEmptyUnbalancedNativeAllocationsTable();
  const memoryAddress: number[] = [];
  const threadId: number[] = [];

  const stringTable = globalDataCollector.getStringTable();

  // Determine if native allocations have memory addresses.
  let hasMemoryAddresses;

  for (let markerIndex = 0; markerIndex < geckoMarkers.length; markerIndex++) {
    const geckoPayload = geckoMarkers.data[markerIndex];

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

    const payload = _processMarkerPayload(
      geckoPayload,
      stringArray,
      stringTable,
      stringIndexMarkerFieldsByDataType
    );
    const name = stringTable.indexForString(
      stringArray[geckoMarkers.name[markerIndex]]
    );
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
  const phases: PhaseTimes<Microseconds> = {};
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
  geckoPayload: MarkerPayload_Gecko | null,
  stringArray: string[],
  stringTable: StringTable,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>
): MarkerPayload | null {
  if (!geckoPayload) {
    return null;
  }

  // If there is a "stack" field, convert it to a "cause" field. This is
  // pre-emptively done for every single marker payload.
  //
  // Warning: This function converts the payload into an any type.
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

      return {
        type: 'GCSlice',
        timings: {
          ...partialTimings,
          phase_times: times ? convertPhaseTimes(times) : {},
        },
      } as GCSliceMarkerPayload;
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
          return {
            type: 'GCMajor',
            timings: timings,
          } as GCMajorMarkerPayload;
        }
        case 'aborted':
          return {
            type: 'GCMajor',
            timings: { status: 'aborted' },
          } as GCMajorMarkerPayload;
        default:
          // Flow cannot detect that this switch is complete.
          console.log('Unknown GCMajor status');
          throw new Error('Unknown GCMajor status');
      }
    }
    case 'IPC': {
      // Convert otherPid to a string.
      const {
        startTime,
        endTime,
        otherPid,
        messageType,
        messageSeqno,
        side,
        direction,
        phase,
        sync,
        threadId,
      } = payload;
      return {
        type: 'IPC',
        startTime,
        endTime,
        otherPid: `${otherPid}`,
        messageType,
        messageSeqno,
        side,
        direction,
        phase,
        sync,
        threadId,
      };
    }
    default:
      break;
  }

  // `payload` is currently typed as the result of _convertStackToCause, which
  // is MarkerPayload_Gecko where `stack` has been replaced with `cause`. This
  // should be reasonably close to `MarkerPayload`, but Flow doesn't work well
  // with our MarkerPayload type. So we coerce this return value to `any`
  // here, and then to `MarkerPayload` as the return value for this function.
  // This doesn't provide type safety but it shows the intent of going from an
  // object without much type safety, to a specific type definition.
  const data: MarkerPayload = payload as any;

  if (!data.type) {
    return data;
  }

  const stringIndexMarkerFields = stringIndexMarkerFieldsByDataType.get(
    data.type
  );
  if (stringIndexMarkerFields === undefined) {
    return data;
  }

  let newData: MarkerPayload = data;
  for (const fieldKey of stringIndexMarkerFields) {
    const stringIndex = (data as any)[fieldKey];
    if (typeof stringIndex === 'number') {
      newData = {
        ...newData,
        [fieldKey]: stringTable.indexForString(stringArray[stringIndex]),
      } as any;
    }
  }
  return newData;
}

function _timeColumnToCompactTimeDeltas(time: Milliseconds[]): Milliseconds[] {
  const NS_PER_MS = 1000000;

  // For each timestamp in the time series, compute the delta to the previous
  // timestamp. The implicit initial timestamp is zero.
  //
  // Timestamps are in milliseconds. To compute the deltas, we first convert each
  // timestamp to integer nanoseconds. Then we subtract those nanosecond timestamps
  // and converting the delta to milliseconds again. We do this dance so that
  // the deltas have a "compact" stringified representation. Otherwise,
  // converting to deltas could easily increase the JSON size.
  // For example, 252.728334 - 240.520375 === 12.207958999999988.
  const timeDeltas = new Array(time.length);
  let prevTimeNs = 0;
  for (let i = 0; i < time.length; i++) {
    const currentTimeNs = Math.round(time[i] * NS_PER_MS);
    timeDeltas[i] = (currentTimeNs - prevTimeNs) / NS_PER_MS;
    prevTimeNs = currentTimeNs;
  }
  return timeDeltas;
}

/**
 * Explicitly recreate the samples table here to help enforce our assumptions
 * about types, and to convert timestamps to deltas.
 */
function _processSamples(geckoSamples: GeckoSampleStruct): RawSamplesTable {
  const samples: RawSamplesTable = {
    stack: geckoSamples.stack,
    timeDeltas: _timeColumnToCompactTimeDeltas(geckoSamples.time),
    weightType: 'samples',
    weight: null,
    length: geckoSamples.length,
  };

  if (geckoSamples.threadCPUDelta) {
    // Check to see the CPU delta numbers are all null and if they are, remove
    // this array completely. For example on JVM threads, all the threadCPUDelta
    // values will be null and therefore it will fail to paint the activity graph.
    // Instead we should remove the whole array. This call will be quick for most
    // of the cases because we usually have values at least in the second sample.
    const hasCPUDeltaValues = geckoSamples.threadCPUDelta.some(
      (val) => val !== null
    );
    if (hasCPUDeltaValues) {
      samples.threadCPUDelta = geckoSamples.threadCPUDelta;
    }
  }

  if ('eventDelay' in geckoSamples) {
    samples.eventDelay = geckoSamples.eventDelay;
  } else if ('responsiveness' in geckoSamples) {
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
  stableThreadList: RawThread[],
  // The timing across processes must be normalized, this is the timing delta between
  // various processes.
  delta: Milliseconds
): RawCounter[] {
  const geckoCounters = geckoProfile.counters;
  const mainThread = geckoProfile.threads.find(
    (thread) => thread.name === 'GeckoMain'
  );

  if (!mainThread || !geckoCounters) {
    // Counters or a main thread weren't found, bail out, and return an empty array.
    return [];
  }

  const mainThreadPid: Pid = `${mainThread.pid}`;

  // The gecko profile's process don't map to the final thread list. Use the stable
  // thread list to look up the thread index for the main thread in this profile.
  const mainThreadIndex = stableThreadList.findIndex(
    (thread) => thread.name === 'GeckoMain' && thread.pid === mainThreadPid
  );

  if (mainThreadIndex === -1) {
    throw new Error(
      'Unable to find the main thread in the stable thread list. This means that the ' +
        'logic in the _processCounters function is wrong.'
    );
  }

  return geckoCounters.reduce<RawCounter[]>(
    (result, { name, category, description, samples }) => {
      if (samples.data.length === 0) {
        // It's possible that no sample has been collected during our capture
        // session, ignore this counter if that's the case.
        return result;
      }

      const geckoCounterSamples: GeckoCounterSamplesStruct =
        _toStructOfArrays(samples);
      const processedCounterSamples =
        _processCounterSamples(geckoCounterSamples);

      result.push({
        name,
        category,
        description,
        pid: mainThreadPid,
        mainThreadIndex,
        samples: adjustTableTimeDeltas(processedCounterSamples, delta),
      });
      return result;
    },
    []
  );
}

/**
 * Explicitly recreate the counter samples table here to help enforce our
 * assumptions about types, and to convert timestamps to deltas.
 */
function _processCounterSamples(
  geckoCounterSamples: GeckoCounterSamplesStruct
): RawCounterSamplesTable {
  return {
    timeDeltas: _timeColumnToCompactTimeDeltas(geckoCounterSamples.time),
    number: geckoCounterSamples.number,
    count: geckoCounterSamples.count,
    length: geckoCounterSamples.length,
  };
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
  stableThreadList: RawThread[],
  // The timing across processes must be normalized, this is the timing delta between
  // various processes.
  delta: Milliseconds
): ProfilerOverhead | null {
  const geckoProfilerOverhead: GeckoProfilerOverhead | undefined =
    geckoProfile.profilerOverhead;
  const mainThread = geckoProfile.threads.find(
    (thread) => thread.name === 'GeckoMain'
  );

  if (!mainThread || !geckoProfilerOverhead) {
    // Profiler overhead or a main thread weren't found, bail out, and return an empty array.
    return null;
  }

  const mainThreadPid: Pid = `${mainThread.pid}`;

  // The gecko profile's process don't map to the final thread list. Use the stable
  // thread list to look up the thread index for the main thread in this profile.
  const mainThreadIndex = stableThreadList.findIndex(
    (thread) => thread.name === 'GeckoMain' && thread.pid === mainThreadPid
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
    pid: mainThreadPid,
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
  extensions: ExtensionTable,
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  globalDataCollector: GlobalDataCollector
): RawThread {
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
  const { shutdownTime } = meta;

  const { funcTable, resourceTable, frameFuncs, frameAddresses } =
    extractFuncsAndResourcesFromFrameLocations(
      geckoFrameStruct.location,
      geckoFrameStruct.relevantForJS,
      thread.stringTable,
      libs,
      extensions,
      globalDataCollector
    );
  const nativeSymbols = getEmptyNativeSymbolTable();
  const frameTable: FrameTable = _processFrameTable(
    geckoFrameStruct,
    frameFuncs,
    frameAddresses
  );
  const stackTable = _processStackTable(geckoStackTable);
  const { markers, jsAllocations, nativeAllocations } = _processMarkers(
    geckoMarkers,
    thread.stringTable,
    stringIndexMarkerFieldsByDataType,
    globalDataCollector
  );
  const samples = _processSamples(geckoSamples);

  const newThread: RawThread = {
    name: thread.name,
    isMainThread: thread.name === 'GeckoMain',
    'eTLD+1': thread['eTLD+1'],
    processType: thread.processType,
    processName:
      typeof thread.processName === 'string' ? thread.processName : '',
    processStartupTime: 0,
    processShutdownTime: shutdownTime,
    registerTime: thread.registerTime,
    unregisterTime: thread.unregisterTime,
    tid: thread.tid,
    pid: `${thread.pid}`,
    pausedRanges: pausedRanges || [],
    frameTable,
    funcTable,
    nativeSymbols,
    resourceTable,
    stackTable,
    markers,
    samples,
  };

  // isPrivateBrowsing and userContextId are missing in firefox 97 and
  // earlier. Also they're missing when this thread had no origin attribute at
  // all (non-Fission or a normal thread in Fission).
  // Let's add them to the new thread only when present in the gecko thread.
  if (thread.isPrivateBrowsing !== undefined) {
    newThread.isPrivateBrowsing = thread.isPrivateBrowsing;
  }

  if (thread.userContextId !== undefined) {
    newThread.userContextId = thread.userContextId;
  }

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
    const stringTable = globalDataCollector.getStringTable();
    if (jsTracerEvents && jsTracerDictionary) {
      // Add the JS tracer's strings to the thread's existing string table, and create
      // a mapping from the old string indexes to the new ones. Use an Array rather
      // than a Map because it saves ~150ms out of ~300ms in one example.
      const geckoToProcessedStringIndex: number[] = new Array(
        jsTracerDictionary.length
      );
      for (let i = 0; i < jsTracerDictionary.length; i++) {
        geckoToProcessedStringIndex[i] = stringTable.indexForString(
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

  return nudgeReturnAddresses(newThread);
}

/**
 * Adjust the "time" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 */
export function adjustTableTimestamps<Table extends { time: Milliseconds[] }>(
  table: Table,
  delta: Milliseconds
): Table {
  return {
    ...table,
    time: table.time.map((time) => time + delta),
  };
}

export function adjustTableTimeDeltas<
  Table extends { timeDeltas?: Milliseconds[] },
>(table: Table, delta: Milliseconds): Table {
  const { timeDeltas } = table;
  if (timeDeltas === undefined) {
    throw new Error(
      'Should only be called when a timeDeltas column is present'
    );
  }

  const newTimeDeltas = timeDeltas.slice();
  newTimeDeltas[0] += delta;
  return {
    ...table,
    timeDeltas: newTimeDeltas,
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
    timestamps: jsTracer.timestamps.map((time) => time + deltaMicroseconds),
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
  Table extends { time: Microseconds[] },
>(table: Table, delta: Milliseconds): Table {
  return {
    ...table,
    // Converting microseconds to milliseconds here since we use milliseconds
    // inside the tracks.
    time: table.time.map((time) => time / 1000 + delta),
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
    data: markers.data.map((data) => {
      if (!data) {
        return data;
      }
      const newData = immutableUpdate(data);
      if ('startTime' in newData && typeof newData.startTime === 'number') {
        newData.startTime += delta;
      }
      if ('endTime' in newData && typeof newData.endTime === 'number') {
        newData.endTime += delta;
      }
      if (
        'cause' in newData &&
        newData.cause &&
        newData.cause.time !== undefined
      ) {
        newData.cause.time += delta;
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

function _convertGeckoMarkerSchema(
  markerSchema: GeckoMetaMarkerSchema
): MarkerSchema {
  const {
    name,
    tooltipLabel,
    tableLabel,
    chartLabel,
    display,
    data,
    graphs,
    isStackBased,
  } = markerSchema;

  const fields: MarkerSchemaField[] = [];
  const staticFields: GeckoStaticFieldSchemaData[] = [];
  for (const f of data) {
    if ('key' in f) {
      const { key, label, format, hidden } = f;
      fields.push({ key, label, format, hidden });
    } else {
      staticFields.push(f);
    }
  }

  let description = undefined;
  if (staticFields.length !== 0) {
    let staticDescriptionFieldIndex = staticFields.findIndex(
      (f) => f.label === 'Description'
    );
    if (staticDescriptionFieldIndex === -1) {
      staticDescriptionFieldIndex = 0;
    }
    const discardedFields = staticFields.filter(
      (_f, i) => i !== staticDescriptionFieldIndex
    );
    const potentiallyUsefulDiscardedFields = discardedFields.filter(
      (f) => f.label !== 'Marker' && f.value !== 'UserTiming'
    );
    if (potentiallyUsefulDiscardedFields.length !== 0) {
      console.warn(
        `Discarding the following static fields from marker schema "${markerSchema.name}": ${potentiallyUsefulDiscardedFields.map((f) => f.label + ': ' + f.value).join(', ')}`
      );
    }
    description = staticFields[staticDescriptionFieldIndex].value;
  }

  return {
    name,
    tooltipLabel,
    tableLabel,
    chartLabel,
    display,
    fields,
    description,
    graphs,
    isStackBased,
  };
}

/**
 * Marker schemas are only emitted for markers that are used. Each subprocess
 * can have a different list, as the processes are not coordinating with each
 * other in Gecko. These per-process lists need to be consolidated into a
 * primary list that is stored on the processed profile's meta object.
 */
function processMarkerSchema(geckoProfile: GeckoProfile): MarkerSchema[] {
  const combinedSchemas: MarkerSchema[] = geckoProfile.meta.markerSchema.map(
    _convertGeckoMarkerSchema
  );
  const names: Set<string> = new Set(combinedSchemas.map(({ name }) => name));

  for (const subprocess of geckoProfile.processes) {
    for (const markerSchema of subprocess.meta.markerSchema) {
      if (!names.has(markerSchema.name)) {
        names.add(markerSchema.name);
        combinedSchemas.push(_convertGeckoMarkerSchema(markerSchema));
      }
    }
  }

  return combinedSchemas;
}

export function insertExternalMarkersIntoProfile(
  externalMarkers: ExternalMarkersData,
  geckoProfile: GeckoProfile
): void {
  if (
    !('markerSchema' in externalMarkers) ||
    !externalMarkers.markerSchema ||
    !externalMarkers.categories ||
    !externalMarkers.markers
  ) {
    // No data provided by Firefox.
    return;
  }

  for (const schema of externalMarkers.markerSchema) {
    const existingSchema = geckoProfile.meta.markerSchema.find(
      (s) => s.name === schema.name
    );
    if (existingSchema) {
      if (JSON.stringify(schema) !== JSON.stringify(existingSchema)) {
        console.error(
          `Existing marker schema for ${schema.name} doesn't match`,
          schema,
          existingSchema
        );
      }
    } else {
      geckoProfile.meta.markerSchema.push(schema);
    }
  }

  const categoryMap = new Map();
  for (let i = 0; i < externalMarkers.categories.length; ++i) {
    const cat = externalMarkers.categories[i];
    let index = geckoProfile.meta.categories.findIndex(
      (c) => c.name === cat.name
    );
    if (index === -1) {
      index = geckoProfile.meta.categories.push(cat) - 1;
    }
    categoryMap.set(i, index);
  }

  const mainThread = geckoProfile.threads.find(
    (thread) => thread.name === 'GeckoMain' && thread.processType === 'default'
  );
  if (!mainThread) {
    throw new Error('Could not find the main thread in the gecko profile');
  }

  const { data, schema } = externalMarkers.markers;

  for (const prop of Object.keys(
    mainThread.markers.schema
  ) as (keyof GeckoMarkerSchema)[]) {
    if (!(prop in schema) || mainThread.markers.schema[prop] !== schema[prop]) {
      throw new Error(
        'Marker table schema in the gecko profile and the external marker data do not match'
      );
    }
  }

  for (const marker of data) {
    const name = marker[schema.name];
    let stringId = mainThread.stringTable.indexOf(name);
    if (stringId === -1) {
      stringId = mainThread.stringTable.length;
      mainThread.stringTable.push(name);
    }
    // The ExternalMarkerTuple and GeckoMarkerTuple types are the same except
    // for the marker name that is represented as a string in the former and a
    // string table index in the latter.
    const geckoMarker = marker as any as GeckoMarkerTuple;
    geckoMarker[schema.name] = stringId;
    if (geckoMarker[schema.startTime] && geckoProfile.meta.profilingStartTime) {
      geckoMarker[schema.startTime]! += geckoProfile.meta.profilingStartTime;
    }
    if (geckoMarker[schema.endTime] && geckoProfile.meta.profilingStartTime) {
      geckoMarker[schema.endTime]! += geckoProfile.meta.profilingStartTime;
    }
    geckoMarker[schema.category] =
      categoryMap.get(geckoMarker[schema.category]) || 0;

    mainThread.markers.data.push(geckoMarker);
  }
}

export function insertExternalPowerCountersIntoProfile(
  counters: GeckoCounter[],
  geckoProfile: GeckoProfile
): void {
  for (const counter of counters) {
    const { samples } = counter;
    const timeColumnIndex = samples.schema.time;
    for (const sample of samples.data) {
      // Adjust the sample times to be relative to meta.startTime,
      // and limit the precision to nanoseconds
      sample[timeColumnIndex] =
        Math.round(
          (sample[timeColumnIndex] +
            (geckoProfile.meta.profilingStartTime ?? 0)) *
            1e6
        ) / 1e6;
    }
    if (!geckoProfile.counters) {
      geckoProfile.counters = [];
    }
    geckoProfile.counters.push(counter);
  }
}

/**
 * Convert an unknown profile from either the Gecko format or the DevTools format
 * into the processed format. Throws if there is an error.
 */
export function processGeckoOrDevToolsProfile(json: unknown): Profile {
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
    'profile' in json && json.profile ? json.profile : json
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

  const threads: RawThread[] = [];

  const markerSchema = processMarkerSchema(geckoProfile);
  const stringIndexMarkerFieldsByDataType =
    computeStringIndexMarkerFieldsByDataType(markerSchema);

  const extensions: ExtensionTable = geckoProfile.meta.extensions
    ? _toStructOfArrays(geckoProfile.meta.extensions)
    : getEmptyExtensions();

  const globalDataCollector = new GlobalDataCollector();

  for (const thread of geckoProfile.threads) {
    threads.push(
      _processThread(
        thread,
        geckoProfile,
        extensions,
        stringIndexMarkerFieldsByDataType,
        globalDataCollector
      )
    );
  }
  const counters: RawCounter[] = _processCounters(geckoProfile, threads, 0);
  const nullableProfilerOverhead: Array<ProfilerOverhead | null> = [
    _processProfilerOverhead(geckoProfile, threads, 0),
  ];

  for (const subprocessProfile of geckoProfile.processes) {
    const adjustTimestampsBy =
      subprocessProfile.meta.startTime - geckoProfile.meta.startTime;
    for (const thread of subprocessProfile.threads) {
      const newThread: RawThread = _processThread(
        thread,
        subprocessProfile,
        extensions,
        stringIndexMarkerFieldsByDataType,
        globalDataCollector
      );
      newThread.samples = adjustTableTimeDeltas(
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
      threads.push(newThread);
    }

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

  const meta: ProfileMeta = {
    interval: geckoProfile.meta.interval,
    startTime: geckoProfile.meta.startTime,
    startTimeAsClockMonotonicNanosecondsSinceBoot:
      geckoProfile.meta.startTimeAsClockMonotonicNanosecondsSinceBoot,
    startTimeAsMachAbsoluteTimeNanoseconds:
      geckoProfile.meta.startTimeAsMachAbsoluteTimeNanoseconds,
    startTimeAsQueryPerformanceCounterValue:
      geckoProfile.meta.startTimeAsQueryPerformanceCounterValue,
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
    CPUName: geckoProfile.meta.CPUName,
    // `presymbolicated` indicates whether this gecko profile includes already
    // symbolicated frames. This will be missing for profiles coming from Gecko
    // but may be specified for profiles imported from other formats (eg: linux
    // perf). If it's present and true, then we indicate that the process is
    // already symbolicated, otherwise we indicate it needs to be symbolicated.
    symbolicated: !!geckoProfile.meta.presymbolicated,
    updateChannel: geckoProfile.meta.updateChannel,
    markerSchema,
    sampleUnits: geckoProfile.meta.sampleUnits,
    device: geckoProfile.meta.device,
  };

  if (geckoProfile.meta.profilingStartTime !== undefined) {
    meta.profilingStartTime = geckoProfile.meta.profilingStartTime;
    meta.profilingEndTime = geckoProfile.meta.profilingEndTime;
  }

  const profilerOverhead = nullableProfilerOverhead.reduce<ProfilerOverhead[]>(
    (acc, overhead) => {
      if (overhead !== null) {
        acc.push(overhead);
      }
      return acc;
    },
    []
  );

  // Profiling log is not present by default. But it may be present if backend
  // has recorded it.
  let profilingLog = { ...(geckoProfile.profilingLog || {}) };

  for (const subprocessProfile of geckoProfile.processes) {
    profilingLog = {
      ...profilingLog,
      ...(subprocessProfile.profilingLog || {}),
    };
  }

  // Only parent process has this log, therefore we don't need to check the
  // sub-processes.
  const profileGatheringLog = { ...(geckoProfile.profileGatheringLog || {}) };

  const stringTable = globalDataCollector.getStringTable();

  // Convert JS tracer information into their own threads. This mutates
  // the threads array.
  for (const thread of threads.slice()) {
    const { jsTracer } = thread;
    if (jsTracer) {
      const friendlyThreadName = getFriendlyThreadName(threads, thread);
      const jsTracerThread = convertJsTracerToThread(
        thread,
        jsTracer,
        geckoProfile.meta.categories,
        stringTable
      );
      jsTracerThread.isJsTracer = true;
      jsTracerThread.name = `JS Tracer of ${friendlyThreadName}`;
      threads.push(jsTracerThread);

      // Delete the reference to the original jsTracer data, but keep it on this thread.
      delete thread.jsTracer;
    }
  }

  if (meta.visualMetrics) {
    // Process the visual metrics to add markers for them.
    processVisualMetrics(threads, meta, pages, stringTable);
  }

  const { libs, shared } = globalDataCollector.finish();

  const result = {
    meta,
    libs,
    pages,
    counters,
    profilerOverhead,
    shared,
    threads,
    profilingLog,
    profileGatheringLog,
  };
  return result;
}

/**
 * Take a processed profile and convert it to a string.
 */
export function serializeProfile(profile: Profile): string {
  return JSON.stringify(profile);
}

// If applicable, this function will try to "fix" a processed profile that was
// copied from the console on an old version of the UI, where such a profile
// would have a `stringTable` property rather than a `stringArray` property on
// each thread.
function attemptToFixProcessedProfileThroughMutation(
  profile: unknown
): unknown | null {
  if (!profile || typeof profile !== 'object') {
    return profile;
  }
  if (
    !('meta' in profile) ||
    !profile.meta ||
    typeof profile.meta !== 'object'
  ) {
    return profile;
  }
  const { meta } = profile;

  if (
    !('preprocessedProfileVersion' in meta) ||
    typeof meta.preprocessedProfileVersion !== 'number'
  ) {
    return profile;
  }

  if (
    !('threads' in profile) ||
    !profile.threads ||
    !Array.isArray(profile.threads) ||
    !profile.threads.length
  ) {
    // This profile doesn't look well-formed or is empty, let's return it
    // directly and let the following functions deal with it.
    return profile;
  }

  const { threads } = profile;
  const [firstThread] = threads;
  if (firstThread.stringArray) {
    // This looks good, nothing to fix!
    return profile;
  }

  if (!firstThread.stringTable) {
    // The profile didn't have a stringArray, but it doesn't seem to have a
    // stringTable either. Let's be cautious and just return the profile input.
    return profile;
  }

  // We mutate the profile directly, to avoid GC churn at load time.
  for (const thread of profile.threads) {
    thread.stringArray = thread.stringTable._array;
    delete thread.stringTable;
  }
  return profile;
}

/**
 * Take some arbitrary profile file from some data source, and turn it into
 * the processed profile format.
 * The profile can be in the form of an array buffer or of a string or of a JSON
 * object, .
 * The following profile formats are supported for the various input types:
 *  - Processed profile: input can be ArrayBuffer or string or JSON object
 *  - Gecko profile: input can be ArrayBuffer or string or JSON object
 *  - Devtools profile: input can be ArrayBuffer or string or JSON object
 *  - Chrome profile: input can be ArrayBuffer or string or JSON object
 *  - `perf script` profile: input can be ArrayBuffer or string
 *  - ART trace: input must be ArrayBuffer
 */
export async function unserializeProfileOfArbitraryFormat(
  arbitraryFormat: unknown,
  profileUrl?: string
): Promise<Profile> {
  try {
    // We used to use `instanceof ArrayBuffer`, but this doesn't work when the
    // object is constructed from an ArrayBuffer in a different context... which
    // happens in our tests.
    if (String(arbitraryFormat) === '[object ArrayBuffer]') {
      // Obviously Flow doesn't understand that this is correct, so let's help
      // Flow here.
      let arrayBuffer: ArrayBufferLike = arbitraryFormat as any;

      // Check for the gzip magic number in the header. If we find it, decompress
      // the data first.
      const profileBytes = new Uint8Array(arrayBuffer);
      if (isGzip(profileBytes)) {
        const decompressedProfile = await decompress(profileBytes);
        arrayBuffer = decompressedProfile.buffer;
      }

      if (isArtTraceFormat(arrayBuffer)) {
        arbitraryFormat = convertArtTraceProfile(arrayBuffer);
      } else if (verifyMagic(SIMPLEPERF_MAGIC, arrayBuffer)) {
        const { convertSimpleperfTraceProfile } = await import(
          './import/simpleperf'
        );
        arbitraryFormat = convertSimpleperfTraceProfile(arrayBuffer);
      } else {
        try {
          const textDecoder = new TextDecoder();
          arbitraryFormat = await textDecoder.decode(arrayBuffer);
        } catch (e) {
          console.error('Source exception:', e);
          throw new Error(
            'The profile array buffer could not be parsed as a UTF-8 string.'
          );
        }
      }
    }

    if (typeof arbitraryFormat === 'string') {
      // The profile could be JSON or the output from `perf script`. Try `perf script` first.
      if (isPerfScriptFormat(arbitraryFormat)) {
        arbitraryFormat = convertPerfScriptProfile(arbitraryFormat);
      } else {
        // Try parsing as JSON.
        arbitraryFormat = JSON.parse(arbitraryFormat);
      }
    }

    // At this point, we expect arbitraryFormat to contain a JSON object of some profile format.
    const json = arbitraryFormat;

    const possiblyFixedProfile =
      attemptToFixProcessedProfileThroughMutation(json);
    const processedProfile =
      attemptToUpgradeProcessedProfileThroughMutation(possiblyFixedProfile);
    if (processedProfile) {
      return processedProfile;
    }

    const processedChromeProfile = attemptToConvertChromeProfile(
      json,
      profileUrl
    );
    if (processedChromeProfile) {
      return processedChromeProfile;
    }

    const processedDhat = attemptToConvertDhat(json);
    if (processedDhat) {
      return processedDhat;
    }

    // Else: Treat it as a Gecko profile and just attempt to process it.
    return processGeckoOrDevToolsProfile(json);
  } catch (e) {
    console.error('UnserializationError:', e);
    throw new Error(`Unserializing the profile failed: ${e}`);
  }
}

/**
 * Processes the visual metrics data if the profile has it and adds some markers
 * to the parent process and tab process main threads to show the visual progress.
 * Mutates the markers inside parent process and tab process main threads.
 */
export function processVisualMetrics(
  threads: RawThread[],
  meta: ProfileMeta,
  pages: PageList,
  stringTable: StringTable
) {
  const { visualMetrics } = meta;
  if (pages.length === 0 || !visualMetrics) {
    // No pages or visualMetrics were found in the profile. Skip this step.
    return;
  }

  // Find the parent process and the tab process main threads.
  const mainThreadIdx = threads.findIndex(
    (thread) => thread.name === 'GeckoMain' && thread.processType === 'default'
  );
  const tabThreadIdx = findTabMainThreadForVisualMetrics(
    threads,
    pages,
    stringTable
  );

  if (mainThreadIdx === -1 || !tabThreadIdx) {
    // Failed to find the parent process or tab process main threads. Return early.
    return;
  }
  const mainThread = threads[mainThreadIdx];
  const tabThread = threads[tabThreadIdx];

  // These metrics are currently present inside profile.meta.visualMetrics.
  const metrics: Array<
    'Visual' | 'ContentfulSpeedIndex' | 'PerceptualSpeedIndex'
  > = ['Visual', 'ContentfulSpeedIndex', 'PerceptualSpeedIndex'];
  // Find the Test category so we can add the visual metrics markers with it.
  if (meta.categories === undefined) {
    // Making Flow happy. This means that this is a very old profile.
    return;
  }
  const testingCategoryIdx = meta.categories.findIndex(
    (cat) => cat.name === 'Test'
  );

  function maybeAddMetricMarker(
    thread: RawThread,
    name: string,
    phase: MarkerPhase,
    startTime: number | null,
    endTime: number | null,
    payload?: BrowsertimeMarkerPayload
  ) {
    if (
      // All phases except INTERVAL_END should have a start time.
      (phase !== INTERVAL_END && startTime === null) ||
      // Only INTERVAL and INTERVAL_END should have an end time.
      ((phase === INTERVAL || phase === INTERVAL_END) && endTime === null)
    ) {
      // Do not add if some timestamps we expect are missing.
      // This should ideally never happen but timestamps could be null due to
      // browsertime bug here: https://github.com/sitespeedio/browsertime/issues/1746.
      return;
    }
    // Add the marker to the given thread.
    thread.markers.name.push(stringTable.indexForString(name));
    thread.markers.startTime.push(startTime);
    thread.markers.endTime.push(endTime);
    thread.markers.phase.push(phase);
    thread.markers.category.push(testingCategoryIdx);
    thread.markers.data.push(payload ?? null);
    thread.markers.length++;
  }

  // Find the navigation start time in the tab thread for specifying the marker
  // start times.
  let navigationStartTime = null;
  if (stringTable.hasString('Navigation::Start')) {
    const navigationStartStrIdx =
      stringTable.indexForString('Navigation::Start');
    const navigationStartMarkerIdx = tabThread.markers.name.findIndex(
      (m) => m === navigationStartStrIdx
    );
    if (navigationStartMarkerIdx !== -1) {
      navigationStartTime =
        tabThread.markers.startTime[navigationStartMarkerIdx];
    }
  }

  // Add the visual metrics markers to the parent process and tab process main threads.
  for (const metricName of metrics) {
    const metric = visualMetrics[`${metricName}Progress`];
    if (!metric) {
      // Skip it if we don't have this metric.
      continue;
    }

    const startTime = navigationStartTime ?? metric[0].timestamp;
    const endTime = metric[metric.length - 1].timestamp;

    // Add the progress marker to the parent process main thread.
    const markerName = `${metricName} Progress`;
    maybeAddMetricMarker(mainThread, markerName, INTERVAL, startTime, endTime);
    // Add the progress marker to the tab process main thread.
    maybeAddMetricMarker(tabThread, markerName, INTERVAL, startTime, endTime);

    // Add progress markers for every visual progress change for more fine grained information.
    const progressMarkerSchema: MarkerSchema = {
      name: 'VisualMetricProgress',
      tableLabel: '{marker.name} — {marker.data.percentage}',
      display: ['marker-chart', 'marker-table'],
      fields: [
        { key: 'percentage', label: 'Percentage', format: 'percentage' },
      ],
    };
    meta.markerSchema.push(progressMarkerSchema);

    const changeMarkerName = `${metricName} Change`;
    for (const { timestamp, percent } of metric) {
      const payload = {
        type: 'VisualMetricProgress' as const,
        // 'percentage' type expects a value between 0 and 1.
        percentage: percent / 100,
      };

      // Add it to the parent process main thread.
      maybeAddMetricMarker(
        mainThread,
        changeMarkerName,
        INSTANT,
        timestamp,
        null, // endTime
        payload
      );
      // Add it to the tab process main thread.
      maybeAddMetricMarker(
        tabThread,
        changeMarkerName,
        INSTANT,
        timestamp,
        null, // endTime
        payload
      );
    }
  }
}

/**
 * This function finds the main thread of the tab that is responsible of the visual metrics.
 * It finds the tab main thread by looking at the RefreshDriverTick markers.
 * These markers have innerWindowID fields inside their payloads that indicate
 * which window they are coming from. If they are coming from a window with
 * embedderInnerWindowID == 0, then it means that this is the top level window.
 * We find the first tab main thread with this marker and return it.
 *
 * DO NOT use it for any other purpose than visual metrics as it's not going to be accurate.
 */
function findTabMainThreadForVisualMetrics(
  threads: RawThread[],
  pages: PageList,
  stringTable: StringTable
): ThreadIndex | null {
  if (!stringTable.hasString('RefreshDriverTick')) {
    // No RefreshDriver tick marker.
    return null;
  }

  const refreshDriverTickStrIndex =
    stringTable.indexForString('RefreshDriverTick');

  for (let threadIdx = 0; threadIdx < threads.length; threadIdx++) {
    const thread = threads[threadIdx];

    if (thread.name !== 'GeckoMain' || thread.processType !== 'tab') {
      // It isn't a tab process main thread, skip it.
      continue;
    }

    // Find the top level pages that are not an iframe.
    // We could map `embedderInnerWindowID` to also find the main page here but
    // we don't really need to do that since all browsertime profiles most likely
    // to include refresh driver ticks in their tab process thread.
    const topLevelPagesSet = new Set(
      pages
        .filter((page) => page.embedderInnerWindowID === 0)
        .map((page) => page.innerWindowID)
    );

    const { markers } = thread;
    for (let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
      if (markers.name[markerIndex] === refreshDriverTickStrIndex) {
        const data = markers.data[markerIndex];
        if (
          data &&
          'innerWindowID' in data &&
          data.innerWindowID &&
          topLevelPagesSet.has(data.innerWindowID)
        ) {
          // Found a RefreshDriverTick marker that is coming from a top level page.
          // This is the tab process main thread we are looking for.
          return threadIdx;
        }
      }
    }
  }

  return null;
}
