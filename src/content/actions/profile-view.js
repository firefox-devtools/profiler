// @flow
import type {
  Action, ThunkAction, ProfileSelection, CallTreeFilter, ImplementationFilter,
} from './types';
import type { Thread, ThreadIndex, IndexIntoFuncTable, IndexIntoMarkersTable } from '../../common/types/profile';

/**
 * The actions that pertain to changing the view on the profile, including searching
 * and filtering. Currently the call tree's actions are in this file, but should be
 * split apart. These actions should most likely affect every panel.
 */
export function changeSelectedFuncStack(
  threadIndex: ThreadIndex,
  selectedFuncStack: IndexIntoFuncTable[]
): Action {
  return {
    type: 'CHANGE_SELECTED_FUNC_STACK',
    selectedFuncStack, threadIndex,
  };
}

export function changeSelectedThread(selectedThread: ThreadIndex): Action {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThread,
  };
}

export function changeThreadOrder(threadOrder: ThreadIndex[]): Action {
  return {
    type: 'CHANGE_THREAD_ORDER',
    threadOrder,
  };
}

export function hideThread(threadIndex: ThreadIndex): Action {
  return {
    type: 'HIDE_THREAD',
    threadIndex,
  };
}

export function showThread(threads: Thread[], threadIndex: ThreadIndex): Action {
  return {
    type: 'SHOW_THREAD',
    threads,
    threadIndex,
  };
}

export function changeCallTreeSearchString(searchString: string): Action {
  return {
    type: 'CHANGE_CALL_TREE_SEARCH_STRING',
    searchString,
  };
}

export function changeExpandedFuncStacks(
  threadIndex: ThreadIndex,
  expandedFuncStacks: Array<IndexIntoFuncTable[]>
): Action {
  return {
    type: 'CHANGE_EXPANDED_FUNC_STACKS',
    threadIndex, expandedFuncStacks,
  };
}

export function changeSelectedMarker(
  threadIndex: ThreadIndex,
  selectedMarker: IndexIntoMarkersTable | -1
): Action {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker, threadIndex,
  };
}

export function changeImplementationFilter(implementation: ImplementationFilter): Action {
  return {
    type: 'CHANGE_IMPLEMENTATION_FILTER',
    implementation,
  };
}

export function changeInvertCallstack(invertCallstack: boolean): Action {
  return {
    type: 'CHANGE_INVERT_CALLSTACK',
    invertCallstack,
  };
}

export function changeHidePlatformDetails(hidePlatformDetails: boolean): Action {
  return {
    type: 'CHANGE_HIDE_PLATFORM_DETAILS',
    hidePlatformDetails,
  };
}

export type UpdateProfileSelection = (selection: ProfileSelection) => Action;

export function updateProfileSelection(selection: ProfileSelection): Action {
  return {
    type: 'UPDATE_PROFILE_SELECTION',
    selection,
  };
}

export function addRangeFilter(start: number, end: number): Action {
  return {
    type: 'ADD_RANGE_FILTER',
    start, end,
  };
}

export function addRangeFilterAndUnsetSelection(start: number, end: number): ThunkAction {
  return dispatch => {
    dispatch(addRangeFilter(start, end));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export function popRangeFilters(firstRemovedFilterIndex: number): Action {
  return {
    type: 'POP_RANGE_FILTERS',
    firstRemovedFilterIndex,
  };
}

export function popRangeFiltersAndUnsetSelection(firstRemovedFilterIndex: number): ThunkAction {
  return dispatch => {
    dispatch(popRangeFilters(firstRemovedFilterIndex));
    dispatch(updateProfileSelection({ hasSelection: false, isModifying: false }));
  };
}

export function addCallTreeFilter(threadIndex: ThreadIndex, filter: CallTreeFilter): Action {
  return {
    type: 'ADD_CALL_TREE_FILTER',
    threadIndex,
    filter,
  };
}

export function popCallTreeFilters(threadIndex: ThreadIndex, firstRemovedFilterIndex: number): Action {
  return {
    type: 'POP_CALL_TREE_FILTERS',
    threadIndex,
    firstRemovedFilterIndex,
  };
}
