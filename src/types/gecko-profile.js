/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  Lib,
  IndexIntoStringTable,
  PausedRange,
  CategoryList,
  PageList,
} from './profile';
import type { MarkerPayload_Gecko } from './markers';
import type { Milliseconds } from './units';

export type IndexIntoGeckoFrameTable = number;
export type IndexIntoGeckoStackTable = number;

export type GeckoMarkers = {
  schema: { name: 0, time: 1, data: 2 },
  data: Array<[IndexIntoStringTable, Milliseconds, MarkerPayload_Gecko]>,
};

/**
 * These structs aren't very DRY, but it is a simple and complete approach.
 * These structs are the initial transformation of the Gecko data to the
 * processed format. See `docs-developer/gecko-profile-format.md` for more
 * information.
 */
export type GeckoMarkerStruct = {
  name: IndexIntoStringTable[],
  time: Milliseconds[],
  data: MarkerPayload_Gecko[],
  length: number,
};

export type GeckoMarkerStack = {
  name: 'SyncProfile',
  registerTime: null,
  unregisterTime: null,
  processType: string,
  tid: number,
  pid: number,
  markers: GeckoMarkers,
  samples: GeckoSamples,
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
  responsiveness: Array<?Milliseconds>,
  rss: Array<null | Milliseconds>,
  uss: Array<null | Milliseconds>,
  length: number,
};

export type GeckoFrameTable = {
  schema: {
    location: 0,
    relevantForJS: 1,
    implementation: 2,
    optimizations: 3,
    line: 4,
    column: 5,
    category: 6,
  },
  data: Array<
    [
      // index into stringTable, points to strings like:
      // JS: "Startup::XRE_Main"
      // C++: "0x7fff7d962da1"
      IndexIntoStringTable,
      // for label frames, whether this frame should be shown in "JS only" stacks
      boolean,
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
  relevantForJS: Array<boolean>,
  implementation: Array<null | IndexIntoStringTable>,
  optimizations: Array<null | Object>,
  line: Array<null | number>,
  column: Array<null | number>,
  category: Array<null | number>,
  length: number,
};

export type GeckoStackTable = {
  schema: {
    prefix: 0,
    frame: 1,
  },
  data: Array<[IndexIntoGeckoStackTable | null, IndexIntoGeckoFrameTable]>,
};

export type GeckoStackStruct = {
  frame: IndexIntoGeckoFrameTable[],
  prefix: Array<IndexIntoGeckoStackTable | null>,
  length: number,
};

export type GeckoThread = {
  name: string,
  registerTime: number,
  processType: string,
  processName?: string,
  unregisterTime: number | null,
  tid: number,
  pid: number,
  markers: GeckoMarkers,
  samples: GeckoSamples,
  frameTable: GeckoFrameTable,
  stackTable: GeckoStackTable,
  stringTable: string[],
};

export type GeckoExtensionMeta = {|
  schema: {|
    id: 0,
    name: 1,
    baseURL: 2,
  |},
  data: Array<[string, string, string]>,
|};

export type GeckoProfileMeta = {|
  interval: Milliseconds,
  startTime: Milliseconds,
  shutdownTime: Milliseconds | null,
  abi: string,
  // The extensions property landed in Firefox 60, and is only optional because
  // older profile versions may not have it. No upgrader was written for this change.
  extensions?: GeckoExtensionMeta,
  categories: CategoryList,
  misc: string,
  oscpu: string,
  platform: string,
  processType: number,
  product: string,
  stackwalk: 0 | 1,
  toolkit: string,
  version: number,
  // The appBuildID, sourceURL, physicalCPUs and logicalCPUs properties landed
  // in Firefox 62, and are only optional because older processed profile
  // versions may not have them. No upgrader was written for this change.
  appBuildID?: string,
  sourceURL?: string,
  physicalCPUs?: number,
  logicalCPUs?: number,
|};

export type GeckoProfile = {|
  meta: GeckoProfileMeta,
  libs: Lib[],
  pages?: PageList,
  threads: GeckoThread[],
  pausedRanges: PausedRange[],
  tasktracer?: Object,
  processes: GeckoProfile[],
|};
