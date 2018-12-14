/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { State } from '../types/state';

export const getStackChart = (state: State) => state.stackChart;
export const getCategoryColorStrategy = (state: State) =>
  getStackChart(state).categoryColorStrategy;
export const getLabelingStrategy = (state: State) =>
  getStackChart(state).labelingStrategy;
