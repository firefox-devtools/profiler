/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { combineReducers } from 'redux';
import { getCategoryByImplementation } from '../profile-logic/color-categories';
import { getFunctionName } from '../profile-logic/labeling-strategies';
import type { State } from '../types/reducers';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { Action } from '../types/actions';

function categoryColorStrategy(
  state: GetCategory = getCategoryByImplementation,
  action: Action
) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_COLOR_STRATEGY':
      return action.getCategory;
    default:
      return state;
  }
}

function labelingStrategy(state: GetLabel = getFunctionName, action: Action) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_LABELING_STRATEGY':
      return action.getLabel;
    default:
      return state;
  }
}

export default combineReducers({ categoryColorStrategy, labelingStrategy });

export const getFlameChart = (state: State) => state.flameChart;
export const getCategoryColorStrategy = (state: State) =>
  getFlameChart(state).categoryColorStrategy;
export const getLabelingStrategy = (state: State) =>
  getFlameChart(state).labelingStrategy;
