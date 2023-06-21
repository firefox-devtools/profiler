/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import type {
  Profile,
  Bytes,
  IndexIntoStackTable,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
} from 'firefox-profiler/types';

import {
  getEmptyProfile,
  getEmptyThread,
  getEmptyUnbalancedNativeAllocationsTable,
} from '../data-structures';

import { coerce, ensureExists } from 'firefox-profiler/utils/flow';

// V8 Types Begin
// References used for heapprofile format:
// https://source.chromium.org/chromium/chromium/src/+/main:v8/include/js_protocol.pdl;l=699-729;drc=7b19557f8cb73895bda339c7a98decfb1dc9c5c2
// https://source.chromium.org/chromium/chromium/src/+/main:v8/src/profiler/sampling-heap-profiler.h;drc=76372353c17d017ad220c51f7514e3b87a9888bb
// https://source.chromium.org/chromium/chromium/src/+/main:v8/src/profiler/sampling-heap-profiler.cc;drc=2caf2ed610aa758ad1dcca603b49082678329f5b
// https://source.chromium.org/chromium/chromium/src/+/main:v8/src/inspector/v8-heap-profiler-agent-impl.h;drc=3d59a3c2c16405eea59263300c5591c3283a2a0e
// https://source.chromium.org/chromium/chromium/src/+/main:v8/src/inspector/v8-heap-profiler-agent-impl.cc;drc=3d59a3c2c16405eea59263300c5591c3283a2a0e

// Unique script identifier.
type ScriptId = string;

// Unique node identifier.
type NodeId = number;

// Stack entry for runtime errors and assertions.
type CallFrame = $ReadOnly<{|
  // JavaScript function name.
  functionName: string,
  // JavaScript script id.
  scriptId: ScriptId,
  // JavaScript script name or url.
  url: string,
  // JavaScript script line number (0-based).
  lineNumber: number,
  // JavaScript script column number (0-based).
  columnNumber: number,
|}>;

// Sampling Heap Profile node. Holds callsite information, allocation statistics and child nodes.
type SamplingHeapProfileNode = $ReadOnly<{|
  // Function location.
  callFrame: CallFrame,
  // Allocations size in bytes for the node excluding children.
  selfSize: Bytes,
  // Node id. Ids are unique across all profiles collected between startSampling and stopSampling.
  id: NodeId,
  // Child nodes.
  children: SamplingHeapProfileNode[],
|}>;

// A single sample from a sampling profile.
type SamplingHeapProfileSample = $ReadOnly<{|
  // Allocation size in bytes attributed to the sample.
  size: Bytes,
  // Id of the corresponding profile tree node.
  nodeId: NodeId,
  // Time-ordered sample ordinal number. It is unique across all profiles retrieved
  // between startSampling and stopSampling.
  ordinal: number,
|}>;

// Sampling profile.
type SamplingHeapProfile = $ReadOnly<{|
  head: SamplingHeapProfileNode,
  samples: SamplingHeapProfileSample[],
|}>;

// V8 Types End

type FunctionInfo = {
  category: IndexIntoCategoryList,
  subcategory: IndexIntoSubcategoryListForCategory,
  isJS: boolean,
  relevantForJS: boolean,
};

const CATEGORIES = [
  { name: 'Other', color: 'grey', subcategories: ['Other'] },
  {
    name: 'JavaScript',
    color: 'yellow',
    subcategories: [
      'Node Built-in',
      'Browser Extension',
      'Dependency',
      'Other',
    ],
  },
  { name: 'Native', color: 'blue', subcategories: ['V8', 'Other'] },
];

/**
 * Nested map used for convenience to get indices into categories and the respective subcategories.
 * Is of the form: [category name][subcategory name] -> {category: index, subcategory: index}.
 */
const CATEGORY_IDX_MAP = Object.fromEntries(
  CATEGORIES.map(({ name, subcategories }, i) => [
    name,
    Object.fromEntries(
      subcategories.map((subCat, j) => [
        subCat,
        { category: i, subcategory: j },
      ])
    ),
  ])
);

function getFunctionInfo(callFrame: CallFrame): FunctionInfo {
  const { functionName, scriptId, url } = callFrame;
  // V8 categorization and isJS checks were made based on:
  // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/profiler/sampling-heap-profiler.cc;l=175-204;drc=2caf2ed610aa758ad1dcca603b49082678329f5b
  // https://source.chromium.org/chromium/chromium/src/+/main:v8/src/profiler/sampling-heap-profiler.cc;l=59-60;drc=61bc5ca953c07dca60dd1e4de000da97e7bc4e3f
  const isJS = scriptId !== '0' || functionName === '(JS)';
  if (isJS) {
    let subcategory;
    if (url.startsWith('node:')) {
      subcategory = 'Node Built-in';
    } else if (url.startsWith('chrome-extension://')) {
      subcategory = 'Browser Extension';
    } else if (/(\/|\\)node_modules(\/|\\)/.test(url)) {
      subcategory = 'Dependency';
    } else {
      subcategory = 'Other';
    }
    return {
      ...CATEGORY_IDX_MAP.JavaScript[subcategory],
      isJS,
      relevantForJS: false,
    };
  }

  switch (functionName) {
    case '(GC)':
    case '(PARSER)':
    case '(COMPILER)':
    case '(BYTECODE_COMPILER)':
    case '(V8 API)':
      return { ...CATEGORY_IDX_MAP.Native.V8, isJS, relevantForJS: false };
    case '(EXTERNAL)':
      return { ...CATEGORY_IDX_MAP.Native.Other, isJS, relevantForJS: false };
    case '(root)':
      return { ...CATEGORY_IDX_MAP.Other.Other, isJS, relevantForJS: false };
    default:
      return { ...CATEGORY_IDX_MAP.Native.V8, isJS, relevantForJS: true };
  }
}

/** Lightly checks that the properties in SamplingHeapProfile are present. */
function isV8HeapProfile(json: mixed): boolean {
  if (!json || typeof json !== 'object') {
    return false;
  }

  if (typeof json.head !== 'object' || !Array.isArray(json.samples)) {
    return false;
  }

  const head = ensureExists(json.head);
  return ['callFrame', 'selfSize', 'children', 'id'].every(
    (prop) => prop in head
  );
}

export function attemptToConvertV8HeapProfile(json: mixed): Profile | null {
  if (!isV8HeapProfile(json)) {
    return null;
  }

  const profile = getEmptyProfile();
  profile.meta.product = 'V8 Heap Profile';
  profile.meta.importedFrom = 'V8 Heap Profile';
  profile.meta.categories = CATEGORIES;

  const thread = getEmptyThread();
  // KTODO: If name is defaulted for heapprofile, it has this info?
  thread.pid = '0';
  thread.tid = 0;
  thread.name = 'Total Allocated Bytes';

  const funcKeyToFuncId = new Map<string, number>();
  const nodeIdToStackId = new Map<NodeId, IndexIntoStackTable>();
  const allocationsTable = getEmptyUnbalancedNativeAllocationsTable();
  const { funcTable, stringTable, frameTable, stackTable } = thread;

  const { head, samples } = coerce<mixed, SamplingHeapProfile>(json);
  // Traverse the tree and populate the tables.
  // Each entry of the traversal stack is a pair (heap node, stack table index of parent node).
  const traversalStack = [[head, null]];
  while (traversalStack.length) {
    const [node, prefixStackIndex] = traversalStack.pop();

    const { functionName, url, scriptId, lineNumber, columnNumber } =
      node.callFrame;
    // Line and column number are 1-based in the firefox profiler.
    const line = lineNumber >= 0 ? lineNumber + 1 : null;
    const column = columnNumber >= 0 ? columnNumber + 1 : null;
    const funcKey = `${functionName}:${scriptId}:${line || 0}:${column || 0}`;
    let funcId = funcKeyToFuncId.get(funcKey);
    if (funcId === undefined) {
      funcId = funcTable.length++;
      funcKeyToFuncId.set(funcKey, funcId);

      const funcInfo = getFunctionInfo(node.callFrame);
      funcTable.isJS.push(funcInfo.isJS);
      funcTable.relevantForJS.push(funcInfo.relevantForJS);
      funcTable.name.push(
        stringTable.indexForString(functionName || '(anonymous)')
      );
      funcTable.resource.push(-1);
      funcTable.fileName.push(stringTable.indexForString(url));
      funcTable.lineNumber.push(line);
      funcTable.columnNumber.push(column);

      // The frame table is being populated here too because we don't get any new information,
      // so they can be deduplicated.
      frameTable.address.push(-1);
      frameTable.category.push(funcInfo.category);
      frameTable.subcategory.push(funcInfo.subcategory);
      frameTable.func.push(funcId);
      frameTable.nativeSymbol.push(null);
      frameTable.innerWindowID.push(0);
      frameTable.implementation.push(null);
      frameTable.line.push(line);
      frameTable.column.push(column);
      frameTable.length++;
    }

    if (samples.length) {
      // If we have samples, the allocation table will be populated later with samples instead.
      nodeIdToStackId.set(node.id, stackTable.length);
    } else {
      allocationsTable.time.push(0);
      allocationsTable.stack.push(stackTable.length);
      allocationsTable.weight.push(node.selfSize);
      allocationsTable.length++;
    }

    stackTable.frame.push(funcId);
    stackTable.category.push(ensureExists(frameTable.category[funcId]));
    stackTable.subcategory.push(ensureExists(frameTable.subcategory[funcId]));
    stackTable.prefix.push(prefixStackIndex);
    traversalStack.push(
      ...node.children.map((child) => [child, stackTable.length])
    );
    stackTable.length++;
  }

  // Go over the samples by ascending ordinals since allocationsTable needs to be ordered.
  // Reference for how samples was meant to be used:
  // https://source.chromium.org/chromium/chromium/src/+/main:third_party/devtools-frontend/src/front_end/panels/profiler/HeapProfileView.ts;l=560-565;bpv=0;bpt=0
  for (const sample of [...samples].sort((a, b) => a.ordinal - b.ordinal)) {
    const { ordinal, nodeId, size } = sample;
    allocationsTable.time.push(ordinal);
    allocationsTable.stack.push(ensureExists(nodeIdToStackId.get(nodeId)));
    allocationsTable.weight.push(size);
    allocationsTable.length++;
  }

  thread.nativeAllocations = allocationsTable;
  profile.threads = [thread];
  if (samples.length) {
    profile.counters = [
      {
        name: 'Memory',
        category: 'Memory',
        description: 'Graph of total allocated memory',
        pid: '0',
        mainThreadIndex: 0,
        sampleGroups: [
          {
            id: 0,
            samples: {
              time: allocationsTable.time,
              count: allocationsTable.weight,
              length: allocationsTable.length,
            },
          },
        ],
      },
    ];
  }
  return profile;
}
