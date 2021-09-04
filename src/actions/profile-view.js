/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';
import { getLastVisibleThreadTabSlug } from 'firefox-profiler/selectors/app';
import {
  getCounterSelectors,
  getGlobalTracks,
  getGlobalTrackAndIndexByPid,
  getLocalTracks,
  getLocalTrackFromReference,
  getGlobalTrackFromReference,
  getPreviewSelection,
  getActiveTabGlobalTrackFromReference,
  getActiveTabResourceTrackFromReference,
} from 'firefox-profiler/selectors/profile';
import {
  getThreadSelectors,
  getThreadSelectorsFromThreadsKey,
  selectedThreadSelectors,
} from 'firefox-profiler/selectors/per-thread';
import {
  getImplementationFilter,
  getSelectedThreadIndexes,
  getSelectedThreadsKey,
  getHiddenGlobalTracks,
  getGlobalTrackOrder,
  getLocalTrackOrder,
  getSelectedTab,
  getHiddenLocalTracks,
  getInvertCallstack,
  getHash,
} from 'firefox-profiler/selectors/url-state';
import {
  getCallNodePathFromIndex,
  getSampleIndexToCallNodeIndex,
  getSampleCategories,
  findBestAncestorCallNode,
} from 'firefox-profiler/profile-logic/profile-data';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import { sendAnalytics } from 'firefox-profiler/utils/analytics';
import { objectShallowEquals } from 'firefox-profiler/utils/index';

import type {
  PreviewSelection,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  TrackReference,
  TimelineType,
  DataSource,
  ActiveTabTrackReference,
  State,
  Action,
  ThunkAction,
  ThreadIndex,
  Pid,
  IndexIntoSamplesTable,
  CallNodePath,
  CallNodeInfo,
  IndexIntoCallNodeTable,
  TrackIndex,
  MarkerIndex,
  Transform,
  ThreadsKey,
  Milliseconds,
} from 'firefox-profiler/types';
import type { TabSlug } from '../app-logic/tabs-handling';
import { funcHasRecursiveCall } from '../profile-logic/transforms';
import { changeStoredProfileNameInDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';

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
  threadsKey: ThreadsKey,
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
    threadsKey,
  };
}

/**
 * This action is used when the user right clicks on a call node (in panels such
 * as the call tree, the flame chart, or the stack chart). It's especially used
 * to display the context menu.
 */
export function changeRightClickedCallNode(
  threadsKey: ThreadsKey,
  callNodePath: CallNodePath | null
) {
  return {
    type: 'CHANGE_RIGHT_CLICKED_CALL_NODE',
    threadsKey,
    callNodePath,
  };
}

/**
 * Given a threadIndex and a sampleIndex, select the call node at the top ("leaf")
 * of that sample's stack.
 */
export function selectLeafCallNode(
  threadsKey: ThreadsKey,
  sampleIndex: IndexIntoSamplesTable
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    // The newSelectedStack could be undefined if there are 0 samples.
    const newSelectedStack = filteredThread.samples.stack[sampleIndex];

    const newSelectedCallNode =
      newSelectedStack === null || newSelectedStack === undefined
        ? -1
        : callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
    dispatch(
      changeSelectedCallNode(
        threadsKey,
        getCallNodePathFromIndex(
          newSelectedCallNode,
          callNodeInfo.callNodeTable
        )
      )
    );
  };
}

/**
 * Given a threadIndex and a sampleIndex, select the call node at the bottom ("root")
 * of that sample's stack.
 */
export function selectRootCallNode(
  threadsKey: ThreadsKey,
  sampleIndex: IndexIntoSamplesTable
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    const newSelectedStack = filteredThread.samples.stack[sampleIndex];
    if (newSelectedStack === null || newSelectedStack === undefined) {
      return;
    }
    const newSelectedCallNode =
      callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];

    const selectedCallNodePath = getCallNodePathFromIndex(
      newSelectedCallNode,
      callNodeInfo.callNodeTable
    );
    const rootCallNodePath = [selectedCallNodePath[0]];

    dispatch(
      changeSelectedCallNode(threadsKey, rootCallNodePath, selectedCallNodePath)
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
  threadsKey: ThreadsKey,
  sampleIndex: IndexIntoSamplesTable
): ThunkAction<boolean> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const fullThread = threadSelectors.getRangeFilteredThread(getState());
    const filteredThread = threadSelectors.getFilteredThread(getState());
    const unfilteredStack = fullThread.samples.stack[sampleIndex];
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    if (unfilteredStack === null) {
      return false;
    }

    const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
    const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(
      filteredThread.samples.stack,
      stackIndexToCallNodeIndex
    );
    const clickedCallNode = sampleIndexToCallNodeIndex[sampleIndex];
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
      sampleIndexToCallNodeIndex,
      sampleCategories,
      clickedCallNode,
      clickedCategory
    );

    // In one dispatch, change the selected call node to the best ancestor call node, but
    // also expand out to the clicked call node.
    dispatch(
      changeSelectedCallNode(
        threadsKey,
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
 * This selects a set of thread from thread indexes.
 * Please use it in tests only.
 */
export function changeSelectedThreads(
  selectedThreadIndexes: Set<ThreadIndex>
): Action {
  return {
    type: 'CHANGE_SELECTED_THREAD',
    selectedThreadIndexes,
  };
}

/**
 * This selects a track from its reference.
 * This will ultimately select the thread that this track belongs to, using its
 * thread index, and may also change the selected tab if it makes sense for this
 * track.
 */
export function selectTrack(
  trackReference: TrackReference,
  modifier: 'none' | 'ctrl'
): ThunkAction<void> {
  return (dispatch, getState) => {
    const currentlySelectedTab = getSelectedTab(getState());
    // These get assigned based on the track type.
    let selectedThreadIndex = null;
    let selectedTab = currentlySelectedTab;

    switch (trackReference.type) {
      case 'global': {
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
          case 'visual-progress':
          case 'perceptual-visual-progress':
          case 'contentful-visual-progress':
            // Do not allow selecting these tracks.
            return;
          default:
            throw assertExhaustiveCheck(
              globalTrack,
              `Unhandled GlobalTrack type.`
            );
        }
        break;
      }
      case 'local': {
        // Handle the case of local tracks.
        const localTrack = getLocalTrackFromReference(
          getState(),
          trackReference
        );

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
          case 'ipc':
            selectedThreadIndex = localTrack.threadIndex;
            selectedTab = 'marker-chart';
            break;
          case 'memory': {
            const { counterIndex } = localTrack;
            const counterSelectors = getCounterSelectors(counterIndex);
            const counter = counterSelectors.getCommittedRangeFilteredCounter(
              getState()
            );
            selectedThreadIndex = counter.mainThreadIndex;
            break;
          }
          case 'event-delay': {
            selectedThreadIndex = localTrack.threadIndex;
            break;
          }
          default:
            throw assertExhaustiveCheck(
              localTrack,
              `Unhandled LocalTrack type.`
            );
        }
        break;
      }
      default:
        throw assertExhaustiveCheck(
          trackReference,
          'Unhandled TrackReference type'
        );
    }

    const doesNextTrackHaveSelectedTab = getThreadSelectors(selectedThreadIndex)
      .getUsefulTabs(getState())
      .includes(selectedTab);

    if (!doesNextTrackHaveSelectedTab) {
      // If the user switches to another track that doesn't have the current
      // selectedTab then switch to the calltree.
      selectedTab = 'calltree';
    }

    let selectedThreadIndexes = new Set(getSelectedThreadIndexes(getState()));
    switch (modifier) {
      case 'none':
        // Only select the single thread.
        selectedThreadIndexes = new Set([selectedThreadIndex]);
        break;
      case 'ctrl':
        // Toggle the selection.
        if (selectedThreadIndexes.has(selectedThreadIndex)) {
          selectedThreadIndexes.delete(selectedThreadIndex);
          if (selectedThreadIndexes.size === 0) {
            // Always keep at least one thread selected.
            return;
          }
        } else {
          selectedThreadIndexes.add(selectedThreadIndex);
        }
        break;
      default:
        assertExhaustiveCheck(modifier, 'Unhandled modifier case.');
        break;
    }

    dispatch({
      type: 'SELECT_TRACK',
      selectedThreadIndexes,
      selectedTab,
    });
  };
}

/**
 * This selects an active tab track from its reference.
 * This will ultimately select the thread that this track belongs to, using its
 * thread index, and may also change the selected tab if it makes sense for this
 * track.
 */
export function selectActiveTabTrack(
  trackReference: ActiveTabTrackReference
): ThunkAction<void> {
  return (dispatch, getState) => {
    const currentlySelectedTab = getSelectedTab(getState());
    const currentlySelectedThreadIndex = getSelectedThreadIndexes(getState());
    // These get assigned based on the track type.
    let selectedThreadIndexes;
    let selectedTab = currentlySelectedTab;

    switch (trackReference.type) {
      case 'global': {
        // Handle the case of global tracks.
        const globalTrack = getActiveTabGlobalTrackFromReference(
          getState(),
          trackReference
        );

        // Go through each type, and determine the selected slug and thread index.
        switch (globalTrack.type) {
          case 'tab': {
            selectedThreadIndexes = new Set([...globalTrack.threadIndexes]);
            // Ensure a relevant thread-based tab is used.
            if (selectedTab === 'network-chart') {
              selectedTab = getLastVisibleThreadTabSlug(getState());
            }
            break;
          }
          case 'screenshots':
            // Do not allow selecting this track.
            return;
          default:
            throw assertExhaustiveCheck(
              globalTrack,
              `Unhandled ActiveTabGlobalTrack type.`
            );
        }
        break;
      }
      case 'resource': {
        // Handle the case of resource tracks.
        const resourceTrack = getActiveTabResourceTrackFromReference(
          getState(),
          trackReference
        );

        // Go through each type, and determine the selected slug and thread index.
        switch (resourceTrack.type) {
          case 'sub-frame':
          case 'thread': {
            selectedThreadIndexes = new Set([resourceTrack.threadIndex]);
            // Ensure a relevant thread-based tab is used.
            if (selectedTab === 'network-chart') {
              selectedTab = getLastVisibleThreadTabSlug(getState());
            }
            break;
          }
          default:
            throw assertExhaustiveCheck(
              resourceTrack,
              `Unhandled ActiveTabResourceTrack type.`
            );
        }
        break;
      }
      default:
        throw assertExhaustiveCheck(
          trackReference,
          'Unhandled TrackReference type'
        );
    }

    const doesNextTrackHaveSelectedTab = getThreadSelectors(
      selectedThreadIndexes
    )
      .getUsefulTabs(getState())
      .includes(selectedTab);

    if (!doesNextTrackHaveSelectedTab) {
      // If the user switches to another track that doesn't have the current
      // selectedTab then switch to the calltree.
      selectedTab = 'calltree';
    }

    if (
      currentlySelectedTab === selectedTab &&
      currentlySelectedThreadIndex === selectedThreadIndexes
    ) {
      return;
    }

    dispatch({
      type: 'SELECT_TRACK',
      selectedThreadIndexes,
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
  trackReference: TrackReference | null
): Action {
  return {
    type: 'CHANGE_RIGHT_CLICKED_TRACK',
    trackReference,
  };
}

export function setContextMenuVisibility(isVisible: boolean): Action {
  return {
    type: 'SET_CONTEXT_MENU_VISIBILITY',
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

    const globalTracks = getGlobalTracks(getState());
    if (globalTracks.length === hiddenGlobalTracks.size + 1) {
      // Bail out if attempting to hide the last global track.
      return;
    }

    const globalTrackToHide = globalTracks[trackIndex];
    const newSelectedThreadIndexes: Set<ThreadIndex> = new Set(
      getSelectedThreadIndexes(getState())
    );

    // Find another selectedThreadIndex if the current selected thread is hidden
    // with this operation.
    if (globalTrackToHide.type === 'process') {
      // This is a process global track, this operation could potentially hide
      // the selectedThreadIndex.
      if (globalTrackToHide.mainThreadIndex !== null) {
        newSelectedThreadIndexes.delete(globalTrackToHide.mainThreadIndex);
      }

      // Check in the local tracks for the selectedThreadIndex
      if (newSelectedThreadIndexes.size !== 0) {
        for (const localTrack of getLocalTracks(
          getState(),
          globalTrackToHide.pid
        )) {
          if (localTrack.type === 'thread') {
            newSelectedThreadIndexes.delete(localTrack.threadIndex);
            break;
          }
        }
      }
      if (newSelectedThreadIndexes.size === 0) {
        const threadIndex = _findOtherVisibleThread(getState, trackIndex);
        if (threadIndex === null) {
          // Could not find another thread index, bail out.
          return;
        }
        newSelectedThreadIndexes.add(threadIndex);
      }
    }

    if (newSelectedThreadIndexes.size === 0) {
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
      selectedThreadIndexes: newSelectedThreadIndexes,
    });
  };
}

/**
 * This action shows all tracks
 */
export function showAllTracks(): ThunkAction<void> {
  return dispatch => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'show all tracks',
    });

    dispatch({
      type: 'SHOW_ALL_TRACKS',
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
    const globalTrack = getGlobalTracks(getState())[isolatedTrackIndex];
    const trackIndexes = getGlobalTrackOrder(getState());
    if (globalTrack.type !== 'process') {
      // Do not isolate a track unless it is a process, that way a thread
      // will always be visible.
      return;
    }

    const oldSelectedThreadIndexes = getSelectedThreadIndexes(getState());
    const localTracks = getLocalTracks(getState(), globalTrack.pid);

    // Carry over the old selected thread indexes to the new ones.
    const newSelectedThreadIndexes = new Set();
    {
      // Consider the global track
      if (
        globalTrack.mainThreadIndex !== null &&
        oldSelectedThreadIndexes.has(globalTrack.mainThreadIndex)
      ) {
        newSelectedThreadIndexes.add(globalTrack.mainThreadIndex);
      }
      // Now look at all of the local tracks
      for (const localTrack of localTracks) {
        if (
          localTrack.threadIndex !== undefined &&
          oldSelectedThreadIndexes.has(localTrack.threadIndex)
        ) {
          newSelectedThreadIndexes.add(localTrack.threadIndex);
        }
      }
    }

    // Check to see if this selectedThreadIndex will be hidden.
    if (newSelectedThreadIndexes.size === 0) {
      // The selectedThreadIndex will be hidden, reselect another one.
      if (globalTrack.mainThreadIndex === null) {
        // Try and select a thread in the local tracks.
        for (const track of localTracks) {
          if (track.type === 'thread') {
            newSelectedThreadIndexes.add(track.threadIndex);
            break;
          }
        }
      } else {
        // Select the main thread.
        newSelectedThreadIndexes.add(globalTrack.mainThreadIndex);
      }

      if (newSelectedThreadIndexes.size === 0) {
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
      selectedThreadIndexes: newSelectedThreadIndexes,
    });
  };
}

/**
 * This function helps to show only the current screenshot and hide all other screenshots.
 */
export function isolateScreenshot(
  isolatedTrackIndex: TrackIndex
): ThunkAction<void> {
  return (dispatch, getState) => {
    const globalTracks = getGlobalTracks(getState());
    const track = globalTracks[isolatedTrackIndex];
    if (track.type !== 'screenshots') {
      // Do not isolate the track unless it is a screenshot track.
      return;
    }
    const selectedThreadIndex = track.threadIndex;
    if (selectedThreadIndex === null) {
      // Make sure that a thread really exists.
      return;
    }
    const hiddenGlobalTracks = new Set(getHiddenGlobalTracks(getState()));
    for (let i = 0; i < globalTracks.length; i++) {
      const track = globalTracks[i];
      if (track.type === 'screenshots' && i !== isolatedTrackIndex) {
        hiddenGlobalTracks.add(i);
      }
    }
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'isolate screenshot track',
    });

    dispatch({
      type: 'ISOLATE_SCREENSHOT_TRACK',
      hiddenGlobalTracks,
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
      selectedThreadIndexes: new Set([selectedThreadIndex]),
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
  globalTrackIndexToIgnore?: TrackIndex,
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
      (globalTrackIndexToIgnore !== undefined &&
        globalTrackIndex === globalTrackIndexToIgnore) ||
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
    const oldSelectedThreadIndexes = getSelectedThreadIndexes(getState());
    const newSelectedThreadIndexes: Set<ThreadIndex> = new Set(
      oldSelectedThreadIndexes
    );

    if (localTrackToHide.type === 'thread') {
      newSelectedThreadIndexes.delete(localTrackToHide.threadIndex);
    }

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

    if (newSelectedThreadIndexes.size === 0) {
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
            newSelectedThreadIndexes.add(track.threadIndex);
            break;
          }
        }
      }

      if (
        newSelectedThreadIndexes.size === 0 &&
        globalTrack.mainThreadIndex !== null &&
        globalTrack.mainThreadIndex !== undefined
      ) {
        // Case 2a: Use the current process's main thread.
        newSelectedThreadIndexes.add(globalTrack.mainThreadIndex);
      }

      if (newSelectedThreadIndexes.size === 0) {
        // Case 2b: Try and find another threadIndex.
        const otherThreadIndex = _findOtherVisibleThread(
          getState,
          globalTrackIndex,
          trackIndexToHide
        );
        if (otherThreadIndex !== null) {
          newSelectedThreadIndexes.add(otherThreadIndex);
        }
      }

      if (newSelectedThreadIndexes.size === 0) {
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
      selectedThreadIndexes: newSelectedThreadIndexes,
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
    const selectedThreadIndexes = new Set();
    if (localTrackToIsolate.type === 'thread') {
      selectedThreadIndexes.add(localTrackToIsolate.threadIndex);
    } else if (
      globalTrack.type === 'process' &&
      globalTrack.mainThreadIndex !== null
    ) {
      selectedThreadIndexes.add(globalTrack.mainThreadIndex);
    }

    if (selectedThreadIndexes.size === 0) {
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
      selectedThreadIndexes,
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
  threadsKey: ThreadsKey,
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
    dispatch(changeExpandedCallNodes(threadsKey, expandedCallNodePaths));
  };
}

export function changeExpandedCallNodes(
  threadsKey: ThreadsKey,
  expandedCallNodePaths: Array<CallNodePath>
): Action {
  return {
    type: 'CHANGE_EXPANDED_CALL_NODES',
    threadsKey,
    expandedCallNodePaths,
  };
}

export function changeSelectedMarker(
  threadsKey: ThreadsKey,
  selectedMarker: MarkerIndex | null
): Action {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker,
    threadsKey,
  };
}
export function changeSelectedNetworkMarker(
  threadsKey: ThreadsKey,
  selectedNetworkMarker: MarkerIndex | null
): Action {
  return {
    type: 'CHANGE_SELECTED_NETWORK_MARKER',
    selectedNetworkMarker,
    threadsKey,
  };
}

/**
 * This action is used when hovering a network marker in the network track (in
 * the timeline) or the network chart (in the bottom part), so that it's also
 * highlighted in the other component.
 * In the future this will be used for other types of markers as well.
 */
export function changeHoveredMarker(
  threadsKey: ThreadsKey,
  hoveredNetworkMarker: MarkerIndex | null
): Action {
  return {
    type: 'CHANGE_HOVERED_MARKER',
    markerIndex: hoveredNetworkMarker,
    threadsKey,
  };
}

/**
 * This action is used when the user right clicks a marker, and is especially
 * used to display its context menu.
 */
export function changeRightClickedMarker(
  threadsKey: ThreadsKey,
  markerIndex: MarkerIndex | null
): Action {
  return {
    type: 'CHANGE_RIGHT_CLICKED_MARKER',
    threadsKey,
    markerIndex,
  };
}

export function changeMarkersSearchString(searchString: string): Action {
  return {
    type: 'CHANGE_MARKER_SEARCH_STRING',
    searchString,
  };
}

export function changeNetworkSearchString(searchString: string): Action {
  return {
    type: 'CHANGE_NETWORK_SEARCH_STRING',
    searchString,
  };
}

export function changeImplementationFilter(
  implementation: ImplementationFilter
): ThunkAction<void> {
  return (dispatch, getState) => {
    const previousImplementation = getImplementationFilter(getState());
    const threadsKey = getSelectedThreadsKey(getState());
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
      threadsKey,
      transformedThread,
      previousImplementation,
    });
  };
}

/**
 * This action changes the strategy used to build and display the call tree. This could
 * use sample data, or build a new call tree based off of allocation information stored
 * in markers.
 */
export function changeCallTreeSummaryStrategy(
  callTreeSummaryStrategy: CallTreeSummaryStrategy
): Action {
  sendAnalytics({
    hitType: 'event',
    eventCategory: 'profile',
    eventAction: 'change call tree summary strategy',
    eventLabel: callTreeSummaryStrategy,
  });

  return {
    type: 'CHANGE_CALL_TREE_SUMMARY_STRATEGY',
    callTreeSummaryStrategy,
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
      selectedThreadIndexes: getSelectedThreadIndexes(getState()),
      callTree: selectedThreadSelectors.getCallTree(getState()),
      callNodeTable: selectedThreadSelectors.getCallNodeInfo(getState())
        .callNodeTable,
    });
  };
}

export function changeShowUserTimings(
  showUserTimings: boolean
): ThunkAction<void> {
  return dispatch => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'toggle user timings',
    });
    dispatch({
      type: 'CHANGE_SHOW_USER_TIMINGS',
      showUserTimings,
    });
  };
}

/**
 * This action toggles changes between using a summary view that shows only self time
 * for the JS tracer data, and a stack-based view (similar to the stack chart) for the
 * JS Tracer panel.
 */
export function changeShowJsTracerSummary(
  showSummary: boolean
): ThunkAction<void> {
  return dispatch => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: showSummary
        ? 'show JS tracer summary'
        : 'show JS tracer stacks',
    });
    dispatch({
      type: 'CHANGE_SHOW_JS_TRACER_SUMMARY',
      showSummary,
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
    end = end + 0.000001; // Adds 1ns
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
  threadsKey: ThreadsKey,
  transform: Transform
): ThunkAction<void> {
  return (dispatch, getState) => {
    const transformedThread = getThreadSelectorsFromThreadsKey(
      threadsKey
    ).getRangeAndTransformFilteredThread(getState());

    dispatch({
      type: 'ADD_TRANSFORM_TO_STACK',
      threadsKey,
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
    const threadsKey = getSelectedThreadsKey(getState());
    dispatch({
      type: 'POP_TRANSFORMS_FROM_STACK',
      threadsKey,
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

export function changeProfileName(
  profileName: string | null
): ThunkAction<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch({
      type: 'CHANGE_PROFILE_NAME',
      profileName,
    });

    if (window.indexedDB) {
      const hash = getHash(getState());
      await changeStoredProfileNameInDb(hash, profileName || '');
    }

    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'change profile name',
    });
  };
}

export function setDataSource(dataSource: DataSource): Action {
  return {
    type: 'SET_DATA_SOURCE',
    dataSource,
  };
}

export function changeMouseTimePosition(
  mouseTimePosition: Milliseconds | null
): Action {
  return {
    type: 'CHANGE_MOUSE_TIME_POSITION',
    mouseTimePosition,
  };
}

export function closeBottomBox(): ThunkAction<void> {
  return (dispatch, getState) => {
    const tab = getSelectedTab(getState());
    dispatch({
      type: 'CLOSE_BOTTOM_BOX_FOR_TAB',
      tab,
    });
  };
}

export function createSourceTabIfNeededAndSelect(
  file: string,
  currentTab: TabSlug
): Action {
  return {
    type: 'CREATE_SOURCE_TAB_IF_NEEDED_AND_SELECT',
    tab: {
      file,
    },
    currentTab,
  };
}

export function changeSelectedSourceTab(index: number): Action {
  return {
    type: 'CHANGE_SELECTED_SOURCE_TAB',
    index,
  };
}

export function changeSourceTabOrder(order: number[]): Action {
  return {
    type: 'CHANGE_SOURCE_TAB_ORDER',
    order,
  };
}

export function handleCallNodeTransformShortcut(
  event: SyntheticKeyboardEvent<>,
  threadsKey: ThreadsKey,
  callNodeIndex: IndexIntoCallNodeTable
): ThunkAction<void> {
  return (dispatch, getState) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const unfilteredThread = threadSelectors.getThread(getState());
    const { callNodeTable } = threadSelectors.getCallNodeInfo(getState());
    const implementation = getImplementationFilter(getState());
    const inverted = getInvertCallstack(getState());
    const callNodePath = getCallNodePathFromIndex(callNodeIndex, callNodeTable);
    const funcIndex = callNodeTable.func[callNodeIndex];

    switch (event.key) {
      case 'F':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'focus-subtree',
            callNodePath: callNodePath,
            implementation,
            inverted,
          })
        );
        break;
      case 'f':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'focus-function',
            funcIndex,
          })
        );
        break;
      case 'M':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'merge-call-node',
            callNodePath: callNodePath,
            implementation,
          })
        );
        break;
      case 'm':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'merge-function',
            funcIndex,
          })
        );
        break;
      case 'd':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'drop-function',
            funcIndex,
          })
        );
        break;
      case 'C': {
        const { funcTable } = unfilteredThread;
        const resourceIndex = funcTable.resource[funcIndex];
        // A new collapsed func will be inserted into the table at the end. Deduce
        // the index here.
        const collapsedFuncIndex = funcTable.length;
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'collapse-resource',
            resourceIndex,
            collapsedFuncIndex,
            implementation,
          })
        );
        break;
      }
      case 'r': {
        if (funcHasRecursiveCall(unfilteredThread, implementation, funcIndex)) {
          dispatch(
            addTransformToStack(threadsKey, {
              type: 'collapse-direct-recursion',
              funcIndex,
              implementation,
            })
          );
        }
        break;
      }
      case 'c': {
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'collapse-function-subtree',
            funcIndex,
          })
        );
        break;
      }
      default:
      // This did not match a call tree transform.
    }
  };
}
