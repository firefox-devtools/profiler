/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  isJsonSlabsFile,
  decode as decodeJsonSlabs,
  encode as encodeJsonSlabs,
} from 'json-slabs';

import { attemptToConvertChromeProfile } from './import/chrome';
import { attemptToConvertDhat } from './import/dhat';
import { GlobalDataCollector } from './global-data-collector';
import { AddressLocator } from './address-locator';
import {
  finishRawBalancedNativeAllocationsTableBuilder,
  finishRawJsAllocationsTableBuilder,
  finishRawUnbalancedNativeAllocationsTableBuilder,
  getEmptyExtensions,
  getEmptyRawMarkerTable,
  getEmptyRawJsAllocationsTable,
  getEmptyRawUnbalancedNativeAllocationsTable,
  type RawFrameTableBuilder,
  type RawStackTableBuilder,
} from './data-structures';
import { immutableUpdate, ensureExists } from '../utils/types';
import { verifyMagic, SIMPLEPERF as SIMPLEPERF_MAGIC } from '../utils/magic';
import { attemptToUpgradeProcessedProfileThroughMutation } from './processed-profile-versioning';
import type { ProfileUpgradeInfo } from './processed-profile-versioning';
import { upgradeGeckoProfileToCurrentVersion } from './gecko-profile-versioning';
import { ProfileVersionError } from './errors';
import {
  isPerfScriptFormat,
  convertPerfScriptProfile,
} from './import/linux-perf';
import {
  isFlameGraphFormat,
  convertFlameGraphProfile,
} from './import/flame-graph';
import { isArtTraceFormat, convertArtTraceProfile } from './import/art-trace';
import {
  PROCESSED_PROFILE_VERSION,
  INTERVAL,
  INTERVAL_END,
  INSTANT,
} from '../app-logic/constants';
import {
  getFriendlyThreadName,
  nudgeReturnAddresses,
} from '../profile-logic/profile-data';
import {
  toInt32Array,
  toUint8Array,
  toFloat64Array,
} from '../utils/typed-arrays';
import { computeStringIndexMarkerFieldsByDataType } from '../profile-logic/marker-schema';
import { convertJsTracerToThread } from '../profile-logic/js-tracer';

import type { StringTable } from '../utils/string-table';
import type {
  Profile,
  RawThread,
  RawCounter,
  ExtensionTable,
  RawCounterSamplesTable,
  RawSamplesTable,
  RawMarkerTable,
  LibMapping,
  IndexIntoStackTable,
  IndexIntoFuncTable,
  IndexIntoStringTable,
  JsTracerTable,
  RawJsAllocationsTable,
  ProfilerOverhead,
  RawNativeAllocationsTable,
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
  GeckoMarkerStack,
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
  GeckoSourceTable,
  IndexIntoCategoryList,
  IndexIntoFrameTable,
  CounterDisplayConfig,
  RawProfileSharedData,
} from 'firefox-profiler/types';
import { decompress, isGzip } from 'firefox-profiler/utils/gz';
import { jsonEncodeObjectWithTypedArraysAsRegularArrays } from 'firefox-profiler/utils/json-with-typed-arrays';

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

type ExtractionInfo = {
  geckoThreadStringArray: string[];
  addressLocator: AddressLocator;
  stringToNewFuncIndexAndFrameAddress: Map<
    string,
    { funcIndex: IndexIntoFuncTable; frameAddress: Address | null }
  >;
  globalDataCollector: GlobalDataCollector;
  geckoSourceTable: GeckoSourceTable;
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
  globalDataCollector: GlobalDataCollector,
  geckoSourceTable: GeckoSourceTable
): {
  frameFuncs: IndexIntoFuncTable[];
  frameAddresses: (Address | null)[];
} {
  const stringTable = globalDataCollector.getStringTable();

  // Bundle all of the variables up into an object to pass them around to functions.
  const extractionInfo: ExtractionInfo = {
    geckoThreadStringArray,
    addressLocator: new AddressLocator(libs),
    stringToNewFuncIndexAndFrameAddress: new Map(),
    globalDataCollector,
    geckoSourceTable,
  };

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
            globalDataCollector,
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
 * "resource": The function points to the resource (of type ResourceType.Library), and the
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
  const { addressLocator, globalDataCollector } = extractionInfo;

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

      const libIndex = globalDataCollector.indexForLib(lib);
      resourceIndex = globalDataCollector.indexForLibResource(libIndex);
    }
  } catch (_e) {
    // Probably a hex parse error. Ignore.
  }

  const funcIndex = globalDataCollector.indexForFunc(
    locationIndex,
    false,
    false,
    resourceIndex,
    null,
    null,
    null
  );
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
  const { stringToNewFuncIndexAndFrameAddress, globalDataCollector } =
    extractionInfo;
  const stringTable = globalDataCollector.getStringTable();

  const [, funcNameRaw, libraryNameString] = cppMatch;
  const funcName = _cleanFunctionName(funcNameRaw);
  const funcNameIndex = stringTable.indexForString(funcName);
  const libraryNameStringIndex = stringTable.indexForString(libraryNameString);
  const frameInfo = stringToNewFuncIndexAndFrameAddress.get(funcName);
  if (frameInfo !== undefined) {
    // Use the existing function.
    return frameInfo.funcIndex;
  }

  const resourceIndex = globalDataCollector.indexForNameOnlyLibResource(
    libraryNameStringIndex
  );
  return globalDataCollector.indexForFunc(
    funcNameIndex,
    false,
    false,
    resourceIndex,
    null,
    null,
    null
  );
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
    // Given:   "functionName (http://script.url/:1234:1234)" or "functionName (:1234:1234)[5]"
    // Captures: 1^^^^^^^^^^  2^^^^^^^^^^^^^^^^^^ 3^^^ 4^^^ 5^^^
    /^(.*) \((.+?):([0-9]+)(?::([0-9]+))?\)(?:\[(\d+)\])?$/.exec(
      locationString
    ) ||
    // Given:   "http://script.url/:1234:1234" or "(:1234:1234)[5]"
    // Captures: 2^^^^^^^^^^^^^^^^^ 3^^^ 4^^^ 5^^^
    /^()(.+?):([0-9]+)(?::([0-9]+))?(?:\[(\d+)\])?$/.exec(locationString);

  if (!jsMatch) {
    return null;
  }

  const { globalDataCollector, geckoSourceTable } = extractionInfo;

  // Case 4: JS function - A match was found in the location string in the format
  // of a JS function.
  const [, funcName, rawScriptURI, lineNoStr, columnNoStr, sourceIndex] =
    jsMatch;
  const scriptURI = _getRealScriptURI(rawScriptURI);

  const resourceIndex = globalDataCollector.indexForURIResource(scriptURI);

  // Process the source index if it's provided.
  let processedSourceIndex = null;
  if (sourceIndex !== undefined) {
    const geckoSourceIdx = parseInt(sourceIndex, 10);
    // Look up the ID for this source index from the process's sources table.
    if (geckoSourceIdx < geckoSourceTable.data.length) {
      const idIndex = geckoSourceTable.schema.id;
      const filenameIndex = geckoSourceTable.schema.filename;
      const startLineIndex = geckoSourceTable.schema.startLine;
      const startColumnIndex = geckoSourceTable.schema.startColumn;
      const sourceMapURLIndex = geckoSourceTable.schema.sourceMapURL;
      const id = geckoSourceTable.data[geckoSourceIdx][idIndex];
      const filename = geckoSourceTable.data[geckoSourceIdx][filenameIndex];
      const startLine = geckoSourceTable.data[geckoSourceIdx][startLineIndex];
      const startColumn =
        geckoSourceTable.data[geckoSourceIdx][startColumnIndex];
      const sourceMapURL =
        geckoSourceTable.data[geckoSourceIdx][sourceMapURLIndex];
      processedSourceIndex = globalDataCollector.indexForSource(
        id,
        filename,
        startLine,
        startColumn,
        sourceMapURL
      );
    }
  }

  // If we don't have a source index from the sources table, create one using null uuid.
  if (processedSourceIndex === null) {
    processedSourceIndex = globalDataCollector.indexForSource(null, scriptURI);
  }

  const stringTable = globalDataCollector.getStringTable();

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
  const lineNumber = parseInt(lineNoStr, 10);
  const columnNumber = columnNoStr ? parseInt(columnNoStr, 10) : null;

  return globalDataCollector.indexForFunc(
    funcNameIndex,
    true,
    false,
    resourceIndex,
    processedSourceIndex,
    lineNumber,
    columnNumber
  );
}

/**
 * Nothing is known about this function. Add it without any resource information.
 */
function _extractUnknownFunctionType(
  globalDataCollector: GlobalDataCollector,
  locationIndex: IndexIntoStringTable,
  relevantForJS: boolean
): IndexIntoFuncTable {
  return globalDataCollector.indexForFunc(
    locationIndex,
    false,
    relevantForJS,
    -1,
    null,
    null,
    null
  );
}

/**
 * Copies the information from the per-thread Gecko frame table into the
 * global frame table in the processed format.
 */
function _processFrameTable(
  geckoFrameStruct: GeckoFrameStruct,
  sharedFrameTable: RawFrameTableBuilder,
  frameFuncs: IndexIntoFuncTable[],
  frameAddresses: (Address | null)[]
): IndexIntoFrameTable {
  const frameIndexOffset = sharedFrameTable.length;
  for (let i = 0; i < geckoFrameStruct.length; i++) {
    const newIndex = i + frameIndexOffset;
    sharedFrameTable.address[newIndex] = frameAddresses[i] ?? -1;
    sharedFrameTable.inlineDepth[newIndex] = 0;
    sharedFrameTable.category[newIndex] = geckoFrameStruct.category[i];
    sharedFrameTable.subcategory[newIndex] = geckoFrameStruct.subcategory[i];
    sharedFrameTable.func[newIndex] = frameFuncs[i];
    sharedFrameTable.nativeSymbol[newIndex] = null;
    sharedFrameTable.innerWindowID[newIndex] =
      geckoFrameStruct.innerWindowID[i];
    sharedFrameTable.line[newIndex] = geckoFrameStruct.line[i];
    sharedFrameTable.column[newIndex] = geckoFrameStruct.column[i];
    sharedFrameTable.originalLocation[newIndex] = null;
  }
  sharedFrameTable.length += geckoFrameStruct.length;
  return frameIndexOffset;
}

/**
 * Copies the information from the per-thread Gecko stack table into the
 * global stack table in the processed format.
 */
function _processStackTable(
  geckoStackTable: GeckoStackStruct,
  sharedStackTable: RawStackTableBuilder,
  frameIndexOffset: IndexIntoFrameTable
): IndexIntoStackTable {
  const stackIndexOffset = sharedStackTable.length;
  for (let i = 0; i < geckoStackTable.length; i++) {
    const newIndex = i + stackIndexOffset;
    const oldPrefix = geckoStackTable.prefix[i];
    sharedStackTable.prefix[newIndex] =
      oldPrefix !== null ? oldPrefix + stackIndexOffset : null;
    sharedStackTable.frame[newIndex] =
      geckoStackTable.frame[i] + frameIndexOffset;
  }
  sharedStackTable.length += geckoStackTable.length;
  return stackIndexOffset;
}

/**
 * We expect a captured backtrace here, with a samples table. But the "stack" key
 * isn't reserved for that: some markers store an unrelated value (e.g. Log markers
 * from the test harness put a textual stack trace string there). Such a value has
 * no `samples`, so checking for it both selects real backtraces and keeps one bad
 * marker from failing the whole profile. A non-backtrace stack is left in place to
 * be handled by the marker schema like any other field.
 */
function _payloadHasStack(
  data: MarkerPayload_Gecko
): data is MarkerPayload_Gecko & { stack: GeckoMarkerStack } {
  return 'stack' in data && !!data.stack?.samples?.data.length;
}

/**
 * Convert stack field to cause field for the given payload. A cause field includes
 * the thread ID (tid), an IndexIntoStackTable, and the time the stack was captured.
 * If the stack was captured within the start and end time of the marker, this was a
 * synchronous stack. Otherwise, if it happened before, it was an async stack, and is
 * most likely some event that happened in the past that triggered the marker.
 */
function _convertStackToCause(
  data: MarkerPayload_Gecko,
  stackIndexOffset: IndexIntoStackTable
) {
  if (_payloadHasStack(data)) {
    const { stack, ...newData } = data;
    const stackIndex = stack.samples.data[0][stack.samples.schema.stack];
    const time = stack.samples.data[0][stack.samples.schema.time];
    if (stackIndex !== null) {
      return {
        ...newData,
        cause: { tid: stack.tid, time, stack: stackIndex + stackIndexOffset },
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
  data: MarkerPayload_Gecko | null,
  stackIndexOffset: IndexIntoStackTable
): IndexIntoStackTable | null {
  if (!data) {
    return null;
  }
  if (_payloadHasStack(data)) {
    const { samples } = data.stack;
    const geckoStackIndex = samples.data[0][samples.schema.stack];
    if (geckoStackIndex !== null) {
      return geckoStackIndex + stackIndexOffset;
    }
  }
  return null;
}

/**
 * Process the markers.
 *  Convert stacks to causes.
 *  Process GC markers.
 *  Extract JS allocations into the RawJsAllocationsTable.
 *  Extract Native allocations into the RawNativeAllocationsTable.
 */
function _processMarkers(
  geckoMarkers: GeckoMarkerStruct,
  stringArray: string[],
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  globalDataCollector: GlobalDataCollector,
  stackIndexOffset: IndexIntoStackTable
): {
  markers: RawMarkerTable;
  jsAllocations: RawJsAllocationsTable | null;
  nativeAllocations: RawNativeAllocationsTable | null;
} {
  const markers = getEmptyRawMarkerTable();
  const jsAllocations = getEmptyRawJsAllocationsTable();
  const inProgressNativeAllocations =
    getEmptyRawUnbalancedNativeAllocationsTable();
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
          jsAllocations.stack.push(
            _convertPayloadStackToIndex(geckoPayload, stackIndexOffset)
          );
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
            _convertPayloadStackToIndex(geckoPayload, stackIndexOffset)
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
      stringIndexMarkerFieldsByDataType,
      stackIndexOffset
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
    nativeAllocations = finishRawBalancedNativeAllocationsTableBuilder({
      ...inProgressNativeAllocations,
      memoryAddress,
      threadId,
    });
  } else {
    // There is the older native allocations, without memory addresses.
    nativeAllocations = finishRawUnbalancedNativeAllocationsTableBuilder(
      inProgressNativeAllocations
    );
  }

  return {
    markers: markers,
    jsAllocations:
      jsAllocations.length === 0
        ? null
        : finishRawJsAllocationsTableBuilder(jsAllocations),
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
  stringIndexMarkerFieldsByDataType: Map<string, string[]>,
  stackIndexOffset: IndexIntoStackTable
): MarkerPayload | null {
  if (!geckoPayload) {
    return null;
  }

  // If there is a "stack" field, convert it to a "cause" field. This is
  // pre-emptively done for every single marker payload.
  //
  // Warning: This function converts the payload into an any type.
  const payload = _convertStackToCause(geckoPayload, stackIndexOffset);

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
function _processSamples(
  geckoSamples: GeckoSampleStruct,
  stackIndexOffset: IndexIntoStackTable
): RawSamplesTable {
  const samples: RawSamplesTable = {
    stack: geckoSamples.stack.map((stackIndex) =>
      stackIndex !== null ? stackIndex + stackIndexOffset : null
    ),
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

  if ('argumentValues' in geckoSamples) {
    samples.argumentValues = geckoSamples.argumentValues;
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
 * Derive a CounterDisplayConfig from a counter's category and name.
 */
export function deriveCounterDisplay(
  category: string,
  name: string
): CounterDisplayConfig {
  if (category === 'Bandwidth') {
    return {
      graphType: 'line-rate',
      unit: 'bytes',
      color: 'blue',
      markerSchemaLocation: null,
      sortWeight: 10,
      label: 'Bandwidth',
      tooltipRows: [
        {
          type: 'value',
          source: 'rate',
          format: { unit: 'bytes-per-second', co2: 'per-byte' },
          label: 'Transfer speed for this sample',
          labelKey: 'bandwidth-speed',
        },
        {
          type: 'value',
          source: 'sample-number',
          format: { unit: 'number' },
          label: 'read/write operations since the previous sample',
          labelKey: 'bandwidth-operations',
        },
        { type: 'separator' },
        {
          type: 'value',
          source: 'accumulated',
          format: { unit: 'bytes', co2: 'per-byte' },
          label: 'Data transferred up to this time',
          labelKey: 'bandwidth-cumulative',
        },
        {
          type: 'value',
          source: 'count-range',
          format: { unit: 'bytes', co2: 'per-byte' },
          label: 'Data transferred in the visible range',
          labelKey: 'bandwidth-total-graph',
        },
        {
          type: 'value',
          source: 'selection-total',
          format: { unit: 'bytes', co2: 'per-byte' },
          label: 'Data transferred in the current selection',
          labelKey: 'bandwidth-total-selection',
          requiresPreviewSelection: true,
        },
      ],
    };
  } else if (category === 'Memory') {
    return {
      graphType: 'line-accumulated',
      unit: 'bytes',
      color: 'orange',
      markerSchemaLocation: 'timeline-memory',
      sortWeight: 20,
      label: 'Memory',
      tooltipRows: [
        {
          type: 'value',
          source: 'accumulated',
          format: { unit: 'bytes' },
          label: 'relative memory at this time',
          labelKey: 'memory-relative',
        },
        {
          type: 'value',
          source: 'count-range',
          format: { unit: 'bytes' },
          label: 'memory range in graph',
          labelKey: 'memory-range',
        },
        {
          type: 'value',
          source: 'sample-number',
          format: { unit: 'number' },
          label: 'allocations and deallocations since the previous sample',
          labelKey: 'memory-operations',
        },
      ],
    };
  } else if (category === 'power') {
    return {
      graphType: 'line-rate',
      unit: 'pWh',
      color: 'grey',
      markerSchemaLocation: null,
      sortWeight: 30,
      label: name,
      tooltipRows: [
        {
          type: 'value',
          source: 'count',
          format: { unit: 'number', co2: 'per-watthour', scale: 'power' },
          label: 'Power',
          labelKey: 'power',
        },
        {
          type: 'value',
          source: 'selection-total',
          format: { unit: 'number', co2: 'per-watthour', scale: 'energy' },
          label: 'Energy used in the current selection',
          labelKey: 'power-energy-preview',
          requiresPreviewSelection: true,
        },
        {
          type: 'value',
          source: 'selection-rate',
          format: { unit: 'number', co2: 'per-watthour', scale: 'power' },
          label: 'Average power in the current selection',
          labelKey: 'power-average-preview',
          requiresPreviewSelection: true,
        },
        {
          type: 'value',
          source: 'committed-range-total',
          format: { unit: 'number', co2: 'per-watthour', scale: 'energy' },
          label: 'Energy used in the visible range',
          labelKey: 'power-energy-range',
        },
      ],
    };
  } else if (category === 'CPU' && name === 'processCPU') {
    return {
      graphType: 'line-rate',
      unit: 'percent',
      color: 'grey',
      markerSchemaLocation: null,
      sortWeight: 40,
      label: 'Process CPU',
      tooltipRows: [
        {
          type: 'value',
          source: 'cpu-ratio',
          format: { unit: 'percent' },
          label: 'CPU',
          labelKey: 'cpu',
        },
      ],
    };
  }

  return {
    graphType: 'line-rate',
    unit: '',
    color: 'grey',
    markerSchemaLocation: null,
    sortWeight: 50,
    label: name,
    tooltipRows: [
      {
        type: 'value',
        source: 'count',
        format: { unit: 'number' },
        label: name,
      },
    ],
  };
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
        display: deriveCounterDisplay(category, name),
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

  const { libs, pausedRanges, meta, sources } = processProfile;
  const { shutdownTime } = meta;

  const { frameFuncs, frameAddresses } =
    extractFuncsAndResourcesFromFrameLocations(
      geckoFrameStruct.location,
      geckoFrameStruct.relevantForJS,
      thread.stringTable,
      libs,
      globalDataCollector,
      sources
    );

  const frameIndexOffset = _processFrameTable(
    geckoFrameStruct,
    globalDataCollector.getFrameTable(),
    frameFuncs,
    frameAddresses
  );
  const stackIndexOffset = _processStackTable(
    geckoStackTable,
    globalDataCollector.getStackTableBuilder(),
    frameIndexOffset
  );

  const { markers, jsAllocations, nativeAllocations } = _processMarkers(
    geckoMarkers,
    thread.stringTable,
    stringIndexMarkerFieldsByDataType,
    globalDataCollector,
    stackIndexOffset
  );
  const samples = _processSamples(geckoSamples, stackIndexOffset);

  // Compute usedInnerWindowIDs from the geckoFrameStruct and the thread markers.
  let usedInnerWindowIDs: number[] | undefined;
  const usedInnerWindowIDsSet = new Set<number>();
  for (let i = 0; i < geckoFrameStruct.length; i++) {
    const innerWindowID = geckoFrameStruct.innerWindowID[i];
    if (innerWindowID !== null && innerWindowID !== 0) {
      usedInnerWindowIDsSet.add(innerWindowID);
    }
  }
  for (let i = 0; i < markers.length; i++) {
    const data = markers.data[i];
    if (!data || !('innerWindowID' in data)) {
      continue;
    }
    const innerWindowID = data.innerWindowID;
    if (typeof innerWindowID === 'number' && innerWindowID !== 0) {
      usedInnerWindowIDsSet.add(innerWindowID);
    }
  }
  if (usedInnerWindowIDsSet.size !== 0) {
    usedInnerWindowIDs = Array.from(usedInnerWindowIDsSet);
  }

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

  if (usedInnerWindowIDs !== undefined) {
    newThread.usedInnerWindowIDs = usedInnerWindowIDs;
  }

  if (jsAllocations) {
    // Only add the JS allocations if they exist.
    newThread.jsAllocations = jsAllocations;
  }

  if (nativeAllocations) {
    // Only add the Native allocations if they exist.
    newThread.nativeAllocations = nativeAllocations;
  }

  if (thread.tracedValues) {
    newThread.tracedValuesBuffer = thread.tracedValues;
  }

  if (thread.tracedObjectShapes) {
    newThread.tracedObjectShapes = thread.tracedObjectShapes;
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

  return newThread;
}

/**
 * Adjust the "time" field by the given delta. This is needed when integrating
 * subprocess profiles into the parent process profile; each profile's process
 * has its own timebase, and we don't want to keep converting timestamps when
 * we deal with the integrated profile.
 */
export function adjustTableTimestamps<
  Table extends { time: Milliseconds[] | Float64Array<ArrayBuffer> },
>(table: Table, delta: Milliseconds): Table {
  return {
    ...table,
    time: table.time.map((time) => time + delta),
  };
}

export function adjustTableTimeDeltas<
  Table extends { timeDeltas?: Milliseconds[] | Float64Array<ArrayBuffer> },
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
    colorField,
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
    colorField,
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

  const categoryMap = new Map<IndexIntoCategoryList, IndexIntoCategoryList>();
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
  const geckoProfile =
    'profile' in json && json.profile
      ? (json.profile as GeckoProfile)
      : (json as GeckoProfile);

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

  globalDataCollector.addExtensionOrigins(extensions);

  for (const thread of geckoProfile.threads) {
    threads.push(
      _processThread(
        thread,
        geckoProfile,
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

  const { libs, shared } = globalDataCollector.finish();

  // Convert JS tracer information into their own threads. This mutates
  // the threads array.
  for (const thread of threads.slice()) {
    const { jsTracer } = thread;
    if (jsTracer) {
      const friendlyThreadName = getFriendlyThreadName(threads, thread);
      const jsTracerThread = convertJsTracerToThread(
        thread,
        shared,
        jsTracer,
        geckoProfile.meta.categories
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

  const processedProfileWithReturnAddresses = {
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
  return nudgeReturnAddresses(processedProfileWithReturnAddresses);
}

/**
 * Take a processed profile and convert it to a string.
 */
export function serializeProfileToJsonString(profile: Profile): string {
  return jsonEncodeObjectWithTypedArraysAsRegularArrays(profile);
}

/**
 * Convert all columns of a profile which are eligible to be stored as typed
 * arrays into typed arrays.
 *
 * This is useful if the profile will be saved as a JSLB file:
 * `serializeProfileToJsonSlabsFile` will be able to store these columns as binary
 * slabs instead of as JSON arrays, which speeds up both the saving and the loading
 * of the file.
 *
 * Does not mutate the input profile.
 */
export function optimizeProfileForStorage(profile: Profile): Profile {
  return {
    ...profile,
    shared: convertSharedTablesEligibleColumns(profile.shared),
    threads: profile.threads.map(convertThreadEligibleColumns),
    counters: profile.counters?.map(convertCounterEligibleColumns),
  };
}

function convertSharedTablesEligibleColumns(
  shared: RawProfileSharedData
): RawProfileSharedData {
  const { stackTable, frameTable } = shared;
  return {
    ...shared,
    stackTable: {
      frame: toInt32Array(stackTable.frame),
      prefixOffset: toInt32Array(stackTable.prefixOffset),
      length: stackTable.length,
    },
    frameTable: {
      ...frameTable,
      address: toInt32Array(frameTable.address),
      inlineDepth: toUint8Array(frameTable.inlineDepth),
      func: toInt32Array(frameTable.func),
    },
  };
}

function convertThreadEligibleColumns(thread: RawThread): RawThread {
  const newThread: RawThread = {
    ...thread,
    samples: convertSamplesTimesToTypedArrays(thread.samples),
  };
  if (thread.jsAllocations !== undefined) {
    newThread.jsAllocations = {
      ...thread.jsAllocations,
      time: toFloat64Array(thread.jsAllocations.time),
    };
  }
  if (thread.nativeAllocations !== undefined) {
    newThread.nativeAllocations = {
      ...thread.nativeAllocations,
      time: toFloat64Array(thread.nativeAllocations.time),
    };
  }
  return newThread;
}

function convertSamplesTimesToTypedArrays(
  samples: RawSamplesTable
): RawSamplesTable {
  const result = { ...samples };
  if (samples.time !== undefined) {
    result.time = toFloat64Array(samples.time);
  }
  if (samples.timeDeltas !== undefined) {
    result.timeDeltas = toFloat64Array(samples.timeDeltas);
  }
  return result;
}

function convertCounterEligibleColumns(counter: RawCounter): RawCounter {
  const samples: RawCounterSamplesTable = { ...counter.samples };
  if (counter.samples.time !== undefined) {
    samples.time = toFloat64Array(counter.samples.time);
  }
  if (counter.samples.timeDeltas !== undefined) {
    samples.timeDeltas = toFloat64Array(counter.samples.timeDeltas);
  }
  return { ...counter, samples };
}

/**
 * Take a profile and convert it to a Uint8Array in the JsonSlabs format.
 *
 * This is more efficient than JSON if the profile contains large typed arrays.
 */
export function serializeProfileToJsonSlabsFile(
  profile: Profile
): Uint8Array<ArrayBuffer> {
  // Encode the profile object with the binary JsonSlabs container format.
  return encodeJsonSlabs(profile, [
    // "Split-out" slabs:
    //
    // This second argument to the encode function is an array of objects which
    // should be pulled out into their own dedicated slabs. This is totally
    // optional and doesn't change what the decoded object will look like.
    // We use it to "split out" some large tables as long as we haven't converted
    // them to use typed arrays. This already gives us a benefit: It means that
    // decoding will use several JSON.parse calls rather than just one single
    // JSON.parse call, and each individual JSON.parse will act on a smaller
    // string, which means it's less likely to hit any string size limits.
    //
    // As we convert more and more tables / columns to typed arrays, the "skeleton
    // JSON" for these tables will become much smaller and we won't need to split
    // out those tables anymore.
    profile.threads,
    profile.shared.frameTable,
    profile.shared.funcTable,
    profile.shared.stringArray,
  ]);
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

function decodeUtf8WithNiceError(bytes: Uint8Array): string {
  try {
    const textDecoder = new TextDecoder(undefined, { fatal: true });
    return textDecoder.decode(bytes);
  } catch (e) {
    console.error('Source exception:', e);
    throw new Error(
      'The profile array buffer could not be parsed as a UTF-8 string.'
    );
  }
}

async function parseJSONFromBytes(bytes: Uint8Array): Promise<any> {
  const V8_STRING_MAX_SIZE = 512 * 1024 * 1024 - 24; // 512 MiB - 24
  if (bytes.byteLength < V8_STRING_MAX_SIZE) {
    const jsonString = decodeUtf8WithNiceError(bytes);
    return JSON.parse(jsonString);
  }

  // The payload is too large to fit in a single string (in V8), so we can't decode
  // it and call JSON.parse on it. Use a streaming JSON parser instead. This is
  // much slower than native JSON.parse, so we only do it when necessary.
  const { JSONParser } = await import('@streamparser/json');
  const parser = new JSONParser({ paths: ['$'] });
  let result: any;
  parser.onValue = ({ value }) => {
    result = value;
  };
  parser.write(bytes);
  if (!parser.isEnded) {
    throw new Error('Input terminated before end of JSON');
  }
  return result;
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
 *
 * `upgradeInfo` is an outparam and will be populated by this function.
 */
export async function unserializeProfileOfArbitraryFormat(
  arbitraryFormat: unknown,
  profileUrl?: string,
  upgradeInfo: ProfileUpgradeInfo = {}
): Promise<Profile> {
  try {
    // We use Object.prototype.toString instead of `instanceof ArrayBuffer`
    // because instanceof doesn't work cross-realm (e.g. in tests), and we
    // can't use String() since that serializes the full contents of a Uint8Array.
    if (
      Object.prototype.toString.call(arbitraryFormat) === '[object ArrayBuffer]'
    ) {
      const arrayBuffer = arbitraryFormat as ArrayBuffer;
      arbitraryFormat = new Uint8Array(arrayBuffer);
    }

    // Handle binary formats.
    if (
      arbitraryFormat instanceof Uint8Array ||
      (globalThis.Buffer && arbitraryFormat instanceof globalThis.Buffer)
    ) {
      // Check for the gzip magic number in the header. If we find it, decompress
      // the data first.
      let profileBytes = arbitraryFormat as Uint8Array<ArrayBuffer>;
      if (isGzip(profileBytes)) {
        profileBytes = await decompress(profileBytes);
      }

      if (isJsonSlabsFile(profileBytes)) {
        arbitraryFormat = decodeJsonSlabs(profileBytes);
      } else if (isArtTraceFormat(profileBytes)) {
        arbitraryFormat = convertArtTraceProfile(profileBytes);
      } else if (verifyMagic(SIMPLEPERF_MAGIC, profileBytes)) {
        const { convertSimpleperfTraceProfile } =
          await import('./import/simpleperf');
        arbitraryFormat = convertSimpleperfTraceProfile(profileBytes);
      } else {
        // Probably a string-based format.
        // We don't want to materialize a string for the entire profileBytes
        // here, in case we want to use the streaming JSON parser later. But
        // to detect perf script + flamegraph, we need to look at some text,
        // so let's decode the first 4096 bytes and detect the format based
        // on the first one or two lines.
        const CHARCODE_LINE_BREAK = 10; // '\n'.charCodeAt(0)
        const firstPage = profileBytes.subarray(0, 4096);
        const firstLineBreakPos = firstPage.indexOf(CHARCODE_LINE_BREAK);
        const secondLineBreakPos =
          firstLineBreakPos !== -1
            ? firstPage.indexOf(CHARCODE_LINE_BREAK, firstLineBreakPos + 1)
            : -1;
        const sniffEnd =
          secondLineBreakPos !== -1 ? secondLineBreakPos : firstPage.byteLength;
        // Non-fatal: the cut may fall inside a multi-byte UTF-8 sequence;
        // we only need enough text to recognize the format.
        const firstTwoLinesAsText = new TextDecoder().decode(
          firstPage.subarray(0, sniffEnd)
        );
        if (isPerfScriptFormat(firstTwoLinesAsText)) {
          arbitraryFormat = convertPerfScriptProfile(
            decodeUtf8WithNiceError(profileBytes)
          );
        } else if (isFlameGraphFormat(firstTwoLinesAsText)) {
          arbitraryFormat = convertFlameGraphProfile(
            decodeUtf8WithNiceError(profileBytes)
          );
        } else {
          // Try parsing as JSON.
          arbitraryFormat = await parseJSONFromBytes(profileBytes);
        }
      }
    }

    if (typeof arbitraryFormat === 'string') {
      if (isPerfScriptFormat(arbitraryFormat)) {
        arbitraryFormat = convertPerfScriptProfile(arbitraryFormat);
      } else if (isFlameGraphFormat(arbitraryFormat)) {
        arbitraryFormat = convertFlameGraphProfile(arbitraryFormat);
      } else {
        // Try parsing as JSON.
        arbitraryFormat = JSON.parse(arbitraryFormat);
      }
    }

    // At this point, we expect arbitraryFormat to contain a JSON object of some profile format.
    const json = arbitraryFormat;

    const possiblyFixedProfile =
      attemptToFixProcessedProfileThroughMutation(json);
    const processedProfile = attemptToUpgradeProcessedProfileThroughMutation(
      possiblyFixedProfile,
      upgradeInfo
    );
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
    // A version mismatch is already a clear, user-facing error. Re-throw it
    // as-is so each frontend can detect it and add its own update advice.
    if (e instanceof ProfileVersionError) {
      throw e;
    }
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
