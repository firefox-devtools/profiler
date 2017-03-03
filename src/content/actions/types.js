type ProfileSummaryAction =
  { type: "PROFILE_SUMMARY_PROCESSED", summary: Summary } |
  { type: "PROFILE_SUMMARY_EXPAND", expanded: ExpandedSet } |
  { type: "PROFILE_SUMMARY_COLLAPSE", expanded: ExpandedSet };

type URLStateAction =
  { type: 'WAITING_FOR_PROFILE_FROM_FILE' } |
  { type: 'PROFILE_PUBLISHED', hash: string } |
  { type: 'CHANGE_SELECTED_TAB', selectedTab: string } |
  { type: 'ADD_RANGE_FILTER', state: number, end: number } |
  { type: 'POP_RANGE_FILTER', firstRemovedFilterIndex: number } |
  { type: 'CHANGE_SELECTED_THREAD', selectedThread: ThreadIndex } |
  { type: 'RECEIVE_PROFILE_FROM_ADDON' | 'RECEIVE_PROFILE_FROM_FILE', profile: Profile } |
  { type: 'CHANGE_CALL_TREE_SEARCH_STRING', searchString: string } |
  { type: 'ADD_CALL_TREE_FILTER', threadIndex: ThreadIndex, filter: CallTreeFilter } |
  { type: 'POP_CALL_TREE_FILTER', threadIndex: ThreadIndex, firstRemovedFilterIndex: number } |
  { type: 'CHANGE_JS_ONLY', jsOnly: boolean } |
  { type: 'CHANGE_INVERT_CALLSTACK', invertCallstack: boolean } |
  { type: 'CHANGE_HIDE_PLATFORM_DETAILS', invertCallstack: hidePlatformDetails };
  
export type Action =
  URLStateAction |
  ProfileSummaryAction;
