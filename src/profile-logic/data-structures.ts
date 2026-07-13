/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GECKO_PROFILE_VERSION,
  PROCESSED_PROFILE_VERSION,
} from '../app-logic/constants';
import {
  toFloat64ArraySetNullToZero,
  toUint8OrUint16Array,
  valuesFitInUint8,
} from '../utils/typed-arrays';

import type {
  RawProfileSharedData,
  RawThread,
  RawSamplesTable,
  RawFrameTable,
  RawStackTable,
  RawJsAllocationsTable,
  RawUnbalancedNativeAllocationsTable,
  RawBalancedNativeAllocationsTable,
  FuncTable,
  RawMarkerTable,
  ResourceTable,
  RawNativeSymbolTable,
  Profile,
  ExtensionTable,
  CategoryList,
  JsTracerTable,
  CallNodeTable,
  SourceTable,
  SourceLocationTable,
  IndexIntoFrameTable,
  IndexIntoFuncTable,
  IndexIntoLibs,
  IndexIntoStackTable,
  IndexIntoStringTable,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
  IndexIntoNativeSymbolTable,
  IndexIntoSourceLocationTable,
  InnerWindowID,
  Address,
  Bytes,
  Milliseconds,
  Tid,
  MarkerPhase,
  MarkerPayload,
  WeightType,
} from 'firefox-profiler/types';

/**
 * Builder-variants of various tables. The columns here use plain
 * arrays so that elements can be added one-by-one by pushing to
 * the column arrays.
 *
 * The "raw" variants of these arrays (i.e. what's stored in the
 * profile files) may be using typed arrays for some of the columns,
 * and you can't push to a typed array.
 */
export type RawSamplesTableBuilder = {
  responsiveness?: Array<Milliseconds | null>;
  eventDelay?: Array<Milliseconds | null>;
  stack: Array<IndexIntoStackTable | null>;
  time?: Milliseconds[];
  timeDeltas?: Milliseconds[];
  argumentValues?: Array<number | null>;
  weight: null | number[];
  weightType: WeightType;
  threadCPUDelta?: Array<number | null>;
  threadId?: Tid[];
  length: number;
};

export type RawMarkerTableBuilder = {
  data: Array<MarkerPayload | null>;
  name: IndexIntoStringTable[];
  startTime: Array<Milliseconds | null>;
  endTime: Array<Milliseconds | null>;
  phase: MarkerPhase[];
  category: IndexIntoCategoryList[];
  threadId?: Array<Tid | null>;
  length: number;
};

export type RawJsAllocationsTableBuilder = {
  time: Milliseconds[];
  className: string[];
  typeName: string[];
  coarseType: string[];
  weight: Bytes[];
  weightType: 'bytes';
  inNursery: boolean[];
  stack: Array<IndexIntoStackTable | null>;
  length: number;
};

export type RawUnbalancedNativeAllocationsTableBuilder = {
  time: Milliseconds[];
  weight: Bytes[];
  weightType: 'bytes';
  stack: Array<IndexIntoStackTable | null>;
  argumentValues?: Array<number | null>;
  length: number;
};

export type RawBalancedNativeAllocationsTableBuilder = {
  time: Milliseconds[];
  weight: Bytes[];
  weightType: 'bytes';
  stack: Array<IndexIntoStackTable | null>;
  argumentValues?: Array<number | null>;
  memoryAddress: number[];
  threadId: number[];
  length: number;
};

export type RawFrameTableBuilder = {
  flags: number[];
  address: Address[];
  category: IndexIntoCategoryList[];
  subcategory: IndexIntoSubcategoryListForCategory[];
  func: IndexIntoFuncTable[];
  lib: IndexIntoLibs[];
  nativeSymbol: IndexIntoNativeSymbolTable[];
  innerWindowID: InnerWindowID[];
  line: number[];
  column: number[];
  originalLocation: IndexIntoSourceLocationTable[];
  length: number;
};

export type RawStackTableBuilder = {
  frame: IndexIntoFrameTable[];
  prefix: Array<IndexIntoStackTable | null>;
  length: number;
};

/**
 * This module collects all of the creation of new empty profile data structures.
 */

export function getRawSamplesTableBuilder(): RawSamplesTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    weightType: 'samples',
    weight: null,
    stack: [],
    time: [],
    length: 0,
  };
}

export function getRawStackTableBuilder(): RawStackTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    frame: [],
    prefix: [],
    length: 0,
  };
}

export function getRawSamplesTableBuilderFromExisting(
  existing: RawSamplesTable
): RawSamplesTableBuilder {
  const builder: RawSamplesTableBuilder = {
    stack: existing.stack.slice(),
    weight: existing.weight === null ? null : existing.weight.slice(),
    weightType: existing.weightType,
    length: existing.length,
  };
  if (existing.responsiveness !== undefined) {
    builder.responsiveness = existing.responsiveness.slice();
  }
  if (existing.eventDelay !== undefined) {
    builder.eventDelay = existing.eventDelay.slice();
  }
  if (existing.time !== undefined) {
    builder.time = Array.from(existing.time);
  }
  if (existing.timeDeltas !== undefined) {
    builder.timeDeltas = Array.from(existing.timeDeltas);
  }
  if (existing.argumentValues !== undefined) {
    builder.argumentValues = existing.argumentValues.slice();
  }
  if (existing.threadCPUDelta !== undefined) {
    builder.threadCPUDelta = existing.threadCPUDelta.slice();
  }
  return builder;
}

export function finishRawSamplesTableBuilder(
  builder: RawSamplesTableBuilder
): RawSamplesTable {
  return {
    ...builder,
    time:
      builder.time === undefined ? undefined : new Float64Array(builder.time),
    timeDeltas:
      builder.timeDeltas === undefined
        ? undefined
        : new Float64Array(builder.timeDeltas),
  };
}

export function getRawMarkerTableBuilder(): RawMarkerTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    data: [],
    name: [],
    startTime: [],
    endTime: [],
    phase: [],
    category: [],
    length: 0,
  };
}

export function getRawMarkerTableBuilderFromExisting(
  markerTable: RawMarkerTable
): RawMarkerTableBuilder {
  const builder: RawMarkerTableBuilder = {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    data: markerTable.data.slice(),
    name: markerTable.name.slice(),
    startTime: Array.from(markerTable.startTime),
    endTime: Array.from(markerTable.endTime),
    phase: markerTable.phase.slice(),
    category: markerTable.category.slice(),
    length: markerTable.length,
  };
  if (markerTable.threadId !== undefined) {
    builder.threadId = markerTable.threadId.slice();
  }
  return builder;
}

export function finishRawMarkerTableBuilder(
  builder: RawMarkerTableBuilder
): RawMarkerTable {
  return {
    ...builder,
    // The nulls in these columns become zeros. This is fine: whether a marker's
    // start / end time is meaningful is determined by its phase, and the times
    // which are not used are allowed to be arbitrary values.
    startTime: toFloat64ArraySetNullToZero(builder.startTime),
    endTime: toFloat64ArraySetNullToZero(builder.endTime),
  };
}

export function getRawStackTableBuilderWithExistingContents(
  existing: RawStackTable
): RawStackTableBuilder {
  const prefix = new Array<IndexIntoStackTable | null>(existing.length);
  for (let i = 0; i < existing.length; i++) {
    const offset = existing.prefixOffset[i];
    prefix[i] = offset === 0 ? null : i - offset;
  }
  return {
    frame: [...existing.frame],
    prefix,
    length: existing.length,
  };
}

export function finishRawStackTableBuilder(
  builder: RawStackTableBuilder
): RawStackTable {
  const { frame, prefix, length } = builder;
  const prefixOffset = new Int32Array(length);
  for (let i = 0; i < length; i++) {
    const p = prefix[i];
    prefixOffset[i] = p === null ? 0 : i - p;
  }
  return {
    frame: new Int32Array(frame),
    prefixOffset,
    length,
  };
}

/**
 * Returns an empty samples table with eventDelay field instead of responsiveness.
 * eventDelay is a new field and it replaced responsiveness. We should still
 * account for older profiles and use both of the flavors if needed.
 */
export function getRawSamplesTableBuilderWithEventDelay(): RawSamplesTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    weightType: 'samples',
    weight: null,
    eventDelay: [],
    stack: [],
    time: [],
    length: 0,
  };
}

export function getRawFrameTableBuilder(): RawFrameTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    flags: [],
    address: [],
    category: [],
    subcategory: [],
    func: [],
    lib: [],
    nativeSymbol: [],
    innerWindowID: [],
    line: [],
    column: [],
    originalLocation: [],
    length: 0,
  };
}

export function getRawFrameTableBuilderWithExistingContents(
  frameTable: RawFrameTable
): RawFrameTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    flags: Array.from(frameTable.flags),
    address: Array.from(frameTable.address),
    category: Array.from(frameTable.category),
    subcategory: Array.from(frameTable.subcategory),
    func: Array.from(frameTable.func),
    lib: Array.from(frameTable.lib),
    nativeSymbol: Array.from(frameTable.nativeSymbol),
    innerWindowID: Array.from(frameTable.innerWindowID),
    line: Array.from(frameTable.line),
    column: Array.from(frameTable.column),
    originalLocation: Array.from(frameTable.originalLocation),
    length: frameTable.length,
  };
}

export function finishRawFrameTableBuilder(
  builder: RawFrameTableBuilder
): RawFrameTable {
  return {
    ...builder,
    flags: new Uint8Array(builder.flags),
    address: new Uint32Array(builder.address),
    // Category indexes are limited to 8 bits by the format.
    category: new Uint8Array(builder.category),
    // The profile's category list isn't available here, so derive the width
    // from the values instead of from the largest subcategory count. This can
    // only ever pick a narrower width than the category list would allow, so
    // it can't overflow the derived stack table's subcategory column.
    subcategory: toUint8OrUint16Array(
      builder.subcategory,
      !valuesFitInUint8(builder.subcategory)
    ),
    func: new Int32Array(builder.func),
    lib: new Int32Array(builder.lib),
    nativeSymbol: new Int32Array(builder.nativeSymbol),
    innerWindowID: new Float64Array(builder.innerWindowID),
    line: new Int32Array(builder.line),
    column: new Int32Array(builder.column),
    originalLocation: new Int32Array(builder.originalLocation),
  };
}

export function getEmptyFuncTable(): FuncTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    isJS: [],
    relevantForJS: [],
    name: [],
    resource: [],
    source: [],
    lineNumber: [],
    columnNumber: [],
    originalLocation: [],
    length: 0,
  };
}

export function shallowCloneFuncTable(funcTable: FuncTable): FuncTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    isJS: funcTable.isJS.slice(),
    relevantForJS: funcTable.relevantForJS.slice(),
    name: funcTable.name.slice(),
    resource: funcTable.resource.slice(),
    source: funcTable.source.slice(),
    lineNumber: funcTable.lineNumber.slice(),
    columnNumber: funcTable.columnNumber.slice(),
    originalLocation: funcTable.originalLocation.slice(),
    length: funcTable.length,
  };
}

export function getEmptySourceLocationTable(): SourceLocationTable {
  return {
    source: [],
    line: [],
    column: [],
    length: 0,
  };
}

export function shallowCloneSourceLocationTable(
  sourceLocationTable: SourceLocationTable
): SourceLocationTable {
  return {
    source: sourceLocationTable.source.slice(),
    line: sourceLocationTable.line.slice(),
    column: sourceLocationTable.column.slice(),
    length: sourceLocationTable.length,
  };
}

export type RawNativeSymbolTableBuilder = {
  libIndex: IndexIntoLibs[];
  address: Address[];
  name: IndexIntoStringTable[];
  functionSize: Array<Bytes | -1>;
  length: number;
};

export function getRawNativeSymbolTableBuilder(): RawNativeSymbolTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    libIndex: [],
    address: [],
    name: [],
    functionSize: [],
    length: 0,
  };
}

export function getRawNativeSymbolTableBuilderWithExistingContents(
  nativeSymbols: RawNativeSymbolTable
): RawNativeSymbolTableBuilder {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    libIndex: Array.from(nativeSymbols.libIndex),
    address: Array.from(nativeSymbols.address),
    name: Array.from(nativeSymbols.name),
    functionSize: Array.from(nativeSymbols.functionSize),
    length: nativeSymbols.length,
  };
}

export function finishRawNativeSymbolTableBuilder(
  builder: RawNativeSymbolTableBuilder
): RawNativeSymbolTable {
  return {
    libIndex: new Int32Array(builder.libIndex),
    // Uint32Array, like frameTable.address, so that the two can be compared.
    address: new Uint32Array(builder.address),
    name: new Int32Array(builder.name),
    functionSize: new Int32Array(builder.functionSize),
    length: builder.length,
  };
}

export function getEmptyResourceTable(): ResourceTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    name: [],
    host: [],
    type: [],
    length: 0,
  };
}

export function getEmptyRawJsAllocationsTable(): RawJsAllocationsTableBuilder {
  // Important!
  // If modifying this structure, please update all callers of this function to ensure
  // that they are pushing on correctly to the data structure. These pushes may not
  // be caught by the type system.
  return {
    time: [],
    className: [],
    typeName: [],
    coarseType: [],
    weight: [],
    weightType: 'bytes',
    inNursery: [],
    stack: [],
    length: 0,
  };
}

/**
 * The native allocation tables come in two varieties. Get one of the members of the
 * union.
 */
export function getEmptyRawUnbalancedNativeAllocationsTable(): RawUnbalancedNativeAllocationsTableBuilder {
  // Important!
  // If modifying this structure, please update all callers of this function to ensure
  // that they are pushing on correctly to the data structure. These pushes may not
  // be caught by the type system.
  return {
    time: [],
    weight: [],
    weightType: 'bytes',
    stack: [],
    length: 0,
  };
}

/**
 * The native allocation tables come in two varieties. Get one of the members of the
 * union.
 */
export function getEmptyRawBalancedNativeAllocationsTable(): RawBalancedNativeAllocationsTableBuilder {
  // Important!
  // If modifying this structure, please update all callers of this function to ensure
  // that they are pushing on correctly to the data structure. These pushes may not
  // be caught by the type system.
  return {
    time: [],
    weight: [],
    weightType: 'bytes',
    stack: [],
    memoryAddress: [],
    threadId: [],
    length: 0,
  };
}

export function finishRawJsAllocationsTableBuilder(
  builder: RawJsAllocationsTableBuilder
): RawJsAllocationsTable {
  return {
    ...builder,
    time: new Float64Array(builder.time),
  };
}

export function finishRawUnbalancedNativeAllocationsTableBuilder(
  builder: RawUnbalancedNativeAllocationsTableBuilder
): RawUnbalancedNativeAllocationsTable {
  return {
    ...builder,
    time: new Float64Array(builder.time),
  };
}

export function finishRawBalancedNativeAllocationsTableBuilder(
  builder: RawBalancedNativeAllocationsTableBuilder
): RawBalancedNativeAllocationsTable {
  return {
    ...builder,
    time: new Float64Array(builder.time),
  };
}

export function getEmptyExtensions(): ExtensionTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    id: [],
    name: [],
    baseURL: [],
    length: 0,
  };
}

export function getDefaultCategories(): CategoryList {
  return [
    // Make sure 'Other' is at index 0, as it's used as the category for stacks when no
    // categories are provided by an imported (non-Gecko profiler) profile.
    { name: 'Other', color: 'grey', subcategories: ['Other'] },
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    { name: 'Layout', color: 'purple', subcategories: ['Other'] },
    { name: 'JavaScript', color: 'yellow', subcategories: ['Other'] },
    { name: 'GC / CC', color: 'orange', subcategories: ['Other'] },
    { name: 'Network', color: 'lightblue', subcategories: ['Other'] },
    { name: 'Graphics', color: 'green', subcategories: ['Other'] },
    { name: 'DOM', color: 'blue', subcategories: ['Other'] },
  ];
}

export function getEmptyJsTracerTable(): JsTracerTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    events: [],
    timestamps: [],
    durations: [],
    line: [],
    column: [],
    length: 0,
  };
}

export function getEmptySourceTable(): SourceTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    id: [],
    filename: [],
    startLine: [],
    startColumn: [],
    sourceMapURL: [],
    content: [],
    length: 0,
  };
}

export function getEmptyThread(overrides?: Partial<RawThread>): RawThread {
  const defaultThread: RawThread = {
    processType: 'default',
    processStartupTime: 0,
    processShutdownTime: null,
    registerTime: 0,
    unregisterTime: null,
    pausedRanges: [],
    name: 'Empty',
    isMainThread: false,
    pid: '0',
    tid: 0,
    // Creating samples with event delay since it's the new samples table.
    samples: finishRawSamplesTableBuilder(
      getRawSamplesTableBuilderWithEventDelay()
    ),
    markers: finishRawMarkerTableBuilder(getRawMarkerTableBuilder()),
  };

  return {
    ...defaultThread,
    ...overrides,
  };
}

export function getEmptySharedData(): RawProfileSharedData {
  return {
    stackTable: finishRawStackTableBuilder(getRawStackTableBuilder()),
    frameTable: finishRawFrameTableBuilder(getRawFrameTableBuilder()),
    funcTable: getEmptyFuncTable(),
    resourceTable: getEmptyResourceTable(),
    nativeSymbols: finishRawNativeSymbolTableBuilder(
      getRawNativeSymbolTableBuilder()
    ),
    sources: getEmptySourceTable(),
    stringArray: [],
    sourceLocationTable: getEmptySourceLocationTable(),
  };
}

export function getEmptyProfile(): Profile {
  return {
    meta: {
      interval: 1,
      startTime: 0,
      abi: '',
      misc: '',
      oscpu: '',
      platform: '',
      processType: 0,
      extensions: getEmptyExtensions(),
      categories: getDefaultCategories(),
      product: 'Firefox',
      stackwalk: 0,
      toolkit: '',
      version: GECKO_PROFILE_VERSION,
      preprocessedProfileVersion: PROCESSED_PROFILE_VERSION,
      appBuildID: '',
      sourceURL: '',
      physicalCPUs: 0,
      logicalCPUs: 0,
      CPUName: '',
      symbolicated: true,
      markerSchema: [],
    },
    libs: [],
    pages: [],
    shared: getEmptySharedData(),
    threads: [],
  };
}

export function getEmptyCallNodeTable(): CallNodeTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    prefix: new Int32Array(0),
    subtreeRangeEnd: new Uint32Array(0),
    nextSibling: new Int32Array(0),
    func: new Int32Array(0),
    category: new Int32Array(0),
    subcategory: new Int32Array(0),
    innerWindowID: new Float64Array(0),
    sourceFramesInlinedIntoSymbol: new Int32Array(0),
    depth: new Int32Array(0),
    maxDepth: -1,
    length: 0,
  };
}
