/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  GECKO_PROFILE_VERSION,
  PROCESSED_PROFILE_VERSION,
} from '../app-logic/constants';

import type {
  RawThread,
  RawSamplesTable,
  FrameTable,
  RawStackTable,
  StackTable,
  FuncTable,
  RawMarkerTable,
  JsAllocationsTable,
  UnbalancedNativeAllocationsTable,
  BalancedNativeAllocationsTable,
  ResourceTable,
  NativeSymbolTable,
  Profile,
  ExtensionTable,
  CategoryList,
  JsTracerTable,
  CallNodeTable,
  SourceTable,
} from 'firefox-profiler/types';

/**
 * This module collects all of the creation of new empty profile data structures.
 */

export function getEmptyStackTable(): StackTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    frame: [],
    prefix: [],
    category: [],
    subcategory: [],
    length: 0,
  };
}

export function getEmptySamplesTable(): RawSamplesTable {
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

export function getEmptyRawStackTable(): RawStackTable {
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

/**
 * Returns an empty samples table with eventDelay field instead of responsiveness.
 * eventDelay is a new field and it replaced responsiveness. We should still
 * account for older profiles and use both of the flavors if needed.
 */
export function getEmptySamplesTableWithEventDelay(): RawSamplesTable {
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

export function getEmptyFrameTable(): FrameTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    address: [],
    inlineDepth: [],
    category: [],
    subcategory: [],
    func: [],
    nativeSymbol: [],
    innerWindowID: [],
    line: [],
    column: [],
    length: 0,
  };
}

export function shallowCloneFrameTable(frameTable: FrameTable): FrameTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    address: frameTable.address.slice(),
    inlineDepth: frameTable.inlineDepth.slice(),
    category: frameTable.category.slice(),
    subcategory: frameTable.subcategory.slice(),
    func: frameTable.func.slice(),
    nativeSymbol: frameTable.nativeSymbol.slice(),
    innerWindowID: frameTable.innerWindowID.slice(),
    line: frameTable.line.slice(),
    column: frameTable.column.slice(),
    length: frameTable.length,
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
    length: funcTable.length,
  };
}

export function shallowCloneNativeSymbolTable(
  nativeSymbols: NativeSymbolTable
): NativeSymbolTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    libIndex: nativeSymbols.libIndex.slice(),
    address: nativeSymbols.address.slice(),
    name: nativeSymbols.name.slice(),
    functionSize: nativeSymbols.functionSize.slice(),
    length: nativeSymbols.length,
  };
}

export function getEmptyResourceTable(): ResourceTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    lib: [],
    name: [],
    host: [],
    type: [],
    length: 0,
  };
}

export function getEmptyNativeSymbolTable(): NativeSymbolTable {
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

export function getEmptyRawMarkerTable(): RawMarkerTable {
  // Important!
  // If modifying this structure, please update all callers of this function to ensure
  // that they are pushing on correctly to the data structure. These pushes may not
  // be caught by the type system.
  return {
    data: [],
    name: [],
    startTime: [],
    endTime: [],
    phase: [],
    category: [],
    length: 0,
  };
}

export function getEmptyJsAllocationsTable(): JsAllocationsTable {
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
export function getEmptyUnbalancedNativeAllocationsTable(): UnbalancedNativeAllocationsTable {
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
export function getEmptyBalancedNativeAllocationsTable(): BalancedNativeAllocationsTable {
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

export function shallowCloneRawMarkerTable(
  markerTable: RawMarkerTable
): RawMarkerTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    data: markerTable.data.slice(),
    name: markerTable.name.slice(),
    startTime: markerTable.startTime.slice(),
    endTime: markerTable.endTime.slice(),
    phase: markerTable.phase.slice(),
    category: markerTable.category.slice(),
    length: markerTable.length,
  };
}

export const resourceTypes = {
  unknown: 0,
  library: 1,
  addon: 2,
  webhost: 3,
  otherhost: 4,
  url: 5,
};

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
    uuid: [],
    filename: [],
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
    samples: getEmptySamplesTableWithEventDelay(),
    markers: getEmptyRawMarkerTable(),
    stackTable: getEmptyRawStackTable(),
    frameTable: getEmptyFrameTable(),
    funcTable: getEmptyFuncTable(),
    resourceTable: getEmptyResourceTable(),
    nativeSymbols: getEmptyNativeSymbolTable(),
  };

  return {
    ...defaultThread,
    ...overrides,
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
    shared: {
      stringArray: [],
      sources: getEmptySourceTable(),
    },
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
