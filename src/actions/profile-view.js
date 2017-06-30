/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import type {
  ProfileSelection,
  CallTreeFilter,
  ImplementationFilter,
} from '../types/actions';
import type { Action, ThunkAction } from '../types/store';
import type {
  ThreadIndex,
  IndexIntoFuncTable,
  IndexIntoMarkersTable,
} from '../types/profile';

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
    selectedFuncStack,
    threadIndex,
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

export function hideThread(
  threadIndex: ThreadIndex,
  threadOrder: ThreadIndex[],
  hiddenThreads: ThreadIndex[]
): ThunkAction<void> {
  return dispatch => {
    // Do not allow hiding the last thread.
    if (hiddenThreads.length + 1 === threadOrder.length) {
      return;
    }

    dispatch(
      ({
        type: 'HIDE_THREAD',
        threadIndex,
        threadOrder,
        hiddenThreads,
      }: Action)
    );
  };
}

export function showThread(threadIndex: ThreadIndex): Action {
  return {
    type: 'SHOW_THREAD',
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
    threadIndex,
    expandedFuncStacks,
  };
}

export function changeSelectedMarker(
  threadIndex: ThreadIndex,
  selectedMarker: IndexIntoMarkersTable | -1
): Action {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker,
    threadIndex,
  };
}

export function changeImplementationFilter(
  implementation: ImplementationFilter
): Action {
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

export function changeHidePlatformDetails(
  hidePlatformDetails: boolean
): Action {
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
    start,
    end,
  };
}

export function addRangeFilterAndUnsetSelection(
  start: number,
  end: number
): ThunkAction<void> {
  return dispatch => {
    dispatch(addRangeFilter(start, end));
    dispatch(
      updateProfileSelection({ hasSelection: false, isModifying: false })
    );
  };
}

export function popRangeFilters(firstRemovedFilterIndex: number): Action {
  return {
    type: 'POP_RANGE_FILTERS',
    firstRemovedFilterIndex,
  };
}

export function popRangeFiltersAndUnsetSelection(
  firstRemovedFilterIndex: number
): ThunkAction<void> {
  return dispatch => {
    dispatch(popRangeFilters(firstRemovedFilterIndex));
    dispatch(
      updateProfileSelection({ hasSelection: false, isModifying: false })
    );
  };
}

export function addCallTreeFilter(
  threadIndex: ThreadIndex,
  filter: CallTreeFilter
): Action {
  return {
    type: 'ADD_CALL_TREE_FILTER',
    threadIndex,
    filter,
  };
}

export function popCallTreeFilters(
  threadIndex: ThreadIndex,
  firstRemovedFilterIndex: number
): Action {
  return {
    type: 'POP_CALL_TREE_FILTERS',
    threadIndex,
    firstRemovedFilterIndex,
  };
}

export function mergeFunction(
  funcIndex: IndexIntoFuncTable,
  threadIndex: ThreadIndex
) {
  return {
    type: 'MERGE_FUNCTION',
    funcIndex,
    threadIndex,
  };
}

export function unmergeFunction(
  funcIndex: IndexIntoFuncTable,
  threadIndex: ThreadIndex
) {
  return {
    type: 'UNMERGE_FUNCTION',
    funcIndex,
    threadIndex,
  };
}

export function mergeSubtree(
  funcIndex: IndexIntoFuncTable,
  threadIndex: ThreadIndex
) {
  return {
    type: 'MERGE_SUBTREE',
    funcIndex,
    threadIndex,
  };
}

export function unmergeSubtree(
  funcIndex: IndexIntoFuncTable,
  threadIndex: ThreadIndex
) {
  return {
    type: 'UNMERGE_SUBTREE',
    funcIndex,
    threadIndex,
  };
}
