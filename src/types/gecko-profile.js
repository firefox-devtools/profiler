/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Lib, IndexIntoStringTable, PausedRange } from './profile';
import type { MarkerPayload } from './markers';
import type { Milliseconds } from './units';

export type IndexIntoGeckoFrameTable = number;
export type IndexIntoGeckoStackTable = number;

export type GeckoMarkers = {
  schema: { name: 0, time: 1, data: 2 },
  data: Array<[IndexIntoStringTable, Milliseconds, MarkerPayload]>,
};

/**
 * These structs aren't very DRY, but it is a simple and complete approach.
 * These structs are the initial transformation of the Gecko data to the
 * processed format.
 */
export type GeckoMarkerStruct = {
  name: IndexIntoStringTable[],
  time: Milliseconds[],
  data: MarkerPayload[],
  length: number,
};

export type GeckoSamples = {
  schema: {
    stack: 0,
    time: 1,
    responsiveness: 2,
    rss: 3,
    uss: 4,
  },
  data: Array<
    [
      null | IndexIntoGeckoStackTable,
      Milliseconds, // since profile.meta.startTime
      // milliseconds since the last event was processed in this
      // thread's event loop at the time that the sample was taken
      Milliseconds,
      any, // TODO
      any, // TODO
    ]
  >,
};

export type GeckoSampleStruct = {
  stack: Array<null | IndexIntoGeckoStackTable>,
  time: Milliseconds[],
  responsiveness: Milliseconds[],
  rss: any[],
  uss: any[],
  length: number,
};

export type GeckoFrameTable = {
  schema: {
    location: 0,
    implementation: 1,
    optimizations: 2,
    line: 3,
    category: 4,
  },
  data: Array<
    [
      // index into stringTable, points to strings like:
      // JS: "Startup::XRE_Main"
      // C++: "0x7fff7d962da1"
      IndexIntoStringTable,
      // for JS frames, an index into the string table, usually "Baseline" or "Ion"
      null | IndexIntoStringTable,
      // JSON info about JIT optimizations.
      null | Object,
      // The line of code
      null | number,
      // int bitmask of the category
      // 16 - js::ProfileEntry::Category::OTHER
      // 32 - js::ProfileEntry::Category::CSS
      // 64 - js::ProfileEntry::Category::JS
      // 128 - js::ProfileEntry::Category::GC
      // 256 - js::ProfileEntry::Category::CC
      // 512 - js::ProfileEntry::Category::NETWORK
      // 1024 - js::ProfileEntry::Category::GRAPHICS
      // 2048 - js::ProfileEntry::Category::STORAGE
      // 4096 - js::ProfileEntry::Category::EVENTS
      // 9000 - other non-bitmask category
      null | number,
    ]
  >,
};

export type GeckoFrameStruct = {
  location: IndexIntoStringTable[],
  implementation: Array<null | IndexIntoStringTable>,
  optimizations: Array<null | Object>,
  line: Array<null | number>,
  category: Array<null | number>,
  length: number,
};

export type GeckoStackTable = {
  schema: {
    frame: 0,
    prefix: 1,
  },
  data: Array<[IndexIntoGeckoFrameTable, IndexIntoGeckoStackTable | null]>,
};

export type GeckoStackStruct = {
  frame: IndexIntoGeckoFrameTable[],
  prefix: Array<IndexIntoGeckoStackTable | null>,
  length: number,
};

export type GeckoThread = {
  name: string,
  processType: string,
  registerTime: number,
  unregisterTime: number | null,
  tid: number,
  pid: number,
  markers: GeckoMarkers,
  samples: GeckoSamples,
  frameTable: GeckoFrameTable,
  stackTable: GeckoStackTable,
  stringTable: string[],
};

export type GeckoProfile = {
  meta: {|
    interval: Milliseconds,
    startTime: Milliseconds,
    shutdownTime: Milliseconds | null,
    abi: string,
    misc: string,
    oscpu: string,
    platform: string,
    processType: number,
    product: string,
    stackwalk: number,
    toolkit: string,
    version: number,
  |},
  libs: Lib[],
  threads: GeckoThread[],
  pausedRanges: PausedRange[],
  tasktracer?: Object,
  processes: GeckoProfile[],
};
