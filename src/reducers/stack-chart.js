/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { combineReducers } from 'redux';
import { getCategoryByImplementation } from '../profile-logic/color-categories';
import { getFunctionName } from '../profile-logic/labeling-strategies';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { StackChartState, Reducer } from '../types/state';

const categoryColorStrategy: Reducer<GetCategory> = (
  state = getCategoryByImplementation,
  action
) => {
  switch (action.type) {
    case 'CHANGE_STACK_CHART_COLOR_STRATEGY':
      return action.getCategory;
    default:
      return state;
  }
};

const labelingStrategy: Reducer<GetLabel> = (
  state = getFunctionName,
  action
) => {
  switch (action.type) {
    case 'CHANGE_STACK_CHART_LABELING_STRATEGY':
      return action.getLabel;
    default:
      return state;
  }
};

const stackChartReducer: Reducer<StackChartState> = combineReducers({
  categoryColorStrategy,
  labelingStrategy,
});

export default stackChartReducer;
