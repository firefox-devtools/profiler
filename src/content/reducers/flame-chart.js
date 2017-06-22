/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { combineReducers } from 'redux';
import { getCategoryByImplementation } from '../color-categories';
import { getFunctionName } from '../labeling-strategies';
import type { State } from './types';
import type { GetLabel } from '../labeling-strategies';
import type { GetCategory } from '../color-categories';
import type { Action } from '../actions/types';

function categoryColorStrategy(
  state: GetCategory = getCategoryByImplementation,
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_COLOR_STRATEGY':
      return action.getCategory;
  }
  return state;
}

function labelingStrategy(state: GetLabel = getFunctionName, action: Action) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_LABELING_STRATEGY':
      return action.getLabel;
  }
  return state;
}

export default combineReducers({ categoryColorStrategy, labelingStrategy });

export const getFlameChart = (state: State) => state.flameChart;
export const getCategoryColorStrategy = (state: State) => getFlameChart(state).categoryColorStrategy;
export const getLabelingStrategy = (state: State) => getFlameChart(state).labelingStrategy;
