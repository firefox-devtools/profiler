/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import {
  selectorsForThread,
  selectedThreadSelectors,
  getGlobalTracks,
  getGlobalTrackAndIndexByPid,
  getLocalTracks,
} from '../reducers/profile-view';
import {
  getImplementationFilter,
  getSelectedThreadIndex,
  getHiddenGlobalTracks,
  getGlobalTrackOrder,
  getLocalTrackOrder,
  getHiddenLocalTracks,
} from '../reducers/url-state';
import { getCallNodePathFromIndex } from '../profile-logic/profile-data';
import { ensureExists } from '../utils/flow';
import { sendAnalytics } from '../utils/analytics';

import type {
  PreviewSelection,
  ImplementationFilter,
  TrackReference,
} from '../types/actions';
import type { State } from '../types/reducers';
import type { Action, ThunkAction } from '../types/store';
import type { ThreadIndex, IndexIntoMarkersTable, Pid } from '../types/profile';
import type {
  CallNodePath,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  TrackIndex,
} from '../types/profile-derived';
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

export function changeSelectedThread(selectedThreadIndex: ThreadIndex): Action {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThreadIndex,
  };
}

export function focusCallTree(): Action {
  return {
    type: 'FOCUS_CALL_TREE',
  };
}

export function changeRightClickedTrack(
  trackReference: TrackReference
): Action {
  return {
    type: 'CHANGE_RIGHT_CLICKED_TRACK',
    trackReference,
  };
}

export function setCallNodeContextMenuVisibility(isVisible: boolean): Action {
  return {
    type: 'SET_CALL_NODE_CONTEXT_MENU_VISIBILITY',
    isVisible,
  };
}

export function changeGlobalTrackOrder(globalTrackOrder: TrackIndex[]): Action {
  sendAnalytics({
    hitType: 'event',
    eventCategory: 'timeline',
    eventAction: 'change global track order',
  });
  return {
    type: 'CHANGE_GLOBAL_TRACK_ORDER',
    globalTrackOrder,
  };
}

export function hideGlobalTrack(trackIndex: TrackIndex): ThunkAction<void> {
  return (dispatch, getState) => {
    const hiddenGlobalTracks = getHiddenGlobalTracks(getState());
    if (hiddenGlobalTracks.has(trackIndex)) {
      // This track is already hidden, don't do anything.
      return;
    }

    const globalTrackToHide = getGlobalTracks(getState())[trackIndex];
    let selectedThreadIndex = getSelectedThreadIndex(getState());

    // Re-select the selectedThreadIndex if it is hidden with this operation.
    if (globalTrackToHide.type === 'process') {
      // This is a process global track, this operation could potentially hide
      // the selectedThreadIndex.
      let isSelectedThreadIndexHidden =
        globalTrackToHide.mainThreadIndex === selectedThreadIndex;

      // Check in the local tracks for the selectedThreadIndex
      if (!isSelectedThreadIndexHidden) {
        for (const localTrack of getLocalTracks(
          getState(),
          globalTrackToHide.pid
        )) {
          if (
            localTrack.type === 'thread' &&
            localTrack.threadIndex === selectedThreadIndex
          ) {
            isSelectedThreadIndexHidden = true;
            break;
          }
        }
      }
      if (isSelectedThreadIndexHidden) {
        selectedThreadIndex = _findOtherVisibleThread(getState, trackIndex);
      }
    }

    if (selectedThreadIndex === null) {
      // Hiding this process would make it so that there is no selected thread.
      // Bail out.
      return;
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'hide global track',
    });

    dispatch({
      type: 'HIDE_GLOBAL_TRACK',
      trackIndex,
      selectedThreadIndex,
    });
  };
}

export function showGlobalTrack(trackIndex: TrackIndex): ThunkAction<void> {
  return dispatch => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'show global track',
    });

    dispatch({
      type: 'SHOW_GLOBAL_TRACK',
      trackIndex,
    });
  };
}

export function isolateGlobalTrack(
  isolatedTrackIndex: TrackIndex
): ThunkAction<void> {
  return (dispatch, getState) => {
    const track = getGlobalTracks(getState())[isolatedTrackIndex];
    const trackIndexes = getGlobalTrackOrder(getState());

    if (track.type !== 'process') {
      // Do not isolate a track unless it is a process, that way a thread
      // will always be visible.
      return;
    }

    let selectedThreadIndex = getSelectedThreadIndex(getState());
    const localTracks = getLocalTracks(getState(), track.pid);
    const isSelectedThreadInLocalTracks = localTracks.some(
      track =>
        track.type === 'thread' || track.threadIndex === selectedThreadIndex
    );

    // Check to see if this selectedThreadIndex will be hidden.
    if (
      selectedThreadIndex !== track.mainThreadIndex &&
      !isSelectedThreadInLocalTracks
    ) {
      // The selectedThreadIndex will be hidden, reselect another one.
      if (track.mainThreadIndex === null) {
        // Try and select a thread in the local tracks.
        for (const track of localTracks) {
          if (track.type === 'thread') {
            selectedThreadIndex = track.threadIndex;
            break;
          }
        }
      } else {
        // Select the main thread.
        selectedThreadIndex = track.mainThreadIndex;
      }

      if (selectedThreadIndex === null) {
        // No thread could be found, so do not isolate this process.
        return;
      }
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'isolate global track',
    });

    dispatch({
      type: 'ISOLATE_GLOBAL_TRACK',
      hiddenGlobalTracks: new Set(
        trackIndexes.filter(i => i !== isolatedTrackIndex)
      ),
      isolatedTrackIndex,
      selectedThreadIndex,
    });
  };
}

export function changeLocalTrackOrder(
  pid: Pid,
  localTrackOrder: TrackIndex[]
): Action {
  sendAnalytics({
    hitType: 'event',
    eventCategory: 'timeline',
    eventAction: 'change local track order',
  });
  return {
    type: 'CHANGE_LOCAL_TRACK_ORDER',
    pid,
    localTrackOrder,
  };
}

/**
 * This function walks the current global and local tracks and attempts to find another
 * visible thread to show. If it can't then it returns null. There is a bit of
 * complexity to this function because it's shared between the action creators
 * that both hide that global tracks, and local tracks. When hiding a global track,
 * then it will not have a local track to ignore. When hiding local track, it will
 * need to ignore the local track index that's being hidden, AND the global track
 * that it's attached to, as it's already been checked.
 */
function _findOtherVisibleThread(
  getState: () => State,
  // Either this global track is already hidden, or it has been taken into account.
  globalTrackIndexToIgnore: TrackIndex,
  // This is helpful when hiding a new local track index, it won't be selected.
  localTrackIndexToIgnore?: TrackIndex
): ThreadIndex | null {
  const globalTracks = getGlobalTracks(getState());
  const globalTrackOrder = getGlobalTrackOrder(getState());
  const globalHiddenTracks = getHiddenGlobalTracks(getState());

  for (const globalTrackIndex of globalTrackOrder) {
    const globalTrack = globalTracks[globalTrackIndex];
    if (
      // This track has already been accounted for.
      globalTrackIndex === globalTrackIndexToIgnore ||
      // This global track is hidden.
      globalHiddenTracks.has(globalTrackIndex) ||
      globalTrack.type !== 'process'
    ) {
      continue;
    }

    if (globalTrack.mainThreadIndex !== null) {
      // Found a thread index from a global track.
      return globalTrack.mainThreadIndex;
    }

    const localTracks = getLocalTracks(getState(), globalTrack.pid);
    const localTrackOrder = getLocalTrackOrder(getState(), globalTrack.pid);
    const hiddenLocalTracks = getHiddenLocalTracks(getState(), globalTrack.pid);

    for (const trackIndex of localTrackOrder) {
      const track = localTracks[trackIndex];
      if (!hiddenLocalTracks.has(trackIndex)) {
        // This track is visible.
        if (track.type === 'thread' && trackIndex !== localTrackIndexToIgnore) {
          return track.threadIndex;
        }
      }
    }
  }

  // None was found.
  return null;
}

export function hideLocalTrack(
  pid: Pid,
  trackIndexToHide: TrackIndex
): ThunkAction<void> {
  return (dispatch, getState) => {
    const localTracks = getLocalTracks(getState(), pid);
    const hiddenLocalTracks = getHiddenLocalTracks(getState(), pid);
    const localTrackToHide = localTracks[trackIndexToHide];
    const selectedThreadIndex = getSelectedThreadIndex(getState());
    let nextSelectedThreadIndex: ThreadIndex | null =
      localTrackToHide.type === 'thread' &&
      localTrackToHide.threadIndex === selectedThreadIndex
        ? null
        : selectedThreadIndex;

    if (hiddenLocalTracks.has(trackIndexToHide)) {
      // This is attempting to hide an already hidden track, don't do anything.
      return;
    }

    const { globalTrack, globalTrackIndex } = getGlobalTrackAndIndexByPid(
      getState(),
      pid
    );

    if (hiddenLocalTracks.size + 1 === localTracks.length) {
      // Hiding one more local track will hide all of the tracks for this process.
      // At this point two different cases need to be handled:
      //   1.) There is a main thread for the process, go ahead and hide all the
      //       local tracks.
      //   2.) There is no main thread for the process, attempt to hide the
      //       processes' global track.
      if (globalTrack.mainThreadIndex === null) {
        // Since the process has no main thread, the entire process should be hidden.
        dispatch(hideGlobalTrack(globalTrackIndex));
        return;
      }

      // Continue hiding the last local track.
    }

    if (nextSelectedThreadIndex === null) {
      // The current selectedThreadIndex is being hidden. There can be a few cases
      // that need to be handled:
      //
      // 1. A sibling thread exists, and is not hidden. Use that.
      // 2. No visible sibling thread exists
      //   2a. Use the main thread of the process if it has one.
      //   2b. Find the first available process or track that is not hidden.
      //   2c. No more visible thread indexes exist, do not hide this thread.

      // Case 1:
      for (let trackIndex = 0; trackIndex < localTracks.length; trackIndex++) {
        const track = localTracks[trackIndex];
        if (!hiddenLocalTracks.has(trackIndex)) {
          // This track is visible.
          if (track.type === 'thread' && trackIndex !== trackIndexToHide) {
            nextSelectedThreadIndex = track.threadIndex;
            break;
          }
        }
      }

      if (
        nextSelectedThreadIndex === null &&
        globalTrack.mainThreadIndex !== null
      ) {
        // Case 2a: Use the current process's main thread.
        nextSelectedThreadIndex = globalTrack.mainThreadIndex;
      }

      if (nextSelectedThreadIndex === null) {
        // Case 2b: Try and find another threadIndex.
        nextSelectedThreadIndex = _findOtherVisibleThread(
          getState,
          globalTrackIndex,
          trackIndexToHide
        );
      }

      if (nextSelectedThreadIndex === null) {
        // Case 2c: No more visible threads exist, bail out.
        return;
      }
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'hide local track',
    });

    dispatch({
      type: 'HIDE_LOCAL_TRACK',
      pid,
      trackIndex: trackIndexToHide,
      selectedThreadIndex: nextSelectedThreadIndex,
    });
  };
}

export function showLocalTrack(
  pid: Pid,
  trackIndex: TrackIndex
): ThunkAction<void> {
  return dispatch => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'show local track',
    });

    dispatch({
      type: 'SHOW_LOCAL_TRACK',
      trackIndex,
      pid,
    });
  };
}

export function isolateLocalTrack(
  pid: Pid,
  isolatedTrackIndex: TrackIndex
): ThunkAction<void> {
  return (dispatch, getState) => {
    const localTrackToIsolate = getLocalTracks(getState(), pid)[
      isolatedTrackIndex
    ];
    const { globalTrack, globalTrackIndex } = getGlobalTrackAndIndexByPid(
      getState(),
      pid
    );
    // The track order is merely a convenient way to get a list of track indexes.
    const globalTrackIndexes = getGlobalTrackOrder(getState());
    const localTrackIndexes = getLocalTrackOrder(getState(), pid);

    // Try to find a selected thread index.
    let selectedThreadIndex = null;
    if (localTrackToIsolate.type === 'thread') {
      selectedThreadIndex = localTrackToIsolate.threadIndex;
    } else if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex !== null
    ) {
      selectedThreadIndex = globalTrack.mainThreadIndex;
    }

    if (selectedThreadIndex === null) {
      // Isolating this track would mean that there is no selected thread index.
      // bail out of this operation.
      return;
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'isolate local track',
    });

    dispatch({
      type: 'ISOLATE_LOCAL_TRACK',
      pid,
      hiddenGlobalTracks: new Set(
        globalTrackIndexes.filter(i => i !== globalTrackIndex)
      ),
      hiddenLocalTracks: new Set(
        localTrackIndexes.filter(i => i !== isolatedTrackIndex)
      ),
      selectedThreadIndex,
    });
  };
}

let _callTreeSearchAnalyticsSent = false;

export function changeCallTreeSearchString(searchString: string): Action {
  if (!_callTreeSearchAnalyticsSent) {
    // Only send this event once, since it could be fired frequently with typing.
    _callTreeSearchAnalyticsSent = true;
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'call tree search string',
    });
  }
  return {
    type: 'CHANGE_CALL_TREE_SEARCH_STRING',
    searchString,
  };
}

export function expandAllCallNodeDescendants(
  threadIndex: ThreadIndex,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo
): ThunkAction<void> {
  return (dispatch, getState) => {
    const expandedCallNodeIndexes = selectedThreadSelectors.getExpandedCallNodeIndexes(
      getState()
    );
    const tree = selectedThreadSelectors.getCallTree(getState());

    // Create a set with the selected call node and its descendants
    const descendants = tree.getAllDescendants(callNodeIndex);
    descendants.add(callNodeIndex);
    // And also add all the call nodes that already were expanded
    expandedCallNodeIndexes.forEach(callNodeIndex => {
      if (callNodeIndex !== null) {
        descendants.add(callNodeIndex);
      }
    });

    const expandedCallNodePaths = [...descendants].map(callNodeIndex =>
      getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
    );
    dispatch(changeExpandedCallNodes(threadIndex, expandedCallNodePaths));
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
    const threadIndex = ensureExists(
      getSelectedThreadIndex(getState()),
      'Attempting to add an implementation filter when no thread is currently selected.'
    );
    const transformedThread = selectedThreadSelectors.getRangeAndTransformFilteredThread(
      getState()
    );

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'change implementation filter',
      eventLabel: implementation,
    });

    dispatch({
      type: 'CHANGE_IMPLEMENTATION_FILTER',
      implementation,
      threadIndex,
      transformedThread,
      previousImplementation,
    });
  };
}

export function changeInvertCallstack(
  invertCallstack: boolean
): ThunkAction<void> {
  return (dispatch, getState) => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'change invert callstack',
    });
    dispatch({
      type: 'CHANGE_INVERT_CALLSTACK',
      invertCallstack,
      selectedThreadIndex: getSelectedThreadIndex(getState()),
      callTree: selectedThreadSelectors.getCallTree(getState()),
      callNodeTable: selectedThreadSelectors.getCallNodeInfo(getState())
        .callNodeTable,
    });
  };
}

export function updatePreviewSelection(
  previewSelection: PreviewSelection
): Action {
  return {
    type: 'UPDATE_PREVIEW_SELECTION',
    previewSelection,
  };
}

export function commitRange(start: number, end: number): Action {
  return {
    type: 'COMMIT_RANGE',
    start,
    end,
  };
}

export function popCommittedRanges(firstPoppedFilterIndex: number): Action {
  return {
    type: 'POP_COMMITTED_RANGES',
    firstPoppedFilterIndex,
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
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'add transform',
      eventLabel: transform.type,
    });
  };
}

export function popTransformsFromStack(
  firstPoppedFilterIndex: number
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadIndex = getSelectedThreadIndex(getState());
    dispatch({
      type: 'POP_TRANSFORMS_FROM_STACK',
      threadIndex,
      firstPoppedFilterIndex,
    });
  };
}
