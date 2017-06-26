/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { ThreadIndex } from '../types/profile';

export function changeFlameChartColorStrategy(getCategory: GetCategory): Action {
  return {
    type: 'CHANGE_FLAME_CHART_COLOR_STRATEGY',
    getCategory,
  };
}

export function changeFlameChartLabelingStrategy(getLabel: GetLabel): Action {
  return {
    type: 'CHANGE_FLAME_CHART_LABELING_STRATEGY',
    getLabel,
  };
}

export function changeTimelineFlameChartExpandedThread(threadIndex: ThreadIndex, isExpanded: boolean): Action {
  const type = 'CHANGE_TIMELINE_FLAME_CHART_EXPANDED_THREAD';
  return { type, threadIndex, isExpanded };
}

export function changeTimelineMarkersExpandedThread(threadIndex: ThreadIndex, isExpanded: boolean): Action {
  const type = 'CHANGE_TIMELINE_MARKERS_EXPANDED_THREAD';
  return { type, threadIndex, isExpanded };
}

export function setHasZoomedViaMousewheel() {
  return { type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' };
}
