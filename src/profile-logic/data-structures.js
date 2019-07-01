/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { UniqueStringArray } from '../utils/unique-string-array';
import {
  GECKO_PROFILE_VERSION,
  PROCESSED_PROFILE_VERSION,
} from '../app-logic/constants';

import type {
  Thread,
  SamplesTable,
  FrameTable,
  StackTable,
  FuncTable,
  RawMarkerTable,
  ResourceTable,
  Profile,
  ExtensionTable,
  CategoryList,
  JsTracerTable,
} from '../types/profile';

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

export function getEmptySamplesTable(): SamplesTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    responsiveness: [],
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
    category: [],
    subcategory: [],
    func: [],
    implementation: [],
    line: [],
    column: [],
    optimizations: [],
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
    category: frameTable.category.slice(),
    subcategory: frameTable.subcategory.slice(),
    func: frameTable.func.slice(),
    implementation: frameTable.implementation.slice(),
    line: frameTable.line.slice(),
    column: frameTable.column.slice(),
    optimizations: frameTable.optimizations.slice(),
    length: frameTable.length,
  };
}

export function getEmptyFuncTable(): FuncTable {
  return {
    // Important!
    // If modifying this structure, please update all callers of this function to ensure
    // that they are pushing on correctly to the data structure. These pushes may not
    // be caught by the type system.
    address: [],
    isJS: [],
    relevantForJS: [],
    name: [],
    resource: [],
    fileName: [],
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
    address: funcTable.address.slice(),
    isJS: funcTable.isJS.slice(),
    relevantForJS: funcTable.relevantForJS.slice(),
    name: funcTable.name.slice(),
    resource: funcTable.resource.slice(),
    fileName: funcTable.fileName.slice(),
    lineNumber: funcTable.lineNumber.slice(),
    columnNumber: funcTable.columnNumber.slice(),
    length: funcTable.length,
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

export function getEmptyRawMarkerTable(): RawMarkerTable {
  // Important!
  // If modifying this structure, please update all callers of this function to ensure
  // that they are pushing on correctly to the data structure. These pushes may not
  // be caught by the type system.
  return {
    data: [],
    name: [],
    time: [],
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
    time: markerTable.time.slice(),
    length: markerTable.length,
  };
}

export function getResourceTypes(): * {
  return {
    unknown: 0,
    library: 1,
    addon: 2,
    webhost: 3,
    otherhost: 4,
    url: 5,
  };
}

/**
 * Export a read-only copy of the resource types.
 */
export const resourceTypes = (getResourceTypes(): $Exact<
  $ReadOnly<$Call<typeof getResourceTypes>>
>);

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
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    { name: 'Other', color: 'grey', subcategories: ['Other'] },
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
    lines: [],
    columns: [],
    length: 0,
  };
}

export function getEmptyThread(overrides?: $Shape<Thread>): Thread {
  const defaultThread: Thread = {
    processType: 'default',
    processStartupTime: 0,
    processShutdownTime: null,
    registerTime: 0,
    unregisterTime: null,
    pausedRanges: [],
    name: 'Empty',
    pid: 0,
    tid: 0,
    samples: getEmptySamplesTable(),
    markers: getEmptyRawMarkerTable(),
    stackTable: getEmptyStackTable(),
    frameTable: getEmptyFrameTable(),
    stringTable: new UniqueStringArray(),
    libs: [],
    funcTable: getEmptyFuncTable(),
    resourceTable: getEmptyResourceTable(),
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
      symbolicated: true,
    },
    pages: [],
    threads: [],
  };
}
