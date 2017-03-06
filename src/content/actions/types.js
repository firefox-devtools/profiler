// @flow
import type { Summary } from '../../common/summarize-profile';
import type { ThreadIndex, Profile, IndexIntoFuncTable } from '../../common/types/profile';

type ProfileSummaryAction =
  { type: "PROFILE_SUMMARY_PROCESSED", summary: Summary } |
  { type: "PROFILE_SUMMARY_EXPAND", threadIndex: ThreadIndex } |
  { type: "PROFILE_SUMMARY_COLLAPSE", threadIndex: ThreadIndex };

export type CallTreeFilter = {
  type: 'postfix' | 'prefix',
  postfixFuncs: null | IndexIntoFuncTable[],
  prefixFuncs: null | IndexIntoFuncTable[],
  matchJSOnly: boolean,
};

type URLStateAction =
  { type: 'WAITING_FOR_PROFILE_FROM_FILE' } |
  { type: 'PROFILE_PUBLISHED', hash: string } |
  { type: 'CHANGE_SELECTED_TAB', selectedTab: string } |
  { type: 'ADD_RANGE_FILTER', start: number, end: number } |
  { type: 'POP_RANGE_FILTER', firstRemovedFilterIndex: number } |
  { type: 'CHANGE_SELECTED_THREAD', selectedThread: ThreadIndex } |
  { type: 'RECEIVE_PROFILE_FROM_ADDON' | 'RECEIVE_PROFILE_FROM_FILE', profile: Profile } |
  { type: 'CHANGE_CALL_TREE_SEARCH_STRING', searchString: string } |
  { type: 'ADD_CALL_TREE_FILTER', threadIndex: ThreadIndex, filter: CallTreeFilter } |
  { type: 'POP_CALL_TREE_FILTER', threadIndex: ThreadIndex, firstRemovedFilterIndex: number } |
  { type: 'CHANGE_JS_ONLY', jsOnly: boolean } |
  { type: 'CHANGE_INVERT_CALLSTACK', invertCallstack: boolean } |
  { type: 'CHANGE_HIDE_PLATFORM_DETAILS', hidePlatformDetails: boolean };

type TimelineAction =
  { type: 'CHANGE_TIMELINE_HORIZONTAL_VIEWPORT', left: number, right: number } |
  { type: 'CHANGE_TIMELINE_EXPANDED_THREAD', threadIndex: ThreadIndex, isExpanded: boolean };

export type Action =
  URLStateAction |
  ProfileSummaryAction |
  TimelineAction;
