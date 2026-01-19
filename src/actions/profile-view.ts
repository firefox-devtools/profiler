/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { oneLine } from 'common-tags';
import { getLastVisibleThreadTabSlug } from 'firefox-profiler/selectors/app';
import {
  getCommittedRange,
  getCounterSelectors,
  getGlobalTracks,
  getGlobalTrackAndIndexByPid,
  getLocalTracks,
  getLocalTrackFromReference,
  getGlobalTrackFromReference,
  getPreviewSelection,
  getLocalTracksByPid,
  getThreads,
  getLastNonShiftClick,
} from 'firefox-profiler/selectors/profile';
import {
  getThreadSelectors,
  getThreadSelectorsFromThreadsKey,
  selectedThreadSelectors,
} from 'firefox-profiler/selectors/per-thread';
import {
  getAllCommittedRanges,
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
  assertExhaustiveCheck,
  getFirstItemFromSet,
  ensureExists,
} from 'firefox-profiler/utils/types';
import { sendAnalytics } from 'firefox-profiler/utils/analytics';
import { objectShallowEquals } from 'firefox-profiler/utils/index';
import {
  getTrackReferenceFromTid,
  getTrackReferenceFromThreadIndex,
} from 'firefox-profiler/profile-logic/tracks';

import type {
  PreviewSelection,
  ImplementationFilter,
  CallTreeSummaryStrategy,
  TrackReference,
  TimelineType,
  DataSource,
  State,
  Action,
  ThunkAction,
  ThreadIndex,
  Pid,
  IndexIntoSamplesTable,
  CallNodePath,
  IndexIntoCallNodeTable,
  IndexIntoResourceTable,
  TrackIndex,
  MarkerIndex,
  Transform,
  ThreadsKey,
  Milliseconds,
  Tid,
  GlobalTrack,
  KeyboardModifiers,
  TableViewOptions,
  SelectionContext,
  BottomBoxInfo,
} from 'firefox-profiler/types';
import {
  funcHasDirectRecursiveCall,
  funcHasRecursiveCall,
} from '../profile-logic/transforms';
import { changeStoredProfileNameInDb } from 'firefox-profiler/app-logic/uploaded-profiles-db';
import type { TabSlug } from '../app-logic/tabs-handling';
import type { CallNodeInfo } from '../profile-logic/call-node-info';
import { intersectSets } from 'firefox-profiler/utils/set';

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
  context: SelectionContext = { source: 'auto' },
  optionalExpandedToCallNodePath?: CallNodePath
): ThunkAction<void> {
  return (dispatch, getState) => {
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
    const isInverted = getInvertCallstack(getState());
    dispatch({
      type: 'CHANGE_SELECTED_CALL_NODE',
      isInverted,
      selectedCallNodePath,
      optionalExpandedToCallNodePath,
      threadsKey,
      context,
    });
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
): Action {
  return {
    type: 'CHANGE_RIGHT_CLICKED_CALL_NODE',
    threadsKey,
    callNodePath,
  };
}

/**
 * Given a threadIndex and a sampleIndex, select the call node which carries the
 * sample's self time. In the inverted tree, this will be a root node.
 */
export function selectSelfCallNode(
  threadsKey: ThreadsKey,
  sampleIndex: IndexIntoSamplesTable | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const sampleCallNodes =
      threadSelectors.getSampleIndexToNonInvertedCallNodeIndexForFilteredThread(
        getState()
      );

    if (
      sampleIndex === null ||
      sampleIndex < 0 ||
      sampleIndex >= sampleCallNodes.length
    ) {
      dispatch(changeSelectedCallNode(threadsKey, []));
      return;
    }

    const nonInvertedSelfCallNode = sampleCallNodes[sampleIndex];
    if (nonInvertedSelfCallNode === null) {
      dispatch(changeSelectedCallNode(threadsKey, []));
      return;
    }

    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());

    // Compute the call path based on the non-inverted call node table.
    // We're not calling callNodeInfo.getCallNodePathFromIndex here because we
    // only have a non-inverted call node index, which wouldn't be accepted by
    // the inverted call node info.
    const callNodeTable = callNodeInfo.getCallNodeTable();
    const callNodePath = [];
    let cni = nonInvertedSelfCallNode;
    while (cni !== -1) {
      callNodePath.push(callNodeTable.func[cni]);
      cni = callNodeTable.prefix[cni];
    }

    if (callNodeInfo.isInverted()) {
      // In the inverted tree, we want to select the inverted tree root node
      // with the "self" function, and also expand the path to the non-inverted root.
      dispatch(
        changeSelectedCallNode(
          threadsKey,
          callNodePath.slice(0, 1), // Select a root node
          { source: 'auto' },
          callNodePath // Expand the full path
        )
      );
    } else {
      // In the non-inverted tree, we want to select the self node.
      dispatch(changeSelectedCallNode(threadsKey, callNodePath.reverse()));
    }
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

// This structure contains information needed to find the selected track from a
// track reference.
type TrackInformation = {
  type: 'global' | 'local';
  // This is the thread index for this specific track reference. This is null if
  // this track isn't a thread track.
  threadIndex: null | ThreadIndex;
  // This is the thread index for the thread related to this track.
  relatedThreadIndex: ThreadIndex;
  // This is the track index for the global track where this track is located.
  globalTrackIndex: TrackIndex;
  // This is the PID for the process that this track belongs to.
  pid: Pid;
  // This is the track index of the local track in its process group. This is
  // null for global tracks.
  localTrackIndex: null | TrackIndex;
  // This is the tab that should be selected from this track. `null` if this
  // track doesn't have a prefered tab.
  relatedTab: null | TabSlug;
  // This is the track reference that was passed to
  // getInformationFromTrackReference to generate this structure.
  trackReference: TrackReference;
};

/**
 * This function collects some information about a track by requesting
 * information in the state. Because of all possible cases this isn't trivial.
 * This will return null for tracks that are not selectable.
 */
function getInformationFromTrackReference(
  state: State,
  trackReference: TrackReference
): null | TrackInformation {
  switch (trackReference.type) {
    case 'global': {
      // Handle the case of global tracks.
      const globalTrack = getGlobalTrackFromReference(state, trackReference);

      // Go through each type, and determine the selected slug and thread index.
      switch (globalTrack.type) {
        case 'process': {
          const { mainThreadIndex, pid } = globalTrack;
          if (mainThreadIndex === null) {
            // Do not allow selecting process tracks without a thread index.
            return null;
          }

          return {
            type: 'global',
            trackReference,
            threadIndex: mainThreadIndex,
            relatedThreadIndex: mainThreadIndex,
            globalTrackIndex: trackReference.trackIndex,
            pid,
            localTrackIndex: null,
            // Move to a relevant thread-based tab when the previous tab was
            // the network chart.
            relatedTab:
              getSelectedTab(state) === 'network-chart'
                ? getLastVisibleThreadTabSlug(state)
                : null,
          };
        }
        case 'screenshots':
        case 'visual-progress':
        case 'perceptual-visual-progress':
        case 'contentful-visual-progress':
          // Do not allow selecting these tracks.
          return null;
        default:
          throw assertExhaustiveCheck(
            globalTrack,
            `Unhandled GlobalTrack type.`
          );
      }
    }
    case 'local': {
      // Handle the case of local tracks.
      const localTrack = getLocalTrackFromReference(state, trackReference);
      const { globalTrackIndex } = getGlobalTrackAndIndexByPid(
        state,
        trackReference.pid
      );
      const commonLocalProperties = {
        type: 'local' as const,
        trackReference,
        pid: trackReference.pid,
        globalTrackIndex,
        localTrackIndex: trackReference.trackIndex,
      };

      // Go through each type, and determine the tab slug and thread index.
      switch (localTrack.type) {
        case 'thread':
          return {
            ...commonLocalProperties,
            threadIndex: localTrack.threadIndex,
            relatedThreadIndex: localTrack.threadIndex,
            // Move to a relevant thread-based tab when the previous tab was
            // the network chart.
            relatedTab:
              getSelectedTab(state) === 'network-chart'
                ? getLastVisibleThreadTabSlug(state)
                : null,
          };
        case 'network':
          return {
            ...commonLocalProperties,
            threadIndex: null,
            relatedThreadIndex: localTrack.threadIndex,
            relatedTab: 'network-chart',
          };
        case 'marker':
        case 'ipc':
          return {
            ...commonLocalProperties,
            threadIndex: null,
            relatedThreadIndex: localTrack.threadIndex,
            relatedTab: 'marker-chart',
          };
        case 'event-delay':
          return {
            ...commonLocalProperties,
            threadIndex: null,
            relatedThreadIndex: localTrack.threadIndex,
            relatedTab: null,
          };
        case 'memory':
        case 'bandwidth':
        case 'process-cpu':
        case 'power': {
          const counterSelectors = getCounterSelectors(localTrack.counterIndex);
          const counter = counterSelectors.getCounter(state);
          return {
            ...commonLocalProperties,
            threadIndex: null,
            relatedThreadIndex: counter.mainThreadIndex,
            relatedTab: null,
          };
        }
        default:
          throw assertExhaustiveCheck(localTrack, `Unhandled LocalTrack type.`);
      }
    }
    default:
      throw assertExhaustiveCheck(
        trackReference,
        'Unhandled TrackReference type'
      );
  }
}

/**
 * This Redux action selects one track only from its reference as well as the
 * related tab.
 */
function setOneTrackSelection(
  trackInformation: TrackInformation,
  selectedTab: TabSlug
): Action {
  const selectedThreadIndexes = new Set([trackInformation.relatedThreadIndex]);
  return {
    type: 'SELECT_TRACK',
    selectedThreadIndexes,
    selectedTab,
    lastNonShiftClickInformation: {
      clickedTrack: trackInformation.trackReference,
      selection: selectedThreadIndexes,
    },
  };
}

/*
 * This thunk action changes the current selection, by either selecting this
 * additional track, or unselecting if it's already selected.
 */
function toggleOneTrack(
  trackInformation: TrackInformation,
  selectedTab: TabSlug
): ThunkAction<void> {
  return (dispatch, getState) => {
    const selectedThreadIndexes = new Set(getSelectedThreadIndexes(getState()));
    // Toggle the selection.
    if (selectedThreadIndexes.has(trackInformation.relatedThreadIndex)) {
      selectedThreadIndexes.delete(trackInformation.relatedThreadIndex);
      if (selectedThreadIndexes.size === 0) {
        // Always keep at least one thread selected. Bail out.
        return;
      }
    } else {
      selectedThreadIndexes.add(trackInformation.relatedThreadIndex);
    }
    dispatch({
      type: 'SELECT_TRACK',
      selectedThreadIndexes,
      selectedTab,
      lastNonShiftClickInformation: {
        clickedTrack: trackInformation.trackReference,
        selection: selectedThreadIndexes,
      },
    });
  };
}

/**
 * This compares the relative order of two tracks.
 * Returns:
 *   < 0 => if trackA is above track B
 *   > 0 => if trackB is above track A
 *   0   => if trackA and trackB represent the same track
 */
function compareTrackOrder(
  state: State,
  trackA: TrackInformation,
  trackB: TrackInformation
): number {
  if (trackA.globalTrackIndex === trackB.globalTrackIndex) {
    // Same global track!
    // Then we need to look at their local order
    // If one is a global track, its localTrackIndex is null, and therefore the
    // indexOf operation will return -1, which is exactly what we want.
    const localTrackOrder: ReadonlyArray<TrackIndex | null> =
      getLocalTrackOrder(state, trackA.pid);
    const orderA = localTrackOrder.indexOf(trackA.localTrackIndex);
    const orderB = localTrackOrder.indexOf(trackB.localTrackIndex);
    return orderA - orderB;
  }
  // Different global tracks, let's check the global track order
  const globalTrackOrder = getGlobalTrackOrder(state);
  const orderA = globalTrackOrder.indexOf(trackA.globalTrackIndex);
  const orderB = globalTrackOrder.indexOf(trackB.globalTrackIndex);

  return orderA - orderB;
}

/**
 * This computes the set of threads that's between two tracks (including
 * themselves). This skips over hidden tracks.
 */
function findThreadsBetweenTracks(
  state: State,
  fromTrack: TrackInformation,
  toTrack: TrackInformation
): Array<ThreadIndex> {
  const globalTracks = getGlobalTracks(state);
  const globalTrackOrder = getGlobalTrackOrder(state);
  const hiddenGlobalTracks = getHiddenGlobalTracks(state);

  const foundThreadIndexes = [];

  // Check the relative order of from and to, and possibly invert them
  if (compareTrackOrder(state, fromTrack, toTrack) > 0) {
    [toTrack, fromTrack] = [fromTrack, toTrack];
  }

  // Where are they located in the track order?
  const fromGlobalOrder = globalTrackOrder.indexOf(fromTrack.globalTrackIndex);
  const toGlobalOrder = globalTrackOrder.indexOf(toTrack.globalTrackIndex);

  for (
    let globalOrderIndex = fromGlobalOrder;
    globalOrderIndex <= toGlobalOrder;
    globalOrderIndex++
  ) {
    const globalTrackIndex = globalTrackOrder[globalOrderIndex];
    if (hiddenGlobalTracks.has(globalTrackIndex)) {
      continue;
    }
    const globalTrack = globalTracks[globalTrackIndex];
    if (globalTrack.type !== 'process') {
      continue;
    }

    const localTrackOrder = getLocalTrackOrder(state, globalTrack.pid);
    const hiddenLocalTracks = getHiddenLocalTracks(state, globalTrack.pid);
    const localTracks = getLocalTracks(state, globalTrack.pid);

    let shouldAddStartGlobalTrack = true;
    let localTrackOrderStart = 0;
    let localTrackOrderEnd = localTrackOrder.length - 1;
    if (globalOrderIndex === fromGlobalOrder) {
      // This is the first process group, this means we possibly shouldn't add
      // all tracks.
      if (fromTrack.type === 'local') {
        shouldAddStartGlobalTrack = false;
        localTrackOrderStart =
          fromTrack.localTrackIndex === null
            ? -1
            : localTrackOrder.indexOf(fromTrack.localTrackIndex);
      }
    }

    if (globalOrderIndex === toGlobalOrder) {
      // This is the last process group, this means we possibly shouldn't add
      // all tracks.
      if (toTrack.type === 'global') {
        // No local track should be added
        localTrackOrderEnd = -1;
      } else {
        localTrackOrderEnd =
          toTrack.localTrackIndex === null
            ? -1
            : localTrackOrder.indexOf(toTrack.localTrackIndex);
      }
    }

    // Add the global track if it's not a virtual track and not out of the range.
    if (shouldAddStartGlobalTrack && globalTrack.mainThreadIndex !== null) {
      foundThreadIndexes.push(globalTrack.mainThreadIndex);
    }

    // Then add the local tracks.
    for (
      let localTrackOrderIndex = localTrackOrderStart;
      localTrackOrderIndex <= localTrackOrderEnd;
      localTrackOrderIndex++
    ) {
      const localTrackIndex = localTrackOrder[localTrackOrderIndex];
      if (hiddenLocalTracks.has(localTrackIndex)) {
        continue;
      }
      const localTrack = localTracks[localTrackIndex];
      if (localTrack.type !== 'thread') {
        continue;
      }
      foundThreadIndexes.push(localTrack.threadIndex);
    }
  }

  // Also add the related threads, just like the user clicked them without using
  // the shift modifier.
  foundThreadIndexes.push(fromTrack.relatedThreadIndex);
  foundThreadIndexes.push(toTrack.relatedThreadIndex);

  return foundThreadIndexes;
}

/**
 * This thunk action selects a range of tracks that are between 2 clicked
 * tracks.
 */
function selectRangeOfTracks(
  clickedTrackInformation: TrackInformation,
  selectedTab: TabSlug
): ThunkAction<void> {
  return (dispatch, getState) => {
    const lastNonShiftClickInformation = getLastNonShiftClick(getState());

    let lastClickedTrack =
      lastNonShiftClickInformation && lastNonShiftClickInformation.clickedTrack;
    if (!lastClickedTrack) {
      const selectedThreadIndexes = getSelectedThreadIndexes(getState());
      const threadIndex = getFirstItemFromSet(selectedThreadIndexes);
      if (threadIndex !== undefined) {
        lastClickedTrack = getTrackReferenceFromThreadIndex(
          threadIndex,
          getGlobalTracks(getState()),
          getLocalTracksByPid(getState())
        );
      }
    }

    if (lastClickedTrack) {
      const lastClickedTrackInformation = getInformationFromTrackReference(
        getState(),
        lastClickedTrack
      );
      if (lastClickedTrackInformation) {
        const foundThreadIndexes = findThreadsBetweenTracks(
          getState(),
          lastClickedTrackInformation,
          clickedTrackInformation
        );
        const newSelectedThreadIndexes = new Set([
          ...foundThreadIndexes,
          ...(lastNonShiftClickInformation
            ? lastNonShiftClickInformation.selection
            : []),
        ]);

        dispatch({
          type: 'SELECT_TRACK',
          selectedThreadIndexes: newSelectedThreadIndexes,
          selectedTab,
          // In this case, we keep the old information.
          // This allows the user to do shift+click again to cancel the last
          // shift+click and do it again.
          lastNonShiftClickInformation,
        });
        return;
      }
    }

    // If we couldn't select a range for some reason, then select just the
    // clicked track. Most likely the user just loaded a profile with several
    // selected tracks, and tried to use shift-click immediately.
    dispatch(setOneTrackSelection(clickedTrackInformation, selectedTab));
  };
}

/**
 * This selects a track from its reference.
 * This will ultimately select the thread that this track belongs to, using its
 * thread index, and may also change the selected tab if it makes sense for this
 * track.
 */
export function selectTrackWithModifiers(
  trackReference: TrackReference,
  modifiers: Partial<KeyboardModifiers> = {}
): ThunkAction<void> {
  return (dispatch, getState) => {
    // These get assigned based on the track type.
    const clickedTrackInformation = getInformationFromTrackReference(
      getState(),
      trackReference
    );
    if (!clickedTrackInformation) {
      // This track isn't selectable.
      return;
    }

    let selectedTab =
      clickedTrackInformation.relatedTab ?? getSelectedTab(getState());
    const visibleTabs = getThreadSelectors(
      clickedTrackInformation.relatedThreadIndex
    ).getUsefulTabs(getState());
    if (!visibleTabs.includes(selectedTab)) {
      // If the user switches to another track that doesn't have the current
      // selectedTab then switch to the first tab.
      selectedTab = visibleTabs[0];
    }

    if (modifiers.shift) {
      dispatch(selectRangeOfTracks(clickedTrackInformation, selectedTab));
    } else if (modifiers.ctrlOrMeta) {
      dispatch(toggleOneTrack(clickedTrackInformation, selectedTab));
    } else {
      dispatch(setOneTrackSelection(clickedTrackInformation, selectedTab));
    }
  };
}

/**
 * Selects the track from the provided tid.
 * Since it can be either a global track or local track, we check its type first
 * and select it depending on that. Also, we check if the track is visible or
 * not, and make it visible if it's hidden.
 */
export function selectTrackFromTid(tid: Tid): ThunkAction<void> {
  return (dispatch, getState) => {
    const globalTracks = getGlobalTracks(getState());
    const localTracksByPid = getLocalTracksByPid(getState());
    const threads = getThreads(getState());
    const trackReference = getTrackReferenceFromTid(
      tid,
      globalTracks,
      localTracksByPid,
      threads
    );

    if (trackReference === null) {
      // Return early if we failed to find the thread from tid.
      console.warn(`Failed to find a track with tid: ${tid}`);
      return;
    }

    // Make the track visible just in case if it's hidden.
    // It's safe to call them even if they are already visible.
    switch (trackReference.type) {
      case 'global':
        dispatch(showGlobalTrack(trackReference.trackIndex));
        break;
      case 'local': {
        const { globalTrackIndex } = getGlobalTrackAndIndexByPid(
          getState(),
          trackReference.pid
        );
        dispatch(showGlobalTrack(globalTrackIndex));
        dispatch(showLocalTrack(trackReference.pid, trackReference.trackIndex));
        break;
      }
      default:
        throw assertExhaustiveCheck(
          trackReference,
          'Unhandled TrackReference type.'
        );
    }

    dispatch(selectTrackWithModifiers(trackReference));
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
    _removeSelectedThreadIndexesForGlobalTrack(
      getState,
      newSelectedThreadIndexes,
      globalTrackToHide,
      trackIndex
    );

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
      pid: globalTrackToHide.type === 'process' ? globalTrackToHide.pid : null,
      selectedThreadIndexes: newSelectedThreadIndexes,
    });
  };
}

/**
 * Find another selectedThreadIndex if the current selected thread is hidden
 * with this operation.
 */
function _removeSelectedThreadIndexesForGlobalTrack(
  getState: () => State,
  selectedThreadIndexes: Set<ThreadIndex>,
  globalTrackToHide: GlobalTrack,
  trackIndex: TrackIndex
) {
  if (globalTrackToHide.type === 'process') {
    // This is a process global track, this operation could potentially hide
    // the selectedThreadIndex.
    if (globalTrackToHide.mainThreadIndex !== null) {
      selectedThreadIndexes.delete(globalTrackToHide.mainThreadIndex);
    }

    // Check in the local tracks for the selectedThreadIndex
    if (selectedThreadIndexes.size !== 0) {
      for (const localTrack of getLocalTracks(
        getState(),
        globalTrackToHide.pid
      )) {
        if (localTrack.type === 'thread') {
          selectedThreadIndexes.delete(localTrack.threadIndex);
        }
      }
    }
    if (selectedThreadIndexes.size === 0) {
      const threadIndex = _findOtherVisibleThread(
        getState,
        new Set([trackIndex])
      );
      if (threadIndex === null) {
        // Could not find another thread index, bail out.
        return;
      }
      selectedThreadIndexes.add(threadIndex);
    }
  }
}

/**
 * This action shows all tracks
 */
export function showAllTracks(): ThunkAction<void> {
  return (dispatch) => {
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
 * This action makes the tracks that are provided visible.
 */
export function showProvidedTracks(
  globalTracksToShow: Set<TrackIndex>,
  localTracksByPidToShow: Map<Pid, Set<TrackIndex>>
): ThunkAction<void> {
  return (dispatch, getState) => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'show provided tracks',
    });

    // We got the global and local tracks, but if a local track's global track
    // is not visible, we should still make it visible so the local one can be
    // visible too. Let's iterate over the global tracks and include them if
    // their children are going to be made visible.
    const globalTracks = getGlobalTracks(getState());
    for (const [globalTrackIndex, globalTrack] of globalTracks.entries()) {
      if (
        globalTrack.type === 'process' &&
        globalTrack.pid &&
        localTracksByPidToShow.has(globalTrack.pid)
      ) {
        globalTracksToShow.add(globalTrackIndex);
      }
    }

    dispatch({
      type: 'SHOW_PROVIDED_TRACKS',
      globalTracksToShow,
      localTracksByPidToShow,
    });
  };
}

/**
 * This action makes the tracks that are provided hidden.
 */
export function hideProvidedTracks(
  globalTracksToHide: Set<TrackIndex>,
  localTracksByPidToHide: Map<Pid, Set<TrackIndex>>
): ThunkAction<void> {
  return (dispatch, getState) => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'hide provided tracks',
    });

    const hiddenGlobalTracks = getHiddenGlobalTracks(getState());
    const globalTracks = getGlobalTracks(getState());
    const newHiddenGlobalTrackCount =
      hiddenGlobalTracks.size +
      globalTracksToHide.size -
      intersectSets(hiddenGlobalTracks, globalTracksToHide).size;
    const visibleGlobalTracksLeftAfterHiding =
      newHiddenGlobalTrackCount < globalTracks.length;
    if (!visibleGlobalTracksLeftAfterHiding) {
      // Bail if there isn't any other visible global track left after hiding.
      console.warn('No other visible global track left after hiding');
      return;
    }

    // Remove the threads that are going to be hidden from the selectedThreadIndexes.
    const newSelectedThreadIndexes: Set<ThreadIndex> = new Set(
      getSelectedThreadIndexes(getState())
    );

    for (const trackIndex of globalTracksToHide) {
      const globalTrack = globalTracks[trackIndex];
      _removeSelectedThreadIndexesForGlobalTrack(
        getState,
        newSelectedThreadIndexes,
        globalTrack,
        trackIndex
      );
    }

    for (const [pid, localTracksToHide] of localTracksByPidToHide) {
      const localTracks = getLocalTracks(getState(), pid);
      const hiddenLocalTracks = getHiddenLocalTracks(getState(), pid);
      for (const trackIndex of localTracksToHide) {
        const localTrack = localTracks[trackIndex];
        if (localTrack.type === 'thread') {
          newSelectedThreadIndexes.delete(localTrack.threadIndex);
        }
      }

      const newHiddenLocalTrackCount = new Set([
        ...hiddenLocalTracks,
        ...localTracksToHide,
      ]).size;
      if (newHiddenLocalTrackCount === localTracks.length) {
        // Hiding these local tracks will hide all of the tracks for this process.
        // At this point two different cases need to be handled:
        //   1.) There is a main thread for the process, go ahead and hide all the
        //       local tracks.
        //   2.) There is no main thread for the process, attempt to hide the
        //       processes' global track.
        const { globalTrack, globalTrackIndex } = getGlobalTrackAndIndexByPid(
          getState(),
          pid
        );

        if (
          globalTrack.type === 'process' &&
          globalTrack.mainThreadIndex === null
        ) {
          // Since the process has no main thread, the entire process should be hidden.
          dispatch(hideGlobalTrack(globalTrackIndex));
        }
      }
    }

    if (newSelectedThreadIndexes.size === 0) {
      const otherThreadIndex = _findOtherVisibleThread(
        getState,
        globalTracksToHide,
        localTracksByPidToHide
      );
      if (otherThreadIndex !== null) {
        newSelectedThreadIndexes.add(otherThreadIndex);
      }
    }

    if (newSelectedThreadIndexes.size === 0) {
      // Hiding this process would make it so that there is no selected thread
      // since no more visible threads exist, bail out.
      return;
    }

    dispatch({
      type: 'HIDE_PROVIDED_TRACKS',
      globalTracksToHide,
      localTracksByPidToHide,
      selectedThreadIndexes: newSelectedThreadIndexes,
    });
  };
}

/**
 * This action shows a specific global track.
 */
export function showGlobalTrack(trackIndex: TrackIndex): ThunkAction<void> {
  return (dispatch) => {
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
 * This action shows a specific global track and its local tracks.
 */
export function showGlobalTrackIncludingLocalTracks(
  trackIndex: TrackIndex,
  pid: Pid
): ThunkAction<void> {
  return (dispatch) => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'timeline',
      eventAction: 'show global track including local tracks',
    });

    dispatch({
      type: 'SHOW_GLOBAL_TRACK_INCLUDING_LOCAL_TRACKS',
      trackIndex,
      pid,
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
    const newSelectedThreadIndexes = new Set<ThreadIndex>();
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
          localTrack.type === 'thread' &&
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
      hiddenGlobalTracks: new Set<TrackIndex>(
        trackIndexes.filter((i) => i !== isolatedTrackIndex)
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
    const hiddenGlobalTracks = new Set<TrackIndex>(
      getHiddenGlobalTracks(getState())
    );
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
        trackIndexes.filter((i) => i !== isolatedTrackIndex)
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
 * that it's attached to, as it's already been checked. When hiding multiple
 * tracks that might include global and local tracks, it will need to ignore
 * both global and local tracks.
 */
function _findOtherVisibleThread(
  getState: () => State,
  // Either these global tracks are already hidden, or they have been taken into account.
  globalTrackIndexesToIgnore?: Set<TrackIndex>,
  // This is helpful when hiding new local track indexes, they won't be selected.
  localTrackIndexesToIgnoreByPid?: Map<Pid, Set<TrackIndex>>
): ThreadIndex | null {
  const globalTracks = getGlobalTracks(getState());
  const globalTrackOrder = getGlobalTrackOrder(getState());
  const globalHiddenTracks = getHiddenGlobalTracks(getState());

  for (const globalTrackIndex of globalTrackOrder) {
    const globalTrack = globalTracks[globalTrackIndex];
    if (
      // This track has already been accounted for.
      (globalTrackIndexesToIgnore !== undefined &&
        globalTrackIndexesToIgnore.has(globalTrackIndex)) ||
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
    const localTrackIndexesToIgnore: Set<TrackIndex> =
      localTrackIndexesToIgnoreByPid
        ? (localTrackIndexesToIgnoreByPid.get(globalTrack.pid) ?? new Set())
        : new Set();

    for (const trackIndex of localTrackOrder) {
      const track = localTracks[trackIndex];
      if (!hiddenLocalTracks.has(trackIndex)) {
        // This track is visible.
        if (
          track.type === 'thread' &&
          !localTrackIndexesToIgnore.has(trackIndex)
        ) {
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
      if (
        globalTrack.type === 'process' &&
        globalTrack.mainThreadIndex === null
      ) {
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
        globalTrack.type === 'process' &&
        globalTrack.mainThreadIndex !== null &&
        globalTrack.mainThreadIndex !== undefined
      ) {
        // Case 2a: Use the current process's main thread.
        newSelectedThreadIndexes.add(globalTrack.mainThreadIndex);
      }

      if (newSelectedThreadIndexes.size === 0) {
        // Case 2b: Try and find another threadIndex.
        const globalTrackIndexesToIgnore = new Set([globalTrackIndex]);
        const localTrackIndexesToIgnore = new Map([
          [pid, new Set([trackIndexToHide])],
        ]);
        const otherThreadIndex = _findOtherVisibleThread(
          getState,
          globalTrackIndexesToIgnore,
          localTrackIndexesToIgnore
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
  return (dispatch) => {
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
    const selectedThreadIndexes = new Set<ThreadIndex>();
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
      hiddenGlobalTracks: new Set<TrackIndex>(
        globalTrackIndexes.filter((i) => i !== globalTrackIndex)
      ),
      hiddenLocalTracks: new Set<TrackIndex>(
        localTrackIndexes.filter((i) => i !== isolatedTrackIndex)
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
    const expandedCallNodeIndexes =
      selectedThreadSelectors.getExpandedCallNodeIndexes(getState());
    const tree = selectedThreadSelectors.getCallTree(getState());

    // Create a set with the selected call node and its descendants
    const descendants = tree.getAllDescendants(callNodeIndex);
    descendants.add(callNodeIndex);
    // And also add all the call nodes that already were expanded
    expandedCallNodeIndexes.forEach((callNodeIndex) => {
      if (callNodeIndex !== null) {
        descendants.add(callNodeIndex);
      }
    });

    const expandedCallNodePaths = [...descendants].map((callNodeIndex) =>
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
    dispatch(changeExpandedCallNodes(threadsKey, expandedCallNodePaths));
  };
}

export function changeExpandedCallNodes(
  threadsKey: ThreadsKey,
  expandedCallNodePaths: Array<CallNodePath>
): ThunkAction<void> {
  return (dispatch, getState) => {
    const isInverted = getInvertCallstack(getState());
    dispatch({
      type: 'CHANGE_EXPANDED_CALL_NODES',
      isInverted,
      threadsKey,
      expandedCallNodePaths,
    });
  };
}
export function changeSelectedMarker(
  threadsKey: ThreadsKey,
  selectedMarker: MarkerIndex | null,
  context: SelectionContext = { source: 'auto' }
): Action {
  return {
    type: 'CHANGE_SELECTED_MARKER',
    selectedMarker,
    threadsKey,
    context,
  };
}
export function changeSelectedNetworkMarker(
  threadsKey: ThreadsKey,
  selectedNetworkMarker: MarkerIndex | null,
  context: SelectionContext = { source: 'auto' }
): Action {
  return {
    type: 'CHANGE_SELECTED_NETWORK_MARKER',
    selectedNetworkMarker,
    threadsKey,
    context,
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
    const transformedThread =
      selectedThreadSelectors.getRangeAndTransformFilteredThread(getState());

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
    const callTree = selectedThreadSelectors.getCallTree(getState());
    const selectedCallNode =
      selectedThreadSelectors.getSelectedCallNodeIndex(getState());
    const newSelectedCallNodePath =
      callTree.findHeavyPathToSameFunctionAfterInversion(selectedCallNode);
    dispatch({
      type: 'CHANGE_INVERT_CALLSTACK',
      invertCallstack,
      selectedThreadIndexes: getSelectedThreadIndexes(getState()),
      newSelectedCallNodePath,
    });
  };
}

export function changeShowUserTimings(
  showUserTimings: boolean
): ThunkAction<void> {
  return (dispatch) => {
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

export function changeStackChartSameWidths(
  stackChartSameWidths: boolean
): ThunkAction<void> {
  return (dispatch) => {
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'toggle stack chart same widths',
    });
    dispatch({
      type: 'CHANGE_STACK_CHART_SAME_WIDTHS',
      stackChartSameWidths,
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
  return (dispatch) => {
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
  previewSelection: PreviewSelection | null
): ThunkAction<void> {
  return (dispatch, getState) => {
    // Only dispatch if the selection changes. This function can fire in a tight loop,
    // and this check saves a dispatch.
    const currentPreviewSelection = getPreviewSelection(getState());
    if (
      !currentPreviewSelection ||
      !previewSelection ||
      !objectShallowEquals(currentPreviewSelection, previewSelection)
    ) {
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

export function popCommittedRanges(
  firstPoppedFilterIndex: number
): ThunkAction<void> {
  return (dispatch, getState) => {
    dispatch({
      type: 'POP_COMMITTED_RANGES',
      firstPoppedFilterIndex,
      // If the clicked range is not the last one, make the current committed
      // range the new preview selection, otherwise clear the selection.
      committedRange:
        getAllCommittedRanges(getState()).length !== firstPoppedFilterIndex &&
        getCommittedRange(getState()),
    });
  };
}

export function addTransformToStack(
  threadsKey: ThreadsKey,
  transform: Transform
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const transformedThread =
      threadSelectors.getRangeAndTransformFilteredThread(getState());

    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());
    dispatch({
      type: 'ADD_TRANSFORM_TO_STACK',
      threadsKey,
      transform,
      transformedThread,
      callNodeInfo,
    });
    sendAnalytics({
      hitType: 'event',
      eventCategory: 'profile',
      eventAction: 'add transform',
      eventLabel: transform.type,
    });
  };
}

export function addCollapseResourceTransformToStack(
  threadsKey: ThreadsKey,
  resourceIndex: IndexIntoResourceTable,
  implementation: ImplementationFilter
): ThunkAction<void> {
  return (dispatch, getState) => {
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const reservedFunctionsForResources =
      threadSelectors.getReservedFunctionsForResources(getState());
    const collapsedFuncIndex = ensureExists(
      ensureExists(reservedFunctionsForResources).get(resourceIndex)
    );

    dispatch(
      addTransformToStack(threadsKey, {
        type: 'collapse-resource',
        resourceIndex,
        collapsedFuncIndex,
        implementation,
      })
    );
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

export function changeTableViewOptions(
  tab: TabSlug,
  tableViewOptions: TableViewOptions
): Action {
  return {
    type: 'CHANGE_TABLE_VIEW_OPTIONS',
    tab,
    tableViewOptions,
  };
}

export function updateBottomBoxContentsAndMaybeOpen(
  currentTab: TabSlug,
  bottomBoxInfo: BottomBoxInfo
): Action {
  const {
    libIndex,
    sourceIndex,
    nativeSymbols,
    initialNativeSymbol,
    scrollToLineNumber,
    scrollToInstructionAddress,
    highlightedLineNumber,
    highlightedInstructionAddress,
  } = bottomBoxInfo;

  const haveSource = sourceIndex !== null;
  const haveAssembly = nativeSymbols.length !== 0;

  const shouldOpenBottomBox = haveSource || haveAssembly;

  // By default, only open the source view and keep the assembly
  // view closed - unless the only thing we have is assembly.
  const shouldOpenAssemblyView = !haveSource && haveAssembly;

  return {
    type: 'UPDATE_BOTTOM_BOX',
    libIndex,
    sourceIndex,
    nativeSymbols,
    currentNativeSymbol: initialNativeSymbol,
    currentTab,
    shouldOpenBottomBox,
    shouldOpenAssemblyView,
    scrollToLineNumber,
    scrollToInstructionAddress,
    highlightedLineNumber,
    highlightedInstructionAddress,
  };
}

export function openAssemblyView(): Action {
  return {
    type: 'OPEN_ASSEMBLY_VIEW',
  };
}

export function closeAssemblyView(): Action {
  return {
    type: 'CLOSE_ASSEMBLY_VIEW',
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

export function handleCallNodeTransformShortcut(
  event: React.KeyboardEvent<HTMLElement>,
  threadsKey: ThreadsKey,
  callNodeIndex: IndexIntoCallNodeTable
): ThunkAction<void> {
  return (dispatch, getState) => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const threadSelectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const unfilteredThread = threadSelectors.getThread(getState());
    const callNodeInfo = threadSelectors.getCallNodeInfo(getState());
    const implementation = getImplementationFilter(getState());
    const inverted = getInvertCallstack(getState());
    const callNodePath = callNodeInfo.getCallNodePathFromIndex(callNodeIndex);
    const funcIndex = callNodeInfo.funcForNode(callNodeIndex);
    const category = callNodeInfo.categoryForNode(callNodeIndex);

    const callNodeTable = callNodeInfo.getCallNodeTable();

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
        dispatch(
          addCollapseResourceTransformToStack(
            threadsKey,
            resourceIndex,
            implementation
          )
        );
        break;
      }
      case 'r': {
        if (funcHasRecursiveCall(callNodeTable, funcIndex)) {
          dispatch(
            addTransformToStack(threadsKey, {
              type: 'collapse-recursion',
              funcIndex,
            })
          );
        }
        break;
      }
      case 'R': {
        if (funcHasDirectRecursiveCall(callNodeTable, funcIndex)) {
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
      case 'g':
        dispatch(
          addTransformToStack(threadsKey, {
            type: 'focus-category',
            category,
          })
        );
        break;
      default:
      // This did not match a call tree transform.
    }
  };
}
