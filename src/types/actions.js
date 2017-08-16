/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type { Summary } from '../profile-logic/summarize-profile';
import type {
  Profile,
  ThreadIndex,
  IndexIntoMarkersTable,
  IndexIntoFuncTable,
} from './profile';
import type { CallNodePath } from './profile-derived';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { TemporaryError } from '../utils/errors';
import type { Transform } from './transforms';

export type ExpandedSet = Set<ThreadIndex>;
export type DataSource =
  | 'none'
  | 'from-file'
  | 'from-addon'
  | 'local'
  | 'public'
  | 'from-url';
export type ProfileSelection =
  | { hasSelection: false, isModifying: false }
  | {
      hasSelection: true,
      isModifying: boolean,
      selectionStart: number,
      selectionEnd: number,
    };
export type FuncToFuncMap = Map<IndexIntoFuncTable, IndexIntoFuncTable>;
export type FunctionsUpdatePerThread = {
  [id: ThreadIndex]: {
    oldFuncToNewFuncMap: FuncToFuncMap,
    funcIndices: IndexIntoFuncTable[],
    funcNames: string[],
  },
};

export type RequestedLib = { debugName: string, breakpadId: string };
export type ImplementationFilter = 'combined' | 'js' | 'cpp';

type ProfileSummaryAction =
  | { type: 'PROFILE_SUMMARY_PROCESSED', summary: Summary }
  | { type: 'PROFILE_SUMMARY_EXPAND', threadIndex: ThreadIndex }
  | { type: 'PROFILE_SUMMARY_COLLAPSE', threadIndex: ThreadIndex };

type ProfileAction =
  | { type: 'ROUTE_NOT_FOUND', url: string }
  | { type: 'CHANGE_THREAD_ORDER', threadOrder: ThreadIndex[] }
  | {
      type: 'HIDE_THREAD',
      threadIndex: ThreadIndex,
      hiddenThreads: ThreadIndex[],
      threadOrder: ThreadIndex[],
    }
  | { type: 'SHOW_THREAD', threadIndex: ThreadIndex }
  | {
      type: 'ASSIGN_TASK_TRACER_NAMES',
      addressIndices: number[],
      symbolNames: string[],
    }
  | {
      type: 'CHANGE_SELECTED_CALL_NODE',
      threadIndex: ThreadIndex,
      selectedCallNodePath: CallNodePath,
    }
  | {
      type: 'CHANGE_EXPANDED_CALL_NODES',
      threadIndex: ThreadIndex,
      expandedCallNodePaths: Array<CallNodePath>,
    }
  | {
      type: 'CHANGE_SELECTED_MARKER',
      threadIndex: ThreadIndex,
      selectedMarker: IndexIntoMarkersTable | -1,
    }
  | { type: 'UPDATE_PROFILE_SELECTION', selection: ProfileSelection }
  | { type: 'CHANGE_TAB_ORDER', tabOrder: number[] };

type ReceiveProfileAction =
  | {
      type: 'COALESCED_FUNCTIONS_UPDATE',
      functionsUpdatePerThread: FunctionsUpdatePerThread,
    }
  | { type: 'DONE_SYMBOLICATING' }
  | { type: 'ERROR_RECEIVING_PROFILE_FROM_FILE', error: Error }
  | {
      type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_ADDON',
      error: TemporaryError,
    }
  | { type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_ADDON', error: Error }
  | {
      type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_STORE',
      error: TemporaryError,
    }
  | {
      type: 'TEMPORARY_ERROR_RECEIVING_PROFILE_FROM_URL',
      error: TemporaryError,
    }
  | { type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_STORE', error: Error }
  | { type: 'FATAL_ERROR_RECEIVING_PROFILE_FROM_URL', error: Error }
  | { type: 'PROFILE_PROCESSED', profile: Profile, toWorker: true }
  | { type: 'RECEIVE_PROFILE_FROM_ADDON', profile: Profile }
  | { type: 'RECEIVE_PROFILE_FROM_FILE', profile: Profile }
  | { type: 'RECEIVE_PROFILE_FROM_STORE', profile: Profile }
  | { type: 'RECEIVE_PROFILE_FROM_URL', profile: Profile }
  | { type: 'REQUESTING_SYMBOL_TABLE', requestedLib: RequestedLib }
  | { type: 'RECEIVED_SYMBOL_TABLE_REPLY', requestedLib: RequestedLib }
  | { type: 'START_SYMBOLICATING' }
  | { type: 'SUMMARIZE_PROFILE', toWorker: true }
  | { type: 'WAITING_FOR_PROFILE_FROM_ADDON' }
  | { type: 'WAITING_FOR_PROFILE_FROM_STORE' }
  | { type: 'WAITING_FOR_PROFILE_FROM_URL' };

type TimelineAction =
  | { type: 'CHANGE_FLAME_CHART_COLOR_STRATEGY', getCategory: GetCategory }
  | { type: 'CHANGE_FLAME_CHART_LABELING_STRATEGY', getLabel: GetLabel }
  | {
      type: 'CHANGE_TIMELINE_FLAME_CHART_EXPANDED_THREAD',
      threadIndex: ThreadIndex,
      isExpanded: boolean,
    }
  | {
      type: 'CHANGE_TIMELINE_MARKERS_EXPANDED_THREAD',
      threadIndex: ThreadIndex,
      isExpanded: boolean,
    };

type URLEnhancerAction =
  | { type: '@@urlenhancer/urlSetupDone' }
  | { type: '@@urlenhancer/updateURLState', urlState: any };

type URLStateAction =
  | { type: 'WAITING_FOR_PROFILE_FROM_FILE' }
  | { type: 'CHANGE_SELECTED_TAB', selectedTab: string }
  | { type: 'ADD_RANGE_FILTER', start: number, end: number }
  | { type: 'POP_RANGE_FILTERS', firstRemovedFilterIndex: number }
  | { type: 'CHANGE_SELECTED_THREAD', selectedThread: ThreadIndex }
  | { type: 'CHANGE_CALL_TREE_SEARCH_STRING', searchString: string }
  | {
      type: 'ADD_TRANSFORM_TO_STACK',
      threadIndex: ThreadIndex,
      transform: Transform,
    }
  | {
      type: 'POP_TRANSFORMS_FROM_STACK',
      threadIndex: ThreadIndex,
      firstRemovedFilterIndex: number,
    }
  | {
      type: 'CHANGE_IMPLEMENTATION_FILTER',
      implementation: ImplementationFilter,
    }
  | { type: 'CHANGE_INVERT_CALLSTACK', invertCallstack: boolean }
  | { type: 'CHANGE_HIDE_PLATFORM_DETAILS', hidePlatformDetails: boolean }
  | { type: 'CHANGE_MARKER_SEARCH_STRING', searchString: string };

type IconsAction =
  | { type: 'ICON_HAS_LOADED', icon: string }
  | { type: 'ICON_IN_ERROR', icon: string };

type ProfileUploadAction =
  | { type: 'PROFILE_UPLOAD_SUCCESS', hash: string }
  | { type: 'PROFILE_UPLOAD_START' }
  | { type: 'PROFILE_UPLOAD_ERROR', error: Error }
  | { type: 'PROFILE_UPLOAD_PROGRESS', progress: number };

export type Action =
  | ProfileSummaryAction
  | ProfileAction
  | ReceiveProfileAction
  | TimelineAction
  | URLEnhancerAction
  | URLStateAction
  | IconsAction
  | ProfileUploadAction;
