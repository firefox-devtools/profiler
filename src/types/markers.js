/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { Milliseconds } from './units';

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

export type GCMinorMarkerPayload = {
  type: 'GCMinor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  // nursery is only present in newer profile format.
  nursery?: {|
    reason?: string,
    status?: string,
  |},
};

export type GCMajorMarkerPayload = {
  type: 'GCMajor',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: {|
    zones_collected: number,
    total_zones: number,
    reason: string,
    nonincremental_reason: string,
    max_pause: Milliseconds,
    minor_gcs: number,
    slices: number,
  |},
};

export type GCSliceMarkerPayload = {
  type: 'GCSlice',
  startTime: Milliseconds,
  endTime: Milliseconds,
  timings: {|
    reason: string,
    budget: Milliseconds,
    initial_state: string,
    final_state: string,
  |},
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
