/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Action } from '../types/store';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';

export function changeStackChartColorStrategy(
  getCategory: GetCategory
): Action {
  return {
    type: 'CHANGE_STACK_CHART_COLOR_STRATEGY',
    getCategory,
  };
}

export function changeStackChartLabelingStrategy(getLabel: GetLabel): Action {
  return {
    type: 'CHANGE_STACK_CHART_LABELING_STRATEGY',
    getLabel,
  };
}

export function setHasZoomedViaMousewheel() {
  return { type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' };
}
