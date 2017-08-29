/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Milliseconds, MemoryOffset } from './units';
import type { UniqueStringArray } from '../utils/unique-string-array';
import type { MarkerPayload } from './markers';
export type IndexIntoStackTable = number;
export type IndexIntoSamplesTable = number;
export type IndexIntoMarkersTable = number;
export type IndexIntoFrameTable = number;
export type IndexIntoStringTable = number;
export type IndexIntoFuncTable = number;
export type IndexIntoResourceTable = number;
export type IndexIntoLibs = number;
export type IndexIntoTaskTracerAddresses = number;
export type categoryBitMask = number;
export type resourceTypeEnum = number;
export type ThreadIndex = number;

/**
 * The stack table is the minimal representation of a call stack. Each stack entry
 * consists of the frame at the top of the stack, and the prefix for the stack that
 * came before it. Stacks can be shared between samples.
 */
export type StackTable = {
  frame: IndexIntoFrameTable[],
  prefix: Array<IndexIntoStackTable | null>,
  length: number,
};

/**
 * The Gecko Profiler records samples of what function was currently being executed, and
 * the callstack that is associated with it. This is done at a fixed but configurable
 * rate, e.g. every 1 millisecond. This table represents the minimal amount of
 * information that is needed to represent that sampled function. Most of the entries
 * are indices into other tables.
 */
export type SamplesTable = {
  responsiveness: number[],
  stack: Array<IndexIntoStackTable | null>,
  time: number[],
  rss: any[], // TODO
  uss: any[], // TODO
  length: number,
};

/**
 * This is the base abstract class that marker payloads inherit from. This probably isn't
 * used directly in perf.html, but is provided here for mainly documentation purposes.
 */
export type ProfilerMarkerPayload = {
  type: string,
  startTime?: Milliseconds,
  endTime?: Milliseconds,
  stack?: Thread,
};

/**
 * Markers represent arbitrary events that happen within the browser. They have a
 * name, time, and potentially a JSON data payload. These can come from all over the
 * system. For instance Paint markers instrument the rendering and layout process.
 * Engineers can easily add arbitrary markers to their code without coordinating with
 * perf.html to instrument their code.
 */
export type MarkersTable = {
  data: MarkerPayload[],
  name: IndexIntoStringTable[],
  time: number[],
  length: number,
};

/**
 * Frames contain the context information about the function execution at the moment in
 * time. The relationship between frames is defined by the StackTable.
 */
export type FrameTable = {
  address: IndexIntoStringTable[],
  category: (categoryBitMask | null)[],
  func: IndexIntoFuncTable[],
  implementation: (IndexIntoStringTable | null)[],
  line: (number | null)[],
  optimizations: ({} | null)[],
  length: number,
};

/**
 * Multiple frames represent individual invocations of a function, while the FuncTable
 * holds the static information about that function. C++ samples are single memory
 * locations. However, functions span ranges of memory. During symbolication each of
 * these samples are collapsed to point to a single function rather than multiple memory
 * locations.
 */
export type FuncTable = {
  address: MemoryOffset[],
  isJS: boolean[],
  length: number,
  name: IndexIntoStringTable[],
  resource: Array<IndexIntoResourceTable | -1>,
  fileName: Array<IndexIntoStringTable | null>,
  lineNumber: Array<number | null>,
};

/**
 * The ResourceTable holds additional information about functions. It tends to contain
 * sparse arrays. Multiple functions can point to the same resource.
 */
export type ResourceTable = {
  addonId: any[], // TODO
  icon: any[], // TODO
  length: number,
  lib: Array<IndexIntoLibs | null>,
  name: Array<IndexIntoStringTable | -1>,
  host: Array<IndexIntoStringTable | null>,
  type: resourceTypeEnum[],
};

/**
 * Information about libraries, for instance the Firefox executables, and its memory
 * offsets. This information is used for symbolicating C++ memory addresses into
 * actual function names. For instance turning 0x23459234 into "void myFuncName()".
 */
export type Lib = {
  start: MemoryOffset,
  end: MemoryOffset,
  offset: MemoryOffset,
  arch: string, // e.g. "x86_64"
  name: string, // e.g. "firefox"
  path: string, // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  debugName: string, // e.g. "firefox"
  debugPath: string, // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  breakpadId: string, // e.g. "E54D3AF274383256B9F6144F83F3F7510"
};

/**
 * Information about a period of time during which no samples were collected.
 */
export type PausedRange = {
  // null if the profiler was already paused at the beginning of the period of
  // time that was present in the profile buffer
  startTime: Milliseconds | null,
  // null if the profiler was still paused when the profile was captured
  endTime: Milliseconds | null,
  reason: 'profiler-paused' | 'collecting',
};

/**
 * Gecko has one or more processes. There can be multiple threads per processes. Each
 * thread has a unique set of tables for its data.
 */
export type Thread = {
  processType: string,
  processStartupTime: Milliseconds,
  processShutdownTime: Milliseconds | null,
  registerTime: Milliseconds,
  unregisterTime: Milliseconds | null,
  pausedRanges: PausedRange[],
  name: string,
  pid: number | void,
  tid: number | void,
  samples: SamplesTable,
  markers: MarkersTable,
  stackTable: StackTable,
  frameTable: FrameTable,
  // Strings for profiles are collected into a single table, and are referred to by
  // their index by other tables.
  stringTable: UniqueStringArray,
  libs: Lib[],
  funcTable: FuncTable,
  resourceTable: ResourceTable,
};

/**
 * Meta information associated for the entire profile.
 */
export type ProfileMeta = {|
  interval: number,
  startTime: Milliseconds,
  shutdownTime: Milliseconds | null,
  abi: string,
  misc: string,
  oscpu: string,
  platform: string,
  processType: number, // TODO find the possible values
  product: string,
  stackwalk: number,
  toolkit: string,
  version: number,
  preprocessedProfileVersion: number,
|};

/**
 * TaskTracer data - TODO.
 */
export type TaskTracer = {|
  taskTable: {|
    length: number,
    dispatchTime: any[],
    sourceEventId: any[],
    sourceEventType: any[],
    parentTaskId: any[],
    beginTime: any[],
    processId: any[],
    threadIndex: any[],
    endTime: any[],
    ipdlMsg: any[],
    label: any[],
    address: any[],
  |},
  addressTable: {|
    length: number,
    address: MemoryOffset[],
    className: IndexIntoStringTable[],
    lib: Array<null | Lib>,
  |},
  threadTable: {|
    length: number,
    tid: any[],
    name: any[],
    start: any[],
  |},
  tasksIdToTaskIndexMap: Map<any, any>,
  addressIndicesByLib: Map<Lib, MemoryOffset[]>,
  stringTable: UniqueStringArray,
  tidToThreadIndexMap: Map<any, any>,
|};

/**
 * All of the data for a processed profile.
 */
export type Profile = {
  meta: ProfileMeta,
  tasktracer: TaskTracer,
  threads: Thread[],
};
