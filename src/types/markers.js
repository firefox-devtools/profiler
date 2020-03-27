/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Milliseconds, Microseconds, Seconds, Bytes } from './units';
import type { GeckoMarkerStack } from './gecko-profile';
import type { IndexIntoStackTable, IndexIntoStringTable } from './profile';

/**
 * Markers can include a stack. These are converted to a cause backtrace, which includes
 * the time the stack was taken. Sometimes this cause can be async, and triggered before
 * the marker, or it can be synchronous, and the time is contained within the marker's
 * start and end time.
 */
export type CauseBacktrace = {|
  time: Milliseconds,
  stack: IndexIntoStackTable,
|};

/**
 * This type holds data that should be synchronized between the sender and
 * recipient sides of an IPC marker.
 */
export type IPCPairData = {|
  startTime: Milliseconds,
  endTime: Milliseconds,
  otherTid: number,
  otherThreadName: string,
|};

/**
 * This utility type removes the "cause" property from a payload, and replaces it with
 * a stack. This effectively converts it from a processed payload to a Gecko payload.
 */
export type $ReplaceCauseWithStack<T: Object> = {|
  ...$Diff<
    T,
    // Remove the cause property.
    {| cause: any |}
  >,
  // Add on the stack property:
  stack?: GeckoMarkerStack,
|};

/**
 * Measurement for how long draw calls take for the compositor.
 */
export type GPUMarkerPayload = {|
  type: 'gpu_timer_query',
  startTime: Milliseconds, // Same as cpustart
  endTime: Milliseconds, // Same as cpuend
  cpustart: Milliseconds,
  cpuend: Milliseconds,
  gpustart: Milliseconds, // Always 0.
  gpuend: Milliseconds, // The time the GPU took to execute the command.
|};

/**
 * These markers don't have a start and end time. They work in pairs, one
 * specifying the start, the other specifying the end of a specific tracing
 * marker.
 */

export type PaintProfilerMarkerTracing = {|
  type: 'tracing',
  category: 'Paint',
  cause?: CauseBacktrace,
  interval: 'start' | 'end',
|};

export type ArbitraryEventTracing = {|
  +type: 'tracing',
  +category: string,
|};

export type CcMarkerTracing = {|
  type: 'tracing',
  category: 'CC',
  interval: 'start' | 'end',
|};

export type PhaseTimes<Unit> = { [phase: string]: Unit };

type GCSliceData_Shared = {|
  // Slice number within the GCMajor collection.
  slice: number,

  pause: Milliseconds,

  // The reason for this slice.
  reason: string,

  // The GC state at the start and end of this slice.
  initial_state: string,
  final_state: string,

  // The incremental GC budget for this slice (see pause above).
  budget: string,

  // The number of the GCMajor that this slice belongs to.
  major_gc_number: number,

  // These are present if the collection was triggered by exceeding some
  // threshold.  The reason field says how they should be interpreted.
  trigger_amount?: number,
  trigger_threshold?: number,

  // The number of page faults that occured during the slice.  If missing
  // there were 0 page faults.
  page_faults?: number,

  start_timestamp: Seconds,
|};
export type GCSliceData_Gecko = {|
  ...GCSliceData_Shared,
  times: PhaseTimes<Milliseconds>,
|};
export type GCSliceData = {|
  ...GCSliceData_Shared,
  phase_times: PhaseTimes<Microseconds>,
|};

export type GCMajorAborted = {|
  status: 'aborted',
|};

type GCMajorCompleted_Shared = {|
  status: 'completed',
  // timestamp is present but is usually 0
  timestamp: number,
  max_pause: Milliseconds,

  // The sum of all the slice durations
  total_time: Milliseconds,

  // The reason from the first slice. see JS::gcreason::Reason
  reason: string,

  // Counts.
  zones_collected: number,
  total_zones: number,
  total_compartments: number,
  minor_gcs: number,
  // Present when non-zero.
  store_buffer_overflows?: number,
  slices: number,

  // Timing for the SCC sweep phase.
  scc_sweep_total: Milliseconds,
  scc_sweep_max_pause: Milliseconds,

  // The reason why this GC ran non-incrementally. Older profiles could have the string
  // 'None' as a reason.
  nonincremental_reason?: 'None' | string,

  // The allocated space for the whole heap before the GC started.
  allocated_bytes: number,
  post_heap_size?: number,

  // Only present if non-zero.
  added_chunks?: number,
  removed_chunks?: number,

  // The number for the start of this GC event.
  major_gc_number: number,
  minor_gc_number: number,

  // Slice number isn't in older profiles.
  slice_number?: number,

  // This usually isn't present with the gecko profiler, but it's the same
  // as all of the slice markers themselves.
  slices_list?: GCSliceData[],
|};

export type GCMajorCompleted = {|
  ...GCMajorCompleted_Shared,
  // MMU (Minimum mutator utilisation) A measure of GC's affect on
  // responsiveness  See Statistics::computeMMU(), these percentages in the
  // rage of 0-100.
  // Percentage of time the mutator ran in a 20ms window.
  mmu_20ms: number,
  // Percentage of time the mutator ran in a 50ms window.
  mmu_50ms: number,

  // The duration of each phase.
  phase_times: PhaseTimes<Microseconds>,
|};

export type GCMajorCompleted_Gecko = {|
  ...GCMajorCompleted_Shared,
  // As above except in parts of 100.
  mmu_20ms: number,
  mmu_50ms: number,
  totals: PhaseTimes<Milliseconds>,
|};

export type GCMajorMarkerPayload = {|
  type: 'GCMajor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCMajorAborted | GCMajorCompleted,
|};

export type GCMajorMarkerPayload_Gecko = {|
  type: 'GCMajor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCMajorAborted | GCMajorCompleted_Gecko,
|};

export type GCMinorCompletedData = {|
  status: 'complete',

  // The reason for initiating the GC.
  reason: string,

  // The size of the data moved into the tenured heap.
  bytes_tenured: number,
  // The number of cells tenured (since
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1473213)
  cells_tenured?: number,

  // The numbers of cells allocated since the previous minor GC.
  // These were added in
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1473213 and are only
  // present in Nightly builds.
  cells_allocated_nursery?: number,
  cells_allocated_tenured?: number,

  // The total amount of data that was allocated in the nursery.
  bytes_used: number,

  // The total capacity of the nursery before and after this GC.
  // Capacity may change as the nursery size is tuned after each collection.
  // cur_capacity isn't in older profiles.
  cur_capacity?: number,

  // If the nursery is resized after this collection then this field is
  // present giving the new size.
  new_capacity?: number,

  // The nursery may be dynamically resized (since version 58)
  // this field is the lazy-allocated size.  It is not present in older
  // versions.
  // If the currently allocated size is different from the size
  // (cur_capacity) then this field is present and shows how much memory is
  // actually allocated.
  lazy_capacity?: number,

  chunk_alloc_us?: Microseconds,

  // Added in https://bugzilla.mozilla.org/show_bug.cgi?id=1507379
  groups_pretenured?: number,

  phase_times: PhaseTimes<Microseconds>,
|};

export type GCMinorDisabledData = {|
  status: 'nursery disabled',
|};
export type GCMinorEmptyData = {|
  status: 'nursery empty',
|};

export type GCMinorMarkerPayload = {|
  type: 'GCMinor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  // nursery is only present in newer profile format.
  nursery?: GCMinorCompletedData | GCMinorDisabledData | GCMinorEmptyData,
|};

export type GCSliceMarkerPayload = {|
  type: 'GCSlice',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCSliceData,
|};

export type GCSliceMarkerPayload_Gecko = {|
  type: 'GCSlice',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCSliceData_Gecko,
|};

/**
 * The bailout payload describes a bailout from JIT code where some assumption in
 * the optimization was broken, and the code had to fall back to Baseline. Currently
 * this information is encoded as a string and extracted as a selector.
 */
export type BailoutPayload = {|
  type: 'Bailout',
  bailoutType: string,
  where: string,
  script: string,
  bailoutLine: number,
  functionLine: number | null,
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

/**
 * TODO - Please describe an invalidation.
 */
export type InvalidationPayload = {|
  type: 'Invalidation',
  url: string,
  line: number | null,
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

/**
 * Network http/https loads - one marker for each load that reaches the
 * STOP state that occurs, plus one for the initial START of the load, with
 * the URI and the status.  A unique ID is included to allow these to be linked.
 * Note that the 'name' field currently also has the id ("Load N") so that
 * marker.js will not merge separate loads of the same URI.  Note also that
 * URI is not necessarily included in later network markers for a specific
 * load to avoid having to use cycles during collection to access, allocate
 * and copy the URI.  Markers using the same ID are all for the same load.
 *
 * Most of the fields only are included on STOP, and not all of them may
 * be included depending on what states happen during the load.  Also note
 * that redirects are logged as well.
 */

export type NetworkPayload = {|
  type: 'Network',
  URI: string,
  RedirectURI?: string,
  id: number,
  pri: number, // priority of the load; always included as it can change
  count?: number, // Total size of transfer, if any
  status: string,
  cache?: string,
  contentType?: string,

  // NOTE: the following comments are valid for the merged markers. For the raw
  // markers, startTime and endTime have different meanings. Please look
  // `src/profile-logic/marker-data.js` for more information.

  // startTime is when the channel opens. This happens on the process' main
  // thread.
  startTime: Milliseconds,
  // endTime is the time when the response is sent back to the caller, this
  // happens on the process' main thread.
  endTime: Milliseconds,

  // fetchStart doesn't exist directly in raw markers. This is added in the
  // deriving process and represents the junction between START and END markers.
  // This is the same value as the start marker's endTime and the end marker's
  // startTime (which are the same values).
  // We don't expose it directly but this is useful for debugging.
  fetchStart?: Milliseconds,

  // The following properties are present only in non-START markers.
  // domainLookupStart, if present, should be the first timestamp for an event
  // happening on the socket thread. However it's not present for persisted
  // connections. This is also the case for `domainLookupEnd`, `connectStart`,
  // `tcpConnectEnd`, `secureConnectionStart`, and `connectEnd`.
  // NOTE: If you add a new property, don't forget to adjust its timestamp in
  // `adjustMarkerTimestamps` in `process-profile.js`.
  domainLookupStart?: Milliseconds,
  domainLookupEnd?: Milliseconds,
  connectStart?: Milliseconds,
  tcpConnectEnd?: Milliseconds,
  secureConnectionStart?: Milliseconds,
  connectEnd?: Milliseconds,
  // `requestStart`, `responseStart` and `responseEnd` should always be present
  // for STOP markers.
  requestStart?: Milliseconds,
  responseStart?: Milliseconds,
  // responseEnd is when we received the response from the server, this happens
  // on the socket thread.
  responseEnd?: Milliseconds,
|};

export type FileIoPayload = {|
  type: 'FileIO',
  startTime: number,
  endTime: number,
  cause?: CauseBacktrace,
  source: string,
  operation: string,
  filename: string,
|};

/**
 * The payload for the UserTimings API. These are added through performance.measure()
 * and performance.mark(). https://developer.mozilla.org/en-US/docs/Web/API/Performance
 */
export type UserTimingMarkerPayload = {|
  type: 'UserTiming',
  startTime: Milliseconds,
  endTime: Milliseconds,
  name: string,
  entryType: 'measure' | 'mark',
|};

export type TextMarkerPayload = {|
  type: 'Text',
  name: string,
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

/**
 * Gecko includes rich log information. This marker payload is used to mirror that
 * log information in the profile.
 */
export type LogMarkerPayload = {|
  type: 'Log',
  name: string,
  module: string,
|};

export type DOMEventMarkerPayload = {|
  type: 'tracing',
  category: 'DOMEvent',
  timeStamp?: Milliseconds,
  interval: 'start' | 'end',
  eventType: string,
  phase: 0 | 1 | 2 | 3,
  innerWindowID?: number,
|};

export type PrefMarkerPayload = {|
  type: 'PreferenceRead',
  startTime: Milliseconds,
  endTime: Milliseconds,
  prefAccessTime: Milliseconds,
  prefName: string,
  prefKind: string,
  prefType: string,
  prefValue: string,
|};

export type NavigationMarkerPayload = {|
  type: 'tracing',
  category: 'Navigation',
  interval: 'start' | 'end',
  eventType?: string,
  innerWindowID?: number,
|};

type VsyncTimestampPayload = {|
  type: 'VsyncTimestamp',
|};

export type ScreenshotPayload = {|
  type: 'CompositorScreenshot',
  // This field represents the data url of the image. It is saved in the string table.
  url: IndexIntoStringTable,
  // A memory address that can uniquely identify a window. It has no meaning other than
  // a way to identify a window.
  windowID: string,
  // The original dimensions of the window that was captured. The actual image that is
  // stored in the string table will be scaled down from the original size.
  windowWidth: number,
  windowHeight: number,
|};

export type StyleMarkerPayload = {|
  type: 'Styles',
  category: 'Paint',
  startTime: Milliseconds,
  endTime: Milliseconds,
  cause?: CauseBacktrace,

  // Counts
  elementsTraversed: number,
  elementsStyled: number,
  elementsMatched: number,
  stylesShared: number,
  stylesReused: number,
|};

export type BHRMarkerPayload = {|
  type: 'BHR-detected hang',
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

export type LongTaskMarkerPayload = {|
  type: 'MainThreadLongTask',
  category: 'LongTask',
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

/*
 * The payload for Frame Construction.
 */
export type FrameConstructionMarkerPayload = {|
  type: 'tracing',
  category: 'Frame Construction',
  interval: 'start' | 'end',
|};

export type DummyForTestsMarkerPayload = {|
  type: 'DummyForTests',
  startTime: Milliseconds,
  endTime: Milliseconds,
|};

export type JsAllocationPayload_Gecko = {|
  type: 'JS allocation',
  startTime: Milliseconds,
  endTime: Milliseconds,
  className: string,
  typeName: string, // Currently only 'JSObject'
  coarseType: string, // Currently only 'Object',
  size: Bytes,
  inNursery: boolean,
  stack: GeckoMarkerStack,
|};

export type NativeAllocationPayload_Gecko = {|
  type: 'Native allocation',
  startTime: Milliseconds,
  endTime: Milliseconds,
  size: Bytes,
  stack: GeckoMarkerStack,
  // Older versions of the Gecko format did not have these values.
  memoryAddress?: number,
  threadId?: number,
|};

export type IPCMarkerPayload = {|
  type: 'IPC',
  startTime: Milliseconds,
  endTime: Milliseconds,
  otherPid: number,
  otherTid?: number,
  otherThreadName?: string,
  messageType: string,
  messageSeqno: number,
  side: 'parent' | 'child',
  direction: 'sending' | 'receiving',
  sync: boolean,
|};

/**
 * The union of all the different marker payloads that profiler.firefox.com knows about,
 * this is not guaranteed to be all the payloads that we actually get from the Gecko
 * profiler.
 */
export type MarkerPayload =
  | FileIoPayload
  | GPUMarkerPayload
  | BailoutPayload
  | InvalidationPayload
  | NetworkPayload
  | UserTimingMarkerPayload
  | TextMarkerPayload
  | LogMarkerPayload
  | PaintProfilerMarkerTracing
  | CcMarkerTracing
  | DOMEventMarkerPayload
  | GCMinorMarkerPayload
  | GCMajorMarkerPayload
  | GCSliceMarkerPayload
  | StyleMarkerPayload
  | BHRMarkerPayload
  | LongTaskMarkerPayload
  | VsyncTimestampPayload
  | ScreenshotPayload
  | FrameConstructionMarkerPayload
  | DummyForTestsMarkerPayload
  | NavigationMarkerPayload
  | PrefMarkerPayload
  | IPCMarkerPayload
  | null;

export type MarkerPayload_Gecko =
  | GPUMarkerPayload
  | NetworkPayload
  | UserTimingMarkerPayload
  | TextMarkerPayload
  | LogMarkerPayload
  | DOMEventMarkerPayload
  | GCMinorMarkerPayload
  | GCMajorMarkerPayload_Gecko
  | GCSliceMarkerPayload_Gecko
  | FrameConstructionMarkerPayload
  | DummyForTestsMarkerPayload
  | VsyncTimestampPayload
  | ScreenshotPayload
  | CcMarkerTracing
  | ArbitraryEventTracing
  | NavigationMarkerPayload
  | JsAllocationPayload_Gecko
  | NativeAllocationPayload_Gecko
  | PrefMarkerPayload
  | IPCMarkerPayload
  // The following payloads come in with a stack property. During the profile processing
  // the "stack" property is are converted into a "cause". See the CauseBacktrace type
  // for more information.
  | $ReplaceCauseWithStack<FileIoPayload>
  | $ReplaceCauseWithStack<PaintProfilerMarkerTracing>
  | $ReplaceCauseWithStack<StyleMarkerPayload>
  // Payloads can be null.
  | null;
