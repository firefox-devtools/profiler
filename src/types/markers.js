/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Milliseconds, Microseconds, Seconds, Bytes } from './units';
import type { GeckoMarkerStack } from './gecko-profile';
import type {
  IndexIntoStackTable,
  IndexIntoStringTable,
  Tid,
  Pid,
  GraphColor,
} from './profile';
import type { ObjectMap } from './utils';

// Provide different formatting options for strings.

export type MarkerFormatType =
  // ----------------------------------------------------
  // String types.

  // Show the URL, and handle PII sanitization
  | 'url'
  // Show the file path, and handle PII sanitization.
  | 'file-path'
  // Show regular string, and handle PII sanitization.
  | 'sanitized-string'
  // Important, do not put URL or file path information here, as it will not be
  // sanitized. Please be careful with including other types of PII here as well.
  // e.g. "Label: Some String"
  | 'string'
  /// An index into a (currently) thread-local string table, aka StringTable
  /// This is effectively an integer, so wherever we need to display this value, we
  /// must first perform a lookup into the appropriate string table.
  | 'unique-string'

  // ----------------------------------------------------
  // Flow types.
  // A flow ID is a u64 identifier that's unique across processes. In the current
  // implementation, we represent them as hex strings, as string table indexes.
  // A terminating flow ID is a flow ID that, when used in a marker with timestamp T,
  // makes it so that if the same flow ID is used in a marker whose timestamp is
  // after T, that flow ID is considered to refer to a different flow.
  | 'flow-id'
  | 'terminating-flow-id'

  // ----------------------------------------------------
  // Numeric types

  // Note: All time and durations are stored as milliseconds.

  // For time data that represents a duration of time.
  // e.g. "Label: 5s, 5ms, 5μs"
  | 'duration'
  // Data that happened at a specific time, relative to the start of
  // the profile. e.g. "Label: 15.5s, 20.5ms, 30.5μs"
  | 'time'
  // The following are alternatives to display a time only in a specific
  // unit of time.
  | 'seconds' // "Label: 5s"
  | 'milliseconds' // "Label: 5ms"
  | 'microseconds' // "Label: 5μs"
  | 'nanoseconds' // "Label: 5ns"
  // e.g. "Label: 5.55mb, 5 bytes, 312.5kb"
  | 'bytes'
  // This should be a value between 0 and 1.
  // "Label: 50%"
  | 'percentage'
  // The integer should be used for generic representations of numbers. Do not
  // use it for time information.
  // "Label: 52, 5,323, 1,234,567"
  | 'integer'
  // The decimal should be used for generic representations of numbers. Do not
  // use it for time information.
  // "Label: 52.23, 0.0054, 123,456.78"
  | 'decimal'
  | 'pid'
  | 'tid'
  | 'list'
  | { type: 'table', columns: TableColumnFormat[] };

type TableColumnFormat = {
  // type for formatting, default is string
  type?: MarkerFormatType,
  // header column label
  label?: string,
};

// A list of all the valid locations to surface this marker.
// We can be free to add more UI areas.
export type MarkerDisplayLocation =
  // Display the marker in the Marker Chart tab.
  | 'marker-chart'
  // Display the marker in the Marker Table tab.
  | 'marker-table'
  // This adds markers to the main marker timeline in the header. Note that for
  // synthesized or imported profiles using the marker schema, the threads can register
  // themselves for by setting the flag `thread.showMarkersInTimeline = true`. Otherwise
  // for Gecko threads, the timeline overview is only shown for specifically named
  // threads. See src/components/timeline/TrackThread.js for the current list.
  | 'timeline-overview'
  // In the timeline, this is a section that breaks out markers that are related
  // to memory. When memory counters are enabled, this is its own track, otherwise
  // it is displayed with the main thread.
  | 'timeline-memory'
  // This adds markers to the IPC timeline area in the header.
  | 'timeline-ipc'
  // This adds markers to the FileIO timeline area in the header.
  | 'timeline-fileio'
  // TODO - This is not supported yet.
  | 'stack-chart';

export type MarkerGraphType = 'bar' | 'line' | 'line-filled';
export type MarkerGraph = {
  key: string,
  type: MarkerGraphType,
  color?: GraphColor,
};

export type MarkerSchemaField = {
  // The property key of the marker data property that carries the field value.
  key: string,

  // An optional user-facing label.
  // If no label is provided, the key is displayed instead.
  label?: string,

  // The format / type of this field. This affects how the field's value is
  // displayed and determines which types of values are accepted for this field.
  format: MarkerFormatType,

  // If present and set to true, this field will not be shown in the list
  // of fields in the tooltip or in the sidebar. Such fields can still be
  // used inside labels and their values are matched when searching.
  hidden?: boolean,
};

export type MarkerSchema = {
  // The unique identifier for this marker.
  name: string, // e.g. "CC"

  // The label of how this marker should be displayed in the UI.
  // If none is provided, then the name is used.
  tooltipLabel?: string, // e.g. "Cycle Collect"

  // This is how the marker shows up in the Marker Table description.
  // If none is provided, then the name is used.
  tableLabel?: string, // e.g. "{marker.data.eventType} – DOMEvent"

  // This is how the marker shows up in the Marker Chart, where it is drawn
  // on the screen as a bar.
  // If none is provided, then the name is used.
  chartLabel?: string,

  // The locations to display
  display: MarkerDisplayLocation[],

  // The fields that can be present on markers of this type.
  // Not all listed fields have to be present on every marker (they're all optional).
  fields: MarkerSchemaField[],

  // An optional description for markers of this type.
  // Will be displayed to the user.
  description?: string,

  // if present, give the marker its own local track
  graphs?: Array<MarkerGraph>,

  // If set to true, markers of this type are assumed to be well-nested with all
  // other stack-based markers on the same thread. Stack-based markers may
  // be displayed in a different part of the marker chart than non-stack-based
  // markers.
  // Instant markers are always well-nested.
  // For interval markers, or for intervals defined by a start and an end marker,
  // well-nested means that, for all marker-defined timestamp intervals A and B,
  // A either fully encompasses B or is fully encompassed by B - there is no
  // partial overlap.
  isStackBased?: boolean,
};

export type MarkerSchemaByName = ObjectMap<MarkerSchema>;

/**
 * Markers can include a stack. These are converted to a cause backtrace, which includes
 * the time the stack was taken. Sometimes this cause can be async, and triggered before
 * the marker, or it can be synchronous, and the time is contained within the marker's
 * start and end time.
 */
export type CauseBacktrace = {
  // `tid` is optional because older processed profiles may not have it.
  // No upgrader was written for this change.
  tid?: Tid,
  time?: Milliseconds,
  stack: IndexIntoStackTable,
};

/**
 * This type holds data that should be synchronized across the various phases
 * associated with an IPC message.
 */
export type IPCSharedData = {
  // Each of these fields comes from a specific marker corresponding to each
  // phase of an IPC message; since we can't guarantee that any particular
  // marker was recorded, all of the fields are optional.
  startTime?: Milliseconds,
  sendStartTime?: Milliseconds,
  sendEndTime?: Milliseconds,
  recvEndTime?: Milliseconds,
  endTime?: Milliseconds,
  sendTid?: number,
  recvTid?: number,
  sendThreadName?: string,
  recvThreadName?: string,
};

/**
 * This utility type removes the "cause" property from a payload, and replaces it with
 * a stack. This effectively converts it from a processed payload to a Gecko payload.
 */

export type $ReplaceCauseWithStack<
  // False positive, generic type bounds are alright:
  // eslint-disable-next-line flowtype/no-weak-types
  T: Object,
> = {
  ...$Diff<
    T,
    // Remove the cause property.
    { cause: any },
  >,
  // Add on the stack property:
  stack?: GeckoMarkerStack,
};

/**
 * Measurement for how long draw calls take for the compositor.
 */
export type GPUMarkerPayload = {
  type: 'gpu_timer_query',
  cpustart: Milliseconds,
  cpuend: Milliseconds,
  gpustart: Milliseconds, // Always 0.
  gpuend: Milliseconds, // The time the GPU took to execute the command.
};

/**
 * These markers don't have a start and end time. They work in pairs, one
 * specifying the start, the other specifying the end of a specific tracing
 * marker.
 */

export type PaintProfilerMarkerTracing = {
  type: 'tracing',
  category: 'Paint',
  cause?: CauseBacktrace,
};

export type ArbitraryEventTracing = {
  +type: 'tracing',
  +category: string,
};

export type CcMarkerTracing = {
  type: 'tracing',
  category: 'CC',
  first?: string,
  desc?: string,
  second?: string,
};

export type PhaseTimes<Unit> = { [phase: string]: Unit };

type GCSliceData_Shared = {
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
};
export type GCSliceData_Gecko = {
  ...GCSliceData_Shared,
  times: PhaseTimes<Milliseconds>,
};
export type GCSliceData = {
  ...GCSliceData_Shared,
  phase_times: PhaseTimes<Microseconds>,
};

export type GCMajorAborted = {
  status: 'aborted',
};

type GCMajorCompleted_Shared = {
  status: 'completed',
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

  // The total size of GC things before and after the GC.
  allocated_bytes: number,
  post_heap_size?: number,

  // The total size of malloc data owned by GC things before and after the GC.
  // Added in Firefox v135 (Bug 1933205).
  pre_malloc_heap_size?: number,
  post_malloc_heap_size?: number,

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
};

export type GCMajorCompleted = {
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
};

export type GCMajorCompleted_Gecko = {
  ...GCMajorCompleted_Shared,
  // As above except in parts of 100.
  mmu_20ms: number,
  mmu_50ms: number,
  totals: PhaseTimes<Milliseconds>,
};

export type GCMajorMarkerPayload = {
  type: 'GCMajor',
  timings: GCMajorAborted | GCMajorCompleted,
};

export type GCMajorMarkerPayload_Gecko = {
  type: 'GCMajor',
  timings: GCMajorAborted | GCMajorCompleted_Gecko,
};

export type GCMinorCompletedData = {
  status: 'complete',

  // The reason for initiating the GC.
  reason: string,

  // The size of the data moved into the tenured heap.
  bytes_tenured: number,
  // The number of cells tenured (since
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1473213)
  cells_tenured?: number,

  // The number of strings that were tenured, not counting deduplicated
  // strings (since https://bugzilla.mozilla.org/show_bug.cgi?id=1507379).
  strings_tenured?: number,

  // The number of strings that were deduplicated during tenuring
  // (since https://bugzilla.mozilla.org/show_bug.cgi?id=1658866).
  strings_deduplicated?: number,

  // The allocation rate when promoting live GC things in bytes per second
  // (since https://bugzilla.mozilla.org/show_bug.cgi?id=1963597).
  tenured_allocation_rate?: number,

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
};

export type GCMinorDisabledData = {
  status: 'nursery disabled',
};
export type GCMinorEmptyData = {
  status: 'nursery empty',
};

export type GCMinorMarkerPayload = {
  type: 'GCMinor',
  // nursery is only present in newer profile format.
  nursery?: GCMinorCompletedData | GCMinorDisabledData | GCMinorEmptyData,
};

export type GCSliceMarkerPayload = {
  type: 'GCSlice',
  timings: GCSliceData,
};

export type GCSliceMarkerPayload_Gecko = {
  type: 'GCSlice',
  timings: GCSliceData_Gecko,
};

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

export type NetworkHttpVersion = 'h3' | 'h2' | 'http/1.1' | 'http/1.0';
export type NetworkStatus =
  | 'STATUS_START'
  | 'STATUS_STOP'
  | 'STATUS_REDIRECT'
  | 'STATUS_CANCEL';
export type NetworkRedirectType = 'Permanent' | 'Temporary' | 'Internal';
export type NetworkPayload = {
  type: 'Network',
  innerWindowID?: number,
  URI: string,
  RedirectURI?: string,
  id: number,
  pri: number, // priority of the load; always included as it can change
  count?: number, // Total size of transfer, if any
  // See all possible values in tools/profiler/core/platform.cpp
  status: NetworkStatus,
  // The following property is present only when this marker is for a
  // redirection. Note it is present since Gecko v91 only.
  redirectType?: NetworkRedirectType,
  // The following property is present only when this marker is for a
  // redirection. Note it is present since Gecko v91 only.
  isHttpToHttpsRedirect?: boolean,
  // When present in a redirect marker, this is the id of the next request,
  // started because of the redirection. Note it is present since Gecko v91
  // only.
  redirectId?: number,
  cache?: string,
  cause?: CauseBacktrace,

  // contentType is the value of the Content-Type header from the HTTP
  // response. An empty string means the response had no content type,
  // while a value of null means no HTTP response was received. If
  // this property is absent then it means this profiler came from an
  // older version of the Gecko profiler without content type support.
  contentType?: string | null,

  // If present and true, this network marker originated from a request in a
  // private browsing session.
  // Most markers tied to a window also have a innerWindowID property, but
  // that's not always the case, especially for the requests for the top level
  // navigation. That's why this property is needed in addition to the
  // innerWindowID property that we also have.
  // It's always absent in Firefox < 98 because we couldn't capture private
  // browsing data back then.
  isPrivateBrowsing?: boolean,
  httpVersion?: NetworkHttpVersion,

  // Used to express class dependencies and characteristics.
  // Possible flags: Leader, Follower, Speculative, Background, Unblocked,
  // Throttleable, UrgentStart, DontThrottle, Tail, TailAllowed, and
  // TailForbidden. Multiple flags can be set, separated by '|',
  // or we use 'Unset' if no flag is set.
  classOfService?: string,

  // Used to show the request status (nsresult nsIRequest::status)
  requestStatus?: string,

  // Used to show the HTTP response status code
  responseStatus?: number,

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
};

export type FileIoPayload = {
  type: 'FileIO',
  cause?: CauseBacktrace,
  source: string,
  operation: string,
  filename?: string,
  // FileIO markers that are happening on the current thread don't have a threadId,
  // but they have threadId field if the markers belong to a different (potentially
  // non-profiled) thread.
  // This field is added on Firefox 78, but this is backwards compatible because
  // previous FileIO markers were also belonging to the threads they are in only.
  // We still don't serialize this field if the marker belongs to the thread they
  // are being captured.
  threadId?: number,
};

/**
 * The payload for the UserTimings API. These are added through performance.measure()
 * and performance.mark(). https://developer.mozilla.org/en-US/docs/Web/API/Performance
 */
export type UserTimingMarkerPayload = {
  type: 'UserTiming',
  name: string,
  entryType: 'measure' | 'mark',
};

export type TextMarkerPayload = {
  type: 'Text',
  name: string,
  cause?: CauseBacktrace,
  innerWindowID?: number,
};

// Any import from a Chrome profile
export type ChromeEventPayload = {
  type: string,
  category: string,
  data: MixedObject | null,
};

/**
 * Gecko includes rich log information. This marker payload is used to mirror that
 * log information in the profile.
 */
export type LogMarkerPayload = {
  type: 'Log',
  name: string,
  module: string,
};

export type DOMEventMarkerPayload = {
  type: 'DOMEvent',
  latency?: Milliseconds,
  eventType: string,
  innerWindowID?: number,
};

export type PrefMarkerPayload = {
  type: 'PreferenceRead',
  prefAccessTime: Milliseconds,
  prefName: string,
  prefKind: string,
  prefType: string,
  prefValue: string,
};

export type NavigationMarkerPayload = {
  type: 'tracing',
  category: 'Navigation',
  eventType?: string,
  innerWindowID?: number,
};

type VsyncTimestampPayload = {
  type: 'VsyncTimestamp',
};

export type ScreenshotPayload =
  | {
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
    }
  // Markers that represent the closing of a window (name === 'CompositorScreenshotWindowDestroyed')
  // only have a windowID data.
  | {
      type: 'CompositorScreenshot',
      // A memory address that can uniquely identify a window. It has no meaning other than
      // a way to identify a window.
      windowID: string,
      // Having the property present but void makes it easier to deal with Flow in
      // our flow version.
      url: void,
    };

export type StyleMarkerPayload = {
  type: 'Styles',
  category: 'Paint',
  cause?: CauseBacktrace,

  // Counts
  elementsTraversed: number,
  elementsStyled: number,
  elementsMatched: number,
  stylesShared: number,
  stylesReused: number,
};

export type BHRMarkerPayload = {
  type: 'BHR-detected hang',
};

export type LongTaskMarkerPayload = {
  type: 'MainThreadLongTask',
  category: 'LongTask',
};

export type JsAllocationPayload_Gecko = {
  type: 'JS allocation',
  className: string,
  typeName: string, // Currently only 'JSObject'
  coarseType: string, // Currently only 'Object',
  size: Bytes,
  inNursery: boolean,
  stack: GeckoMarkerStack,
};

export type NativeAllocationPayload_Gecko = {
  type: 'Native allocation',
  size: Bytes,
  stack: GeckoMarkerStack,
  // Older versions of the Gecko format did not have these values.
  memoryAddress?: number,
  threadId?: number,
};

export type IPCMarkerPayload_Gecko = {
  type: 'IPC',
  startTime: Milliseconds,
  endTime: Milliseconds,
  // otherPid is a number in the Gecko format.
  otherPid: number,
  messageType: string,
  messageSeqno: number,
  side: 'parent' | 'child',
  direction: 'sending' | 'receiving',
  // Phase is not present in older profiles (in this case the phase is "endpoint").
  phase?: 'endpoint' | 'transferStart' | 'transferEnd',
  sync: boolean,
  // `tid` of the thread that this marker is originated from. It is undefined
  // when the IPC marker is originated from the same thread. Also, this field is
  // added in Firefox 100. It will always be undefined for the older profiles.
  threadId?: Tid,
};

export type IPCMarkerPayload = {
  type: 'IPC',
  startTime: Milliseconds,
  endTime: Milliseconds,
  // otherPid is a string in the processed format.
  otherPid: Pid,
  messageType: string,
  messageSeqno: number,
  side: 'parent' | 'child',
  direction: 'sending' | 'receiving',
  // Phase is not present in older profiles (in this case the phase is "endpoint").
  phase?: 'endpoint' | 'transferStart' | 'transferEnd',
  sync: boolean,
  // `tid` of the thread that this marker is originated from. It is undefined
  // when the IPC marker is originated from the same thread. Also, this field is
  // added in Firefox 100. It will always be undefined for the older profiles.
  threadId?: Tid,

  // These fields are added in the deriving process from `IPCSharedData`, and
  // correspond to data from all the markers associated with a particular IPC
  // message.
  // We mark these fields as optional because we represent non-derived markers
  // and derived markers with the same type. These fields are always present on
  // derived markers and never present on non-derived markers.
  sendStartTime?: Milliseconds,
  sendEndTime?: Milliseconds,
  recvEndTime?: Milliseconds,
  sendTid?: Tid,
  recvTid?: Tid,
  sendThreadName?: string,
  recvThreadName?: string,

  // This field is a nicely formatted field for the direction.
  niceDirection?: string,
};

export type MediaSampleMarkerPayload = {
  type: 'MediaSample',
  sampleStartTimeUs: Microseconds,
  sampleEndTimeUs: Microseconds,
};

/**
 * This type is generated on the Firefox Profiler side, and doesn't come from Gecko.
 */
export type JankPayload = { type: 'Jank' };

export type BrowsertimeMarkerPayload = {
  type: 'VisualMetricProgress',
  percentage: number,
};

export type NoPayloadUserData = {
  type: 'NoPayloadUserData',
  innerWindowID?: number,
};

export type UrlMarkerPayload = {
  type: 'Url',
  url: string,
};

export type HostResolverPayload = {
  type: 'HostResolver',
  host: string,
  originSuffix: string,
  flags: string,
};

/**
 * The union of all the different marker payloads that profiler.firefox.com knows about,
 * this is not guaranteed to be all the payloads that we actually get from the Gecko
 * profiler.
 */
export type MarkerPayload =
  | FileIoPayload
  | GPUMarkerPayload
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
  | NavigationMarkerPayload
  | PrefMarkerPayload
  | IPCMarkerPayload
  | MediaSampleMarkerPayload
  | JankPayload
  | BrowsertimeMarkerPayload
  | NoPayloadUserData
  | UrlMarkerPayload
  | HostResolverPayload;

export type MarkerPayload_Gecko =
  | GPUMarkerPayload
  | NetworkPayload
  | UserTimingMarkerPayload
  | LogMarkerPayload
  | DOMEventMarkerPayload
  | GCMinorMarkerPayload
  | GCMajorMarkerPayload_Gecko
  | GCSliceMarkerPayload_Gecko
  | VsyncTimestampPayload
  | ScreenshotPayload
  | CcMarkerTracing
  | ArbitraryEventTracing
  | NavigationMarkerPayload
  | JsAllocationPayload_Gecko
  | NativeAllocationPayload_Gecko
  | PrefMarkerPayload
  | IPCMarkerPayload_Gecko
  | MediaSampleMarkerPayload
  | NoPayloadUserData
  | UrlMarkerPayload
  // The following payloads come in with a stack property. During the profile processing
  // the "stack" property is are converted into a "cause". See the CauseBacktrace type
  // for more information.
  | $ReplaceCauseWithStack<FileIoPayload>
  | $ReplaceCauseWithStack<PaintProfilerMarkerTracing>
  | $ReplaceCauseWithStack<StyleMarkerPayload>
  | $ReplaceCauseWithStack<TextMarkerPayload>;
