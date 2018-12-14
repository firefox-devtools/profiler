/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { StackChartState } from '../types/state';
import type { Selector } from '../types/store';
import type { GetCategory } from '../profile-logic/color-categories';
import type { GetLabel } from '../profile-logic/labeling-strategies';

/**
 * Simple selectors in the StackChartState.
 */
export const getStackChart: Selector<StackChartState> = state =>
  state.stackChart;
export const getCategoryColorStrategy: Selector<GetCategory> = state =>
  getStackChart(state).categoryColorStrategy;
export const getLabelingStrategy: Selector<GetLabel> = state =>
  getStackChart(state).labelingStrategy;
