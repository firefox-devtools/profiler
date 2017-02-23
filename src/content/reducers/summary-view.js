export default function summaryView(state = {summary: null, expanded: null}, action) {
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

export const getSummaryView = state => state.summaryView;

export const getProfileSummaries = state => {
  return getSummaryView(state).summary;
};

export const getProfileExpandedSummaries = state => {
  return getSummaryView(state).expanded;
};
