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

/**
 * The union of all the different marker payloads that perf.html knows about, this is
 * not guaranteed to be all the payloads that we actually get from the profiler.
 */
export type MarkerPayload =
  | GPUMarkerPayload
  | UserTimingMarkerPayload
  | PaintProfilerMarkerTracing
  | null;
