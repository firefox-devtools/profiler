/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  IndexIntoStringTable,
  IndexIntoCategoryList,
  PausedRange,
  CategoryList,
  PageList,
  JsTracerTable,
  ProfilerOverheadStats,
  VisualMetrics,
  ProfilerConfiguration,
  SampleUnits,
} from './profile';
import {
  MarkerPayload_Gecko,
  MarkerDisplayLocation,
  MarkerFormatType,
  MarkerGraph,
} from './markers';
import { Milliseconds, Nanoseconds, MemoryOffset, Bytes } from './units';

export type IndexIntoGeckoFrameTable = number;
export type IndexIntoGeckoStackTable = number;

// These integral values are exported in the JSON of the profile, and are in the
// RawMarkerTable. They represent a C++ class in Gecko that defines the type of
// marker it is. These markers are then combined together to form the Marker[] type.
// See deriveMarkersFromRawMarkerTable for more information. Also see the constants.js
// file for JS values that can be used to refer to the different phases.
//
// From the C++:
//
// enum class MarkerPhase : int {
//   Instant = 0,
//   Interval = 1,
//   IntervalStart = 2,
//   IntervalEnd = 3,
// };
export type MarkerPhase = 0 | 1 | 2 | 3;

export type GeckoMarkerTuple = [
  IndexIntoStringTable,
  Milliseconds | null,
  Milliseconds | null,
  MarkerPhase,
  IndexIntoCategoryList,
  MarkerPayload_Gecko | null,
];

type GeckoMarkerSchema = {
  name: 0;
  startTime: 1;
  endTime: 2;
  phase: 3;
  category: 4;
  data: 5;
};

export type GeckoMarkers = {
  schema: GeckoMarkerSchema;
  data: Array<GeckoMarkerTuple>;
};

export type ExternalMarkerTuple = [
  string,
  Milliseconds | null,
  Milliseconds | null,
  MarkerPhase,
  IndexIntoCategoryList,
  MarkerPayload_Gecko | null,
];

export type ExternalMarkers = {
  schema: GeckoMarkerSchema;
  data: Array<ExternalMarkerTuple>;
};

export type ExternalMarkersData =
  | {
      markerSchema: GeckoMetaMarkerSchema[];
      categories: CategoryList;
      markers: ExternalMarkers;
    }
  | {};

/**
 * These structs aren't very DRY, but it is a simple and complete approach.
 * These structs are the initial transformation of the Gecko data to the
 * processed format. See `docs-developer/gecko-profile-format.md` for more
 * information.
 */
export type GeckoMarkerStruct = {
  name: IndexIntoStringTable[];
  startTime: Milliseconds[];
  endTime: Milliseconds[];
  phase: MarkerPhase[];
  data: Array<MarkerPayload_Gecko | null>;
  category: IndexIntoCategoryList[];
  length: number;
};

export type GeckoMarkerStack = {
  name: 'SyncProfile';
  registerTime: null;
  unregisterTime: null;
  processType: string;
  tid: number;
  pid: number;
  markers: GeckoMarkers;
  samples: GeckoSamples;
};

export type GeckoSamples = {
  schema:
    | {
        stack: 0;
        time: 1;
        responsiveness: 2;
      }
    | {
        stack: 0;
        time: 1;
        eventDelay: 2;
        threadCPUDelta?: 3;
      };
  data: Array<
    | [
        null | IndexIntoGeckoStackTable,
        Milliseconds, // since profile.meta.startTime
        // milliseconds since the last event was processed in this
        // thread's event loop at the time that the sample was taken
        Milliseconds,
      ]
    | [
        null | IndexIntoGeckoStackTable,
        Milliseconds, // since profile.meta.startTime
        // milliseconds since the last event was processed in this
        // thread's event loop at the time that the sample was taken
        Milliseconds,
        // CPU usage value of the current thread.
        // It's present only when the CPU Utilization feature is enabled in Firefox.
        number | null,
      ]
  >;
};

// Older profiles have samples with `responsiveness` values.
export type GeckoSampleStructWithResponsiveness = {
  stack: Array<null | IndexIntoGeckoStackTable>;
  time: Milliseconds[];
  responsiveness: Array<Milliseconds | null>;
  // CPU usage value of the current thread. Its values are null only if the back-end
  // fails to get the CPU usage from operating system.
  // It's landed in Firefox 86, and it is optional because older profile
  // versions may not have it or that feature could be disabled. No upgrader was
  // written for this change because it's a completely new data source.
  threadCPUDelta?: Array<number | null>;
  length: number;
};

// Newer profiles have the improved version of `responsiveness`, `eventDelay`.
export type GeckoSampleStructWithEventDelay = {
  stack: Array<null | IndexIntoGeckoStackTable>;
  time: Milliseconds[];
  eventDelay: Array<Milliseconds | null>;
  // CPU usage value of the current thread. Its values are null only if the back-end
  // fails to get the CPU usage from operating system.
  // It's landed in Firefox 86, and it is optional because older profile
  // versions may not have it or that feature could be disabled. No upgrader was
  // written for this change because it's a completely new data source.
  threadCPUDelta?: Array<number | null>;
  length: number;
};

export type GeckoSampleStruct =
  | GeckoSampleStructWithResponsiveness
  | GeckoSampleStructWithEventDelay;

export type GeckoFrameTable = {
  schema: {
    location: 0;
    relevantForJS: 1;
    innerWindowID: 2;
    implementation: 3;
    line: 4;
    column: 5;
    category: 6;
    subcategory: 7;
  };
  data: Array<
    [
      // index into stringTable, points to strings like:
      // JS: "Startup::XRE_Main"
      // C++: "0x7fff7d962da1"
      // For native frames, i.e. strings of the form "0xHEX", the number value is a code
      // address in the process's virtual memory. These addresses have been observed from
      // the instruction pointer register, or from stack walking. Addresses from stack
      // walking are return addresses, i.e. they point at the instruction *after* the call
      // instruction.
      // For native frames from arm32, the address must have its Thumb bit masked off, i.e.
      // they must be a 2-byte aligned value (so that they can be interpreted as an instruction
      // address). See also https://phabricator.services.mozilla.com/D121930.
      IndexIntoStringTable,
      // for label frames, whether this frame should be shown in "JS only" stacks
      boolean,
      // innerWindowID of JS frames. See the comment inside FrameTable in src/types/profile.js
      // for more information.
      null | number,
      // for JS frames, an index into the string table, usually "Baseline" or "Ion"
      null | IndexIntoStringTable,
      // The line of code
      null | number,
      // The column of code
      null | number,
      // index into profile.meta.categories
      null | number,
      // index into profile.meta.categories[category].subcategories. Always non-null if category is non-null.
      null | number,
    ]
  >;
};

export type IndexIntoGeckoThreadStringTable = number;

export type GeckoFrameStruct = {
  location: IndexIntoGeckoThreadStringTable[];
  relevantForJS: Array<boolean>;
  implementation: Array<null | IndexIntoGeckoThreadStringTable>;
  line: Array<null | number>;
  column: Array<null | number>;
  category: Array<null | number>;
  subcategory: Array<null | number>;
  innerWindowID: Array<null | number>;
  length: number;
};

export type GeckoStackTable = {
  schema: {
    prefix: 0;
    frame: 1;
  };
  data: Array<[IndexIntoGeckoStackTable | null, IndexIntoGeckoFrameTable]>;
};

export type GeckoStackStruct = {
  frame: IndexIntoGeckoFrameTable[];
  prefix: Array<IndexIntoGeckoStackTable | null>;
  length: number;
};

export type GeckoThread = {
  name: string;
  // The eTLD+1 of the isolated content process if provided by the back-end.
  // It will be undefined if:
  // - Fission is not enabled.
  // - It's not an isolated content process.
  // - It's a profile from an older Firefox which doesn't include this field (introduced in Firefox 80).
  'eTLD+1'?: string;
  // If present and true, this thread was launched for a private browsing
  // session only.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // doesn't have any non-origin attribute (this happens in non-Fission
  // especially but also in Fission for normal threads).
  isPrivateBrowsing?: boolean;
  // If present, the number represents the container this thread was loaded in.
  // It's absent in Firefox 97 and before, or in Firefox 98+ when this thread
  // doesn't have any non-origin attribute (this happens in non-Fission
  // especially but also in Fission for normal threads).
  userContextId?: number;
  registerTime: number;
  processType: string;
  processName?: string;
  unregisterTime: number | null;
  tid: number;
  pid: number;
  markers: GeckoMarkers;
  samples: GeckoSamples;
  frameTable: GeckoFrameTable;
  stackTable: GeckoStackTable;
  stringTable: string[];
  jsTracerEvents?: JsTracerTable;
};

export type GeckoExtensionMeta = {
  schema: {
    id: 0;
    name: 1;
    baseURL: 2;
  };
  data: Array<[string, string, string]>;
};

export type GeckoCounter = {
  name: string;
  category: string;
  description: string;
  samples: {
    schema: {
      time: 0;
      count: 1;
      number: 2;
    };
    data: readonly [number, number, number][];
  };
};

export type GeckoCounterSamplesStruct = {
  time: Milliseconds[];
  count: number[];
  number?: number[];
  length: number;
};

export type GeckoProfilerOverhead = {
  samples: {
    schema: {
      time: 0;
      locking: 1;
      expiredMarkerCleaning: 2;
      counters: 3;
      threads: 4;
    };
    data: Array<
      [Nanoseconds, Nanoseconds, Nanoseconds, Nanoseconds, Nanoseconds]
    >;
  };
  // There is no statistics object if there is no sample.
  statistics?: ProfilerOverheadStats;
};

export type GeckoDynamicFieldSchemaData = {
  // The property key of the marker data property that carries the field value.
  key: string;

  // An optional user-facing label.
  // If no label is provided, the key is displayed instead.
  label?: string;

  // The format / type of this field. This affects how the field's value is
  // displayed and determines which types of values are accepted for this field.
  format: MarkerFormatType;

  // If present and set to true, the marker search string will be matched
  // against the values of this field when determining which markers match the
  // search.
  searchable?: boolean;

  // If present and set to true, this field will not be shown in the list
  // of fields in the tooltip or in the sidebar. Such fields can still be
  // used inside labels and they can be searchable.
  hidden?: boolean;
};

export type GeckoStaticFieldSchemaData = {
  // This type is a static bit of text that will be displayed
  label: string;
  value: string;
};

export type GeckoMetaMarkerSchema = {
  // The unique identifier for this marker.
  name: string; // e.g. "CC"

  // The label of how this marker should be displayed in the UI.
  // If none is provided, then the name is used.
  tooltipLabel?: string; // e.g. "Cycle Collect"

  // This is how the marker shows up in the Marker Table description.
  // If none is provided, then the name is used.
  tableLabel?: string; // e.g. "{marker.data.eventType} – DOMEvent"

  // This is how the marker shows up in the Marker Chart, where it is drawn
  // on the screen as a bar.
  // If none is provided, then the name is used.
  chartLabel?: string;

  // The locations to display
  display: MarkerDisplayLocation[];

  data: Array<GeckoDynamicFieldSchemaData | GeckoStaticFieldSchemaData>;

  // if present, give the marker its own local track
  graphs?: Array<MarkerGraph>;

  // If set to true, markers of this type are assumed to be well-nested with all
  // other stack-based markers on the same thread. Stack-based markers may
  // be displayed in a different part of the marker chart than non-stack-based
  // markers.
  // Instant markers are always well-nested.
  // For interval markers, or for intervals defined by a start and an end marker,
  // well-nested means that, for all marker-defined timestamp intervals A and B,
  // A either fully encompasses B or is fully encompassed by B - there is no
  // partial overlap.
  isStackBased?: boolean;
};

/* This meta object is used in subprocesses profiles.
 * Using https://searchfox.org/mozilla-central/rev/7556a400affa9eb99e522d2d17c40689fa23a729/tools/profiler/core/platform.cpp#1829
 * as source of truth. (Please update the link whenever there's a new property).
 * */
export type GeckoProfileShortMeta = {
  version: number;
  // When the main process started. Timestamp expressed in milliseconds since
  // midnight January 1, 1970 GMT.
  startTime: Milliseconds;
  startTimeAsClockMonotonicNanosecondsSinceBoot?: number;
  startTimeAsMachAbsoluteTimeNanoseconds?: number;
  startTimeAsQueryPerformanceCounterValue?: number;
  shutdownTime: Milliseconds | null;
  categories: CategoryList;
  markerSchema: GeckoMetaMarkerSchema[];
};

/* This meta object is used on the top level profile object.
 * Using https://searchfox.org/mozilla-central/rev/7556a400affa9eb99e522d2d17c40689fa23a729/tools/profiler/core/platform.cpp#1829
 * as source of truth. (Please update the link whenever there's a new property).
 * */
export type GeckoProfileFullMeta = GeckoProfileShortMeta & {
  // When the recording started (in milliseconds after startTime).
  profilingStartTime?: Milliseconds;
  // When the recording ended (in milliseconds after startTime).
  profilingEndTime?: Milliseconds;
  interval: Milliseconds;
  stackwalk: 0 | 1;
  // This value represents a boolean, but for some reason is written out as an int
  // value as the previous field.
  // It's 0 for opt builds, and 1 for debug builds.
  // This property was added to Firefox Profiler a long time after it was added to
  // Firefox, that's why we don't need to make it optional for gecko profiles.
  debug: 0 | 1;
  gcpoison: 0 | 1;
  asyncstack: 0 | 1;
  processType: number;
  // The Update channel for this build of the application.
  // This property is landed in Firefox 67, and is optional because older
  // Firefox versions may not have them. No upgrader was necessary.
  updateChannel?:
    | 'default' // Local builds
    | 'nightly'
    | 'nightly-try' // Nightly try builds for QA
    | 'aurora' // Developer Edition channel
    | 'beta'
    | 'release'
    | 'esr' // Extended Support Release channel
    | string;
  // -- platform information -- This can be absent in some very rare situations.
  platform?: string;
  oscpu?: string;
  misc?: string;
  // -- Runtime -- This can be absent in some very rare situations.
  abi?: string;
  toolkit?: string;
  product?: string;
  // -- appInfo -- This can be absent in some very rare situations.
  // The appBuildID, sourceURL, physicalCPUs and logicalCPUs properties landed
  // in Firefox 62, and are only optional because older processed profile
  // versions may not have them. No upgrader was written for this change.
  appBuildID?: string;
  sourceURL?: string;
  // -- system info -- This can be absent in some very rare situations.
  physicalCPUs?: number;
  logicalCPUs?: number;
  CPUName?: string;
  // -- extensions --
  // The extensions property landed in Firefox 60, and is only optional because
  // older profile versions may not have it. No upgrader was written for this change.
  extensions?: GeckoExtensionMeta;
  // -- extra properties added by the frontend --
  // This boolean indicates whether this gecko profile includes already
  // symbolicated frames. This will be missing for profiles coming from Gecko
  // (which indicates that they'll need to be symbolicated) but may be specified
  // for profiles imported from other formats (eg: linux perf).
  presymbolicated?: boolean;
  // Visual metrics contains additional performance metrics such as Speed Index,
  // Perceptual Speed Index, and ContentfulSpeedIndex. This is optional because only
  // profiles generated by browsertime will have this property. Source code for
  // browsertime can be found at https://github.com/sitespeedio/browsertime.
  visualMetrics?: VisualMetrics;
  // Optional because older Firefox versions may not have the data.
  configuration?: ProfilerConfiguration;
  // Units of samples table values.
  // The sampleUnits property landed in Firefox 86, and is only optional because
  // older profile versions may not have it. No upgrader was written for this change.
  sampleUnits?: SampleUnits;
  // Information of the device that profile is captured from.
  // Currently it's only present for Android devices and it includes brand and
  // model names of that device.
  // It's optional because profiles from non-Android devices and from older
  // Firefox versions may not have it.
  // This property landed in Firefox 88.
  device?: string;
};

/**
 * Information about libraries, for instance the Firefox executables, and its memory
 * offsets. This information is used for symbolicating C++ memory addresses into
 * actual function names. For instance turning 0x23459234 into "void myFuncName()".
 *
 * Libraries are mapped into the (virtual memory) address space of the profiled
 * process. Libraries exist as files on disk, and not the entire file needs to be
 * mapped. When the beginning of the file is not mapped, the library's "offset"
 * field will be non-zero.
 *
 * These LibMapping objects are present in the Gecko profile format, stored in
 * one list per process. In the processed profile format, they are are converted
 * to Lib objects which don't have mapping address information and which are
 * shared between all processes in the profile.
 */
export type LibMapping = {
  // The range in the address space of the profiled process that the mappings for
  // this shared library occupied.
  start: MemoryOffset;
  end: MemoryOffset;

  // The offset relative to the library's base address where the first mapping starts.
  // libBaseAddress + lib.offset = lib.start
  // When instruction addresses are given as library-relative offsets, they are
  // relative to the library's baseAddress.
  offset: Bytes;

  arch: string; // e.g. "x86_64"
  name: string; // e.g. "firefox"
  path: string; // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  debugName: string; // e.g. "firefox", or "firefox.pdb" on Windows
  debugPath: string; // e.g. "/Applications/FirefoxNightly.app/Contents/MacOS/firefox"
  breakpadId: string; // e.g. "E54D3AF274383256B9F6144F83F3F7510"
  codeId?: string; // e.g. "6132B96B70fd000"
};

/**
 * Log object that holds the profiling-related logging information for a
 * single process only. This is optional and older profiles don't have it.
 * This type might also change in the future without warning.
 */
export type ProcessProfilingLog = {
  [log: string]: unknown;
};

/**
 * Log object that holds the profiling-related logging information.
 * This is optional and older profiles don't have it.
 * This type might also change in the future without warning.
 */
export type ProfilingLog = {
  [pid: number]: ProcessProfilingLog;
};

export type GeckoProfileWithMeta<Meta> = {
  counters?: GeckoCounter[];
  // Optional because older Firefox versions may not have that data and
  // no upgrader was necessary.
  profilerOverhead?: GeckoProfilerOverhead;
  meta: Meta;
  libs: LibMapping[];
  pages?: PageList;
  threads: GeckoThread[];
  pausedRanges: PausedRange[];
  processes: GeckoSubprocessProfile[];
  jsTracerDictionary?: string[];
  // Logs are optional because older Firefox versions may not have that data.
  profilingLog?: ProfilingLog;
  profileGatheringLog?: ProfilingLog;
};

export type GeckoSubprocessProfile =
  GeckoProfileWithMeta<GeckoProfileShortMeta>;
export type GeckoProfile = GeckoProfileWithMeta<GeckoProfileFullMeta>;
