/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import { getLastVisibleThreadTabSlug } from '../reducers/app';
import {
  selectorsForThread,
  selectedThreadSelectors,
  getGlobalTracks,
  getGlobalTrackAndIndexByPid,
  getLocalTracks,
  getLocalTrackFromReference,
  getGlobalTrackFromReference,
  getPreviewSelection,
} from '../reducers/profile-view';
import {
  getImplementationFilter,
  getSelectedThreadIndex,
  getHiddenGlobalTracks,
  getGlobalTrackOrder,
  getLocalTrackOrder,
  getHiddenLocalTracks,
  getSelectedTab,
} from '../reducers/url-state';
import {
  getCallNodePathFromIndex,
  getSampleCallNodes,
  getSampleCategories,
  findBestAncestorCallNode,
} from '../profile-logic/profile-data';
import { ensureExists, assertExhaustiveCheck } from '../utils/flow';
import { sendAnalytics } from '../utils/analytics';
import { objectShallowEquals } from '../utils/index';

import type {
  PreviewSelection,
  ImplementationFilter,
  TrackReference,
  TimelineType,
} from '../types/actions';
import type { State } from '../types/reducers';
import type { Action, ThunkAction } from '../types/store';
import type {
  ThreadIndex,
  IndexIntoMarkersTable,
  Pid,
  IndexIntoSamplesTable,
} from '../types/profile';
import type {
  CallNodePath,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  TrackIndex,
} from '../types/profile-derived';
import type { Transform } from '../types/transforms';

/**
 * This file contains actions that pertain to changing the view on the profile, including
 * searching and filtering. Currently the call tree's actions are in this file, but
 * should be split apart. These actions should most likely affect every panel.
 */

/**
 * Select a call node for a given thread. An optional call node path can be provided
 * to expand child nodes beyond the selected call node path.
 *
 * Note that optionalExpandedToCallNodePath, if specified, must be a descendant call node
 * of selectedCallNodePath.
 */
export function changeSelectedCallNode(
  threadIndex: ThreadIndex,
  selectedCallNodePath: CallNodePath,
  optionalExpandedToCallNodePath?: CallNodePath
): Action {
  if (optionalExpandedToCallNodePath) {
    for (let i = 0; i < selectedCallNodePath.length; i++) {
      if (selectedCallNodePath[i] !== optionalExpandedToCallNodePath[i]) {
        // This assertion ensures that the selectedCallNode will be correctly expanded.
        throw new Error(
          oneLine`
            The optional expanded call node path provided to the changeSelectedCallNode
            must contain the selected call node path.
          `
        );
      }
    }
  }
  return {
    type: 'CHANGE_SELECTED_CALL_NODE',
    selectedCallNodePath,
    optionalExpandedToCallNodePath,
    threadIndex,
  };
}

/**
 * Given a threadIndex and a sampleIndex, select the call node at the top ("leaf")
 * of that sample's stack.
 */
export function selectLeafCallNode(
  threadIndex: ThreadIndex,
  sampleIndex: IndexIntoSamplesTable
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = selectorsForThread(threadIndex);
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    const newSelectedStack = filteredThread.samples.stack[sampleIndex];
    const newSelectedCallNode =
      newSelectedStack === null
        ? -1
        : callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
    dispatch(
      changeSelectedCallNode(
        threadIndex,
        getCallNodePathFromIndex(
          newSelectedCallNode,
          callNodeInfo.callNodeTable
        )
      )
    );
  };
}

/**
 * This function provides a different strategy for selecting call nodes. It selects
 * a "best" ancestor call node, but also expands out its children nodes to the
 * actual call node that was clicked. See findBestAncestorCallNode for more
 * on the "best" call node.
 */
export function selectBestAncestorCallNodeAndExpandCallTree(
  threadIndex: ThreadIndex,
  sampleIndex: IndexIntoSamplesTable
): ThunkAction<boolean> {
  return (dispatch, getState) => {
    const threadSelectors = selectorsForThread(threadIndex);
    const fullThread = threadSelectors.getRangeFilteredThread(getState());
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const unfilteredStack = fullThread.samples.stack[sampleIndex];
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    if (unfilteredStack === null) {
      return false;
    }

    const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
    const sampleCallNodes = getSampleCallNodes(
      filteredThread.samples,
      stackIndexToCallNodeIndex
    );
    const clickedCallNode = sampleCallNodes[sampleIndex];
    const clickedCategory = fullThread.stackTable.category[unfilteredStack];

    if (clickedCallNode === null) {
      return false;
    }

    const sampleCategories = getSampleCategories(
      fullThread.samples,
      fullThread.stackTable
    );
    const bestAncestorCallNode = findBestAncestorCallNode(
      callNodeInfo,
      sampleCallNodes,
      sampleCategories,
      clickedCallNode,
      clickedCategory
    );

    // In one dispatch, change the selected call node to the best ancestor call node, but
    // also expand out to the clicked call node.
    dispatch(
      changeSelectedCallNode(
        threadIndex,
        // Select the best ancestor call node.
        getCallNodePathFromIndex(bestAncestorCallNode, callNodeTable),
        // Also expand the children nodes out further below it to what was actually
        // clicked.
        getCallNodePathFromIndex(clickedCallNode, callNodeTable)
      )
    );
    return true;
  };
}

/**
 * This selects a thread from its thread index.
 * Please use it in tests only.
 */
export function changeSelectedThread(selectedThreadIndex: ThreadIndex): Action {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThreadIndex,
  };
}

/**
 * This selects a track from its reference.
 * This will ultimately select the thread that this track belongs to, using its
 * thread index, and may also change the selected tab if it makes sense for this
 * track.
 */
export function selectTrack(trackReference: TrackReference): ThunkAction<void> {
  return (dispatch, getState) => {
    const currentlySelectedTab = getSelectedTab(getState());
    const currentlySelectedThreadIndex = getSelectedThreadIndex(getState());
    // These get assigned based on the track type.
    let selectedThreadIndex = null;
    let selectedTab = currentlySelectedTab;

    if (trackReference.type === 'global') {
      // Handle the case of global tracks.
      const globalTrack = getGlobalTrackFromReference(
        getState(),
        trackReference
      );

      // Go through each type, and determine the selected slug and thread index.
      switch (globalTrack.type) {
        case 'process': {
          if (globalTrack.mainThreadIndex === null) {
            // Do not allow selecting process tracks without a thread index.
            return;
          }
          selectedThreadIndex = globalTrack.mainThreadIndex;
          // Ensure a relevant thread-based tab is used.
          if (selectedTab === 'network-chart') {
            selectedTab = getLastVisibleThreadTabSlug(getState());
          }
          break;
        }
        case 'screenshots':
          // Do not allow selecting screenshots.
          return;
        default:
          throw assertExhaustiveCheck(
            globalTrack,
            `Unhandled GlobalTrack type.`
          );
      }
    } else {
      // Handle the case of local tracks.
      const localTrack = getLocalTrackFromReference(getState(), trackReference);

      // Go through each type, and determine the tab slug and thread index.
      switch (localTrack.type) {
        case 'thread': {
          // Ensure a relevant thread-based tab is used.
          selectedThreadIndex = localTrack.threadIndex;
          if (selectedTab === 'network-chart') {
            selectedTab = getLastVisibleThreadTabSlug(getState());
          }
          break;
        }
        case 'network':
          selectedThreadIndex = localTrack.threadIndex;
          selectedTab = 'network-chart';
          break;
        case 'memory':
          // TODO - Currently disable selecting memory.
          return;
        default:
          throw assertExhaustiveCheck(localTrack, `Unhandled LocalTrack type.`);
      }
    }

    if (
      currentlySelectedTab === selectedTab &&
      currentlySelectedThreadIndex === selectedThreadIndex
    ) {
      return;
    }

    dispatch({
      type: 'SELECT_TRACK',
      selectedThreadIndex,
      selectedTab,
    });
  };
}

export function focusCallTree(): Action {
  return {
    type: 'FOCUS_CALL_TREE',
  };
}

/**
 * This action is used when the user right clicks a track, and is especially
 * used to display its context menu.
 */
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

/**
 * This action is used to change the displayed order of the global tracks.
 */
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

/**
 * This action is used to hide a global track.
 * During this process we select a different thread if the hidden track is the
 * currently selected thread. We also prevent from hiding the last displayed
 * thread.
 */
export function hideGlobalTrack(trackIndex: TrackIndex): ThunkAction<void> {
  return (dispatch, getState) => {
    const hiddenGlobalTracks = getHiddenGlobalTracks(getState());
    if (hiddenGlobalTracks.has(trackIndex)) {
      // This track is already hidden, don't do anything.
      return;
    }

    const globalTrackToHide = getGlobalTracks(getState())[trackIndex];
    let selectedThreadIndex = getSelectedThreadIndex(getState());

    // Find another selectedThreadIndex if the current selected thread is hidden
    // with this operation.
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

/**
 * This action shows a specific global track.
 */
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

/**
 * This function isolates a process global track, and leaves its local tracks visible.
 */
export function isolateProcess(
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
        track.type === 'thread' && track.threadIndex === selectedThreadIndex
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
      eventAction: 'isolate process',
    });

    dispatch({
      type: 'ISOLATE_PROCESS',
      hiddenGlobalTracks: new Set(
        trackIndexes.filter(i => i !== isolatedTrackIndex)
      ),
      isolatedTrackIndex,
      selectedThreadIndex,
    });
  };
}

/**
 * This function isolates a global track, and hides all of its local tracks.
 */
export function isolateProcessMainThread(
  isolatedTrackIndex: TrackIndex
): ThunkAction<void> {
  return (dispatch, getState) => {
    const track = getGlobalTracks(getState())[isolatedTrackIndex];
    const trackIndexes = getGlobalTrackOrder(getState());

    if (track.type !== 'process') {
      // Do not isolate a track unless it is a process track.
      return;
    }

    const selectedThreadIndex = track.mainThreadIndex;
    if (selectedThreadIndex === null) {
      // Make sure that a thread really exists.
      return;
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'isolate process main thread',
    });

    dispatch({
      type: 'ISOLATE_PROCESS_MAIN_THREAD',
      pid: track.pid,
      hiddenGlobalTracks: new Set(
        trackIndexes.filter(i => i !== isolatedTrackIndex)
      ),
      isolatedTrackIndex,
      selectedThreadIndex,
      // The local track order contains all of the indexes, and all should be hidden
      // when isolating the main thread.
      hiddenLocalTracks: new Set(getLocalTrackOrder(getState(), track.pid)),
    });
  };
}

/**
 * This action changes the track order among local tracks only.
 */
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

/**
 * This action hides a local track.
 * This handles the case where the user hides the last local track in a thread:
 * in that case we hide the global track for this thread. In the case where this
 * is the selected thread we also take care to select another thread.  We also
 * prevent from hiding the last thread.
 */
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

/**
 * This action simply displays a local track from its track index and its Pid.
 */
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

/**
 * This action isolates a local track. This means we will hide all other tracks.
 */
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
): ThunkAction<void> {
  return (dispatch, getState) => {
    const currentPreviewSelection = getPreviewSelection(getState());
    if (!objectShallowEquals(currentPreviewSelection, previewSelection)) {
      // Only dispatch if the selection changes. This function can fire in a tight loop,
      // and this check saves a dispatch.
      dispatch({
        type: 'UPDATE_PREVIEW_SELECTION',
        previewSelection,
      });
    }
  };
}

export function commitRange(start: number, end: number): Action {
  if (end === start) {
    // Ensure that the duration of the range is non-zero.
    end = end + 0.0001;
  }
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

export function changeTimelineType(timelineType: TimelineType): Action {
  return {
    type: 'CHANGE_TIMELINE_TYPE',
    timelineType,
  };
}
