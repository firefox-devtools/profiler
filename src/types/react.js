/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Milliseconds } from './units';

export type ReactPriority = 'unscheduled' | 'high' | 'normal' | 'low';

export type ReactEventType =
  | 'schedule-render'
  | 'schedule-state-update'
  | 'suspend';

export type ReactMeasureType =
  | 'commit'
  | 'render-idle'
  | 'render'
  | 'layout-effects'
  | 'passive-effects';

export type ReactEvent = {|
  +type: ReactEventType,
  +priority: ReactPriority,
  +timestamp: Milliseconds,
  +componentName?: string,
  +componentStack?: string,
  +isCascading?: boolean,
|};

export type BatchUID = number;

export type ReactMeasure = {|
  +type: ReactMeasureType,
  +priority: ReactPriority,
  +timestamp: Milliseconds,
  +duration: Milliseconds,
  +batchUID: BatchUID,
  +depth: number,
|};

export type ReactProfilerDataPriority = {|
  events: Array<ReactEvent>,
  measures: Array<ReactMeasure>,
|};

export type ReactProfilerData = {|
  unscheduled: ReactProfilerDataPriority,
  high: ReactProfilerDataPriority,
  normal: ReactProfilerDataPriority,
  low: ReactProfilerDataPriority,
|};

export type ReactHoverContextInfo = {|
  event: ReactEvent | null,
  measure: ReactMeasure | null,
  priorityIndex: number,
  reactProfilerData: ReactProfilerData,
  zeroAt: Milliseconds,
|};
