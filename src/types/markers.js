/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Milliseconds, Seconds } from './units';

/**
 * Measurement for how long draw calls take for the compositor.
 */
export type GPUMarkerPayload = {
  type: 'gpu_timer_query',
  startTime: Milliseconds, // Same as cpustart
  endTime: Milliseconds, // Same as cpuend
  cpustart: Milliseconds,
  cpuend: Milliseconds,
  gpustart: Milliseconds, // Always 0.
  gpuend: Milliseconds, // The time the GPU took to execute the command.
  stack?: Object,
};

/**
 * These markers have a start and end time.
 */
export type ProfilerMarkerTracing = {
  type: 'tracing',
  startTime: Milliseconds, // Same as cpustart
  endTime: Milliseconds, // Same as cpuend
  stack?: Object,
  interval: 'start' | 'end',
};

export type PaintProfilerMarkerTracing = ProfilerMarkerTracing & {
  category: 'Paint',
  name:
    | 'RefreshDriverTick'
    | 'FireScrollEvent'
    | 'Scripts'
    | 'Styles'
    | 'Reflow'
    | 'DispatchSynthMouseMove'
    | 'DisplayList'
    | 'LayerBuilding'
    | 'Rasterize'
    | 'ForwardTransaction'
    | 'NotifyDidPaint'
    | 'LayerTransaction'
    | 'Composite',
};

export type PhaseTimes = { [phase: string]: Milliseconds };

export type GCSliceData = {
  // Slice number within the GCMajor collection.
  slice: number,

  pause: Milliseconds,
  when: Milliseconds,

  // The reason for this slice.
  reason: string,

  // The GC state at the start and end of this slice.
  initial_state: string,
  final_state: string,

  // The incremental GC budget for this slice (see pause above).
  budget: Milliseconds,

  // The number of the GCMajor that this slice belongs to.
  major_gc_number: number,

  // These are present if the collection was triggered by exceeding some
  // threshold.  The reason field says how they should be interpreted.
  trigger_amount?: number,
  trigger_threshold?: number,

  // The number of page faults that occured during the slice.
  page_faults: number,

  start_timestamp: Seconds,
  end_timestamp: Seconds,

  phase_times: PhaseTimes,
};

export type GCMajorAborted = {
  status: 'aborted',
};

export type GCMajorCompleted = {
  status: 'completed',
  // timestamp is present but is usually 0
  // timestamp: number,
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
  store_buffer_overflows: number,
  slices: number,

  // MMU (Minimum mutator utilisation) A measure of GC's affect on
  // responsiveness  See Statistics::computeMMU(), these percentages in the
  // rage of 0-100.
  // Percentage of time the mutator ran in a 20ms window.
  mmu_20ms: number,
  // Percentage of time the mutator ran in a 50ms window.
  mmu_50ms: number,

  // Timing for the SCC sweep phase.
  scc_sweep_total: Milliseconds,
  scc_sweep_max_pause: Milliseconds,

  // The reason (if not 'None') why this GC ran non-incrementally.
  nonincremental_reason: string,

  // The allocated space for the whole heap before the GC started.
  allocated_bytes: number,

  added_chunks: number,
  removed_chunks: number,

  // The number for the start of this GC event.
  major_gc_number: number,
  minor_gc_number: number,

  // Slice number isn't in older profiles.
  slice_number?: number,

  // This usually isn't present with the gecko profiler, but it's the same
  // as all of the slice markers themselves.
  slices_list?: GCSliceData[],

  // The duration of each phase.
  phase_times: PhaseTimes,
};

export type GCMajorMarkerPayload = {
  type: 'GCMajor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCMajorAborted | GCMajorCompleted,
};

export type GCMinorCompletedData = {
  status: 'complete',

  // The reason for initiating the GC.
  reason: string,

  // The size of the data moved into the tenured heap.
  bytes_tenured: number,

  // The total amount of data that was allocated in the nursery.
  bytes_used: number,

  // The total capacity of the nursery before and after this GC.
  // Capacity may change as the nursery size is tuned after each collection.
  // cur_capacity isn't in older profiles.
  cur_capacity?: number,
  new_capacity: number,

  phase_times: PhaseTimes,
};

export type GCMinorDisabledData = {|
  status: 'nursery disabled',
|};
export type GCMinorEmptyData = {|
  status: 'nursery empty',
|};

export type GCMinorMarkerPayload = {
  type: 'GCMinor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  // nursery is only present in newer profile format.
  nursery?: GCMinorCompletedData | GCMinorDisabledData | GCMinorEmptyData,
};

export type GCSliceMarkerPayload = {
  type: 'GCSlice',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: GCSliceData,
};

// TODO - Add more markers.

/**
 * The payload for the UserTimings API. These are added through performance.measure()
 * and performance.mark(). https://developer.mozilla.org/en-US/docs/Web/API/Performance
 */
export type UserTimingMarkerPayload = {
  type: 'UserTiming',
  startTime: Milliseconds,
  endTime: Milliseconds,
  name: string,
  entryType: 'measure' | 'mark',
};

export type DOMEventMarkerPayload = {
  type: 'DOMEvent',
  timeStamp?: Milliseconds,
  startTime: Milliseconds,
  endTime: Milliseconds,
  eventType: string,
  phase: 0 | 1 | 2 | 3,
};

export type DummyForTestsMarkerPayload = {
  type: 'DummyForTests',
  startTime: Milliseconds,
  endTime: Milliseconds,
};

/**
 * The union of all the different marker payloads that perf.html knows about, this is
 * not guaranteed to be all the payloads that we actually get from the profiler.
 */
export type MarkerPayload =
  | GPUMarkerPayload
  | UserTimingMarkerPayload
  | PaintProfilerMarkerTracing
  | DOMEventMarkerPayload
  | GCMinorMarkerPayload
  | GCMajorMarkerPayload
  | GCSliceMarkerPayload
  | DummyForTestsMarkerPayload
  | null;
