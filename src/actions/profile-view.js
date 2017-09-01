/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  selectorsForThread,
  selectedThreadSelectors,
} from '../reducers/profile-view';
import {
  getImplementationFilter,
  getSelectedThreadIndex,
} from '../reducers/url-state';

import type { ProfileSelection, ImplementationFilter } from '../types/actions';
import type { Action, ThunkAction } from '../types/store';
import type { ThreadIndex, IndexIntoMarkersTable } from '../types/profile';
import type { CallNodePath } from '../types/profile-derived';
import type { Transform } from '../types/transforms';
/**
 * The actions that pertain to changing the view on the profile, including searching
 * and filtering. Currently the call tree's actions are in this file, but should be
 * split apart. These actions should most likely affect every panel.
 */
export function changeSelectedCallNode(
  threadIndex: ThreadIndex,
  selectedCallNodePath: CallNodePath
): Action {
  return {
    type: 'CHANGE_SELECTED_CALL_NODE',
    selectedCallNodePath,
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

export function changeExpandedCallNodes(
  threadIndex: ThreadIndex,
  expandedCallNodePaths: Array<CallNodePath>
): Action {
  return {
    type: 'CHANGE_EXPANDED_CALL_NODES',
    threadIndex,
    expandedCallNodePaths,
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

export function changeMarkersSearchString(searchString: string): Action {
  return {
    type: 'CHANGE_MARKER_SEARCH_STRING',
    searchString,
  };
}

export function changeImplementationFilter(
  implementation: ImplementationFilter
): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousImplementation = getImplementationFilter(getState());
    const threadIndex = getSelectedThreadIndex(getState());
    const transformedThread = selectedThreadSelectors.getRangeAndTransformFilteredThread(
      getState()
    );

    dispatch({
      type: 'CHANGE_IMPLEMENTATION_FILTER',
      implementation,
      threadIndex,
      transformedThread,
      previousImplementation,
    });
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

export function addTransformToStack(
  threadIndex: ThreadIndex,
  transform: Transform
): ThunkAction<void> {
  return (dispatch, getState) => {
    const transformedThread = selectorsForThread(
      threadIndex
    ).getRangeAndTransformFilteredThread(getState());

    dispatch({
      type: 'ADD_TRANSFORM_TO_STACK',
      threadIndex,
      transform,
      transformedThread,
    });
  };
}

export function popTransformsFromStack(
  threadIndex: ThreadIndex,
  firstRemovedFilterIndex: number
): Action {
  return {
    type: 'POP_TRANSFORMS_FROM_STACK',
    threadIndex,
    firstRemovedFilterIndex,
  };
}
