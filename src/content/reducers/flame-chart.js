import { combineReducers } from 'redux';
import { getCategoryByImplementation } from '../color-categories';
import { getFunctionName } from '../labeling-strategies';

function categoryColorStrategy(state = getCategoryByImplementation, action) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_COLOR_STRATEGY':
      return action.getCategory;
  }
  return state;
}

function labelingStrategy(state = getFunctionName, action) {
  switch (action.type) {
    case 'CHANGE_FLAME_CHART_LABELING_STRATEGY':
      return action.getLabel;
  }
  return state;
}

export default combineReducers({ categoryColorStrategy, labelingStrategy });

export const getFlameChart = state => state.flameChart;
export const getCategoryColorStrategy = state => getFlameChart(state).categoryColorStrategy;
export const getLabelingStrategy = state => getFlameChart(state).labelingStrategy;
