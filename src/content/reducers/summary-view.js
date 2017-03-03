// @flow
import type { Summary } from '../../common/summarize-profile';
import type { ThreadIndex } from '../../common/types/profile';
import type { Action } from '../actions/types';

type ExpandedSet = Set<ThreadIndex>;

type SummaryViewState = {
  summary: null|Summary,
  expanded: null|ExpandedSet,
}

export default function summaryView(
  state: SummaryViewState = {summary: null, expanded: null}, action: Action
) {
  switch (action.type) {
    case 'PROFILE_SUMMARY_PROCESSED': {
      return Object.assign({}, state, { summary: action.summary, expanded: new Set() });
    }
    case 'PROFILE_SUMMARY_EXPAND': {
      const expanded = new Set(state.expanded);
      expanded.add(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
    case 'PROFILE_SUMMARY_COLLAPSE': {
      const expanded = new Set(state.expanded);
      expanded.delete(action.threadIndex);
      return Object.assign({}, state, { expanded });
    }
    default:
      return state;
  }
}

export const getSummaryView = (state: Object): SummaryViewState => state.summaryView;

export const getProfileSummaries = (state: Object) => {
  return getSummaryView(state).summary;
};

export const getProfileExpandedSummaries = (state: Object) => {
  return getSummaryView(state).expanded;
};
