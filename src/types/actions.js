/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { CallTree } from '../profile-logic/call-tree';
import type JSZip from 'jszip';
import type {
  Profile,
  Thread,
  ThreadIndex,
  IndexIntoMarkersTable,
  IndexIntoFuncTable,
} from './profile';
import type { CallNodePath, CallNodeTable } from './profile-derived';
import type { GetLabel } from '../profile-logic/labeling-strategies';
import type { GetCategory } from '../profile-logic/color-categories';
import type { TemporaryError } from '../utils/errors';
import type { Transform } from './transforms';
import type { IndexIntoZipFileTable } from '../profile-logic/zip-files';
import type { UrlState } from '../types/reducers';

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
export type TabSlug =
  | 'calltree'
  | 'stack-chart'
  | 'marker-chart'
  | 'marker-table'
  | 'flame-graph';

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
      type: 'ISOLATE_THREAD',
      hiddenThreadIndexes: ThreadIndex[],
      isolatedThreadIndex: ThreadIndex,
    }
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
      type: 'FOCUS_CALL_TREE',
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
  | { type: 'CHANGE_TAB_ORDER', tabOrder: number[] }
  | {
      type: 'CHANGE_SELECTED_ZIP_FILE',
      selectedZipFileIndex: IndexIntoZipFileTable | null,
    }
  | {
      type: 'CHANGE_EXPANDED_ZIP_FILES',
      expandedZipFileIndexes: Array<IndexIntoZipFileTable | null>,
    }
  | {|
      +type: 'SET_CALL_NODE_CONTEXT_MENU_VISIBILITY',
      +isVisible: boolean,
    |};

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
  | {|
      +type: 'VIEW_PROFILE',
      +profile: Profile,
      +hiddenThreadIndexes: ThreadIndex[],
      +selectedThreadIndex: ThreadIndex | null,
      +pathInZipFile: ?string,
    |}
  | {| +type: 'RECEIVE_ZIP_FILE', +zip: JSZip |}
  | {| +type: 'PROCESS_PROFILE_FROM_ZIP_FILE', +pathInZipFile: string |}
  | {| +type: 'FAILED_TO_PROCESS_PROFILE_FROM_ZIP_FILE', error: any |}
  | {| +type: 'DISMISS_PROCESS_PROFILE_FROM_ZIP_ERROR' |}
  | {| +type: 'RETURN_TO_ZIP_FILE_LIST' |}
  | {| +type: 'FILE_NOT_FOUND_IN_ZIP_FILE', pathInZipFile: string |}
  | { type: 'REQUESTING_SYMBOL_TABLE', requestedLib: RequestedLib }
  | { type: 'RECEIVED_SYMBOL_TABLE_REPLY', requestedLib: RequestedLib }
  | { type: 'START_SYMBOLICATING' }
  | { type: 'WAITING_FOR_PROFILE_FROM_ADDON' }
  | { type: 'WAITING_FOR_PROFILE_FROM_STORE' }
  | { type: 'WAITING_FOR_PROFILE_FROM_URL' };

type StackChartAction =
  | { type: 'CHANGE_STACK_CHART_COLOR_STRATEGY', getCategory: GetCategory }
  | { type: 'CHANGE_STACK_CHART_LABELING_STRATEGY', getLabel: GetLabel }
  | { type: 'HAS_ZOOMED_VIA_MOUSEWHEEL' };

type UrlEnhancerAction =
  | {| type: 'URL_SETUP_DONE' |}
  | {| type: 'UPDATE_URL_STATE', newUrlState: UrlState |};

type UrlStateAction =
  | { type: 'WAITING_FOR_PROFILE_FROM_FILE' }
  | { type: 'PROFILE_PUBLISHED', hash: string }
  | { type: 'CHANGE_SELECTED_TAB', selectedTab: TabSlug }
  | { type: 'ADD_RANGE_FILTER', start: number, end: number }
  | { type: 'POP_RANGE_FILTERS', firstRemovedFilterIndex: number }
  | { type: 'CHANGE_SELECTED_THREAD', selectedThread: ThreadIndex }
  | { type: 'CHANGE_RIGHT_CLICKED_THREAD', selectedThread: ThreadIndex }
  | { type: 'CHANGE_CALL_TREE_SEARCH_STRING', searchString: string }
  | {
      type: 'ADD_TRANSFORM_TO_STACK',
      threadIndex: ThreadIndex,
      transform: Transform,
      transformedThread: Thread,
    }
  | {
      type: 'POP_TRANSFORMS_FROM_STACK',
      threadIndex: ThreadIndex,
      firstRemovedFilterIndex: number,
    }
  | {
      type: 'CHANGE_IMPLEMENTATION_FILTER',
      implementation: ImplementationFilter,
      threadIndex: ThreadIndex,
      transformedThread: Thread,
      previousImplementation: ImplementationFilter,
      implementation: ImplementationFilter,
    }
  | {|
      type: 'CHANGE_INVERT_CALLSTACK',
      invertCallstack: boolean,
      callTree: CallTree,
      callNodeTable: CallNodeTable,
      selectedThreadIndex: ThreadIndex,
    |}
  | { type: 'CHANGE_MARKER_SEARCH_STRING', searchString: string };

type IconsAction =
  | { type: 'ICON_HAS_LOADED', icon: string }
  | { type: 'ICON_IN_ERROR', icon: string };

export type Action =
  | ProfileAction
  | ReceiveProfileAction
  | StackChartAction
  | UrlEnhancerAction
  | UrlStateAction
  | IconsAction;
