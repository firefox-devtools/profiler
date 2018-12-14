/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import memoize from 'memoize-immutable';
import MixedTupleMap from 'mixedtuplemap';
import * as Tracks from '../profile-logic/tracks';
import * as Transforms from '../profile-logic/transforms';
import * as UrlState from './url-state';
import * as ProfileData from '../profile-logic/profile-data';
import * as MarkerData from '../profile-logic/marker-data';
import * as StackTiming from '../profile-logic/stack-timing';
import * as FlameGraph from '../profile-logic/flame-graph';
import * as MarkerTiming from '../profile-logic/marker-timing';
import * as JsTracer from '../profile-logic/js-tracer';
import * as CallTree from '../profile-logic/call-tree';
import { assertExhaustiveCheck, ensureExists } from '../utils/flow';
import { PathSet } from '../utils/path';

import type {
  Profile,
  CategoryList,
  IndexIntoCategoryList,
  Thread,
  ThreadIndex,
  SamplesTable,
  Pid,
  MarkersTable,
  IndexIntoSamplesTable,
  IndexIntoMarkersTable,
  JsTracerTable,
} from '../types/profile';
import type {
  TracingMarker,
  CallNodeInfo,
  CallNodePath,
  IndexIntoCallNodeTable,
  MarkerTimingRows,
  LocalTrack,
  TrackIndex,
  JsTracerTiming,
  GlobalTrack,
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type {
  GlobalTrackReference,
  LocalTrackReference,
  TrackReference,
  PreviewSelection,
} from '../types/actions';
import type { Selector, DangerousSelectorWithArguments } from '../types/store';
import type {
  State,
  ProfileViewState,
  ThreadViewOptions,
  SymbolicationStatus,
  ProfileSharingStatus,
} from '../types/state';
import type { Transform, TransformStack } from '../types/transforms';
import type {
  TimingsForPath,
  SelectedState,
} from '../profile-logic/profile-data';
import type { UniqueStringArray } from '../utils/unique-string-array';

export const getProfileView: Selector<ProfileViewState> = state =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions: Selector<*> = state =>
  getProfileView(state).viewOptions;
export const getProfileRootRange: Selector<StartEndRange> = state =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus: Selector<SymbolicationStatus> = state =>
  getProfileViewOptions(state).symbolicationStatus;
export const getProfileSharingStatus: Selector<ProfileSharingStatus> = state =>
  getProfileViewOptions(state).profileSharingStatus;
export const getScrollToSelectionGeneration: Selector<number> = state =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration: Selector<number> = state =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt: Selector<Milliseconds> = state =>
  getProfileRootRange(state).start;

export const getCommittedRange: Selector<StartEndRange> = createSelector(
  getProfileRootRange,
  getZeroAt,
  UrlState.getAllCommittedRanges,
  (rootRange, zeroAt, committedRanges): StartEndRange => {
    if (committedRanges.length > 0) {
      let { start, end } = committedRanges[committedRanges.length - 1];
      start += zeroAt;
      end += zeroAt;
      return { start, end };
    }
    return rootRange;
  }
);

/**
 * Profile
 */
export const getProfileOrNull: Selector<Profile | null> = state =>
  getProfileView(state).profile;
export const getProfile: Selector<Profile> = state =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getProfileInterval: Selector<Milliseconds> = state =>
  getProfile(state).meta.interval;
export const getCategories: Selector<CategoryList> = state =>
  getProfile(state).meta.categories;
export const getDefaultCategory: Selector<IndexIntoCategoryList> = state =>
  getCategories(state).findIndex(c => c.color === 'grey');
export const getThreads: Selector<Thread[]> = state =>
  getProfile(state).threads;
export const getThreadNames: Selector<string[]> = state =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedTrack: Selector<TrackReference> = state =>
  getProfileViewOptions(state).rightClickedTrack;
export const getPreviewSelection: Selector<PreviewSelection> = state =>
  getProfileViewOptions(state).previewSelection;

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks: Selector<GlobalTrack[]> = state =>
  getProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences: Selector<
  GlobalTrackReference[]
> = createSelector(getGlobalTracks, globalTracks =>
  globalTracks.map((globalTrack, trackIndex) => ({
    type: 'global',
    trackIndex,
  }))
);

/**
 * This finds a GlobalTrack from its TrackReference. No memoization is needed
 * as this is a simple value look-up.
 */
export const getGlobalTrackFromReference: DangerousSelectorWithArguments<
  GlobalTrack,
  GlobalTrackReference
> = (state, trackReference) =>
  getGlobalTracks(state)[trackReference.trackIndex];

/**
 * This finds a GlobalTrack and its index for a specific Pid.
 *
 * Warning: this selector returns a new object on every call, and will not
 * properly work with a PureComponent.
 */
export const getGlobalTrackAndIndexByPid: DangerousSelectorWithArguments<
  {| +globalTrackIndex: TrackIndex, +globalTrack: GlobalTrack |},
  Pid
> = (state, pid) => {
  const globalTracks = getGlobalTracks(state);
  const globalTrackIndex = globalTracks.findIndex(
    track => track.type === 'process' && track.pid === pid
  );
  if (globalTrackIndex === -1) {
    throw new Error('Unable to find the track index for the given pid.');
  }
  const globalTrack = globalTracks[globalTrackIndex];
  if (globalTrack.type !== 'process') {
    throw new Error('The globalTrack must be a process type.');
  }
  return { globalTrackIndex, globalTrack };
};

/**
 * This returns a map of local tracks from a pid.
 */
export const getLocalTracksByPid: Selector<Map<Pid, LocalTrack[]>> = state =>
  getProfileView(state).localTracksByPid;

/**
 * This selectors performs a simple look up in a Map, throws an error if it doesn't exist,
 * and finally returns the local tracks for a specific Pid. It does not need memoization
 * and is a very inexpensive function to run.
 */
export const getLocalTracks: DangerousSelectorWithArguments<
  LocalTrack[],
  Pid
> = (state, pid) =>
  ensureExists(
    getProfileView(state).localTracksByPid.get(pid),
    'Unable to get the tracks for the given pid.'
  );

/**
 * This selector does an inexpensive look-up for the local track from a reference.
 * It does not need any memoization, and returns the same object every time.
 */
export const getLocalTrackFromReference: DangerousSelectorWithArguments<
  LocalTrack,
  LocalTrackReference
> = (state, trackReference) =>
  getLocalTracks(state, trackReference.pid)[trackReference.trackIndex];

export const getRightClickedThreadIndex: Selector<null | ThreadIndex> = createSelector(
  getRightClickedTrack,
  getGlobalTracks,
  getLocalTracksByPid,
  (rightClickedTrack, globalTracks, localTracksByPid) => {
    if (rightClickedTrack.type === 'global') {
      const track = globalTracks[rightClickedTrack.trackIndex];
      return track.type === 'process' ? track.mainThreadIndex : null;
    }
    const { pid, trackIndex } = rightClickedTrack;
    const localTracks = ensureExists(
      localTracksByPid.get(pid),
      'No local tracks found at that pid.'
    );
    const track = localTracks[trackIndex];

    return track.type === 'thread' ? track.threadIndex : null;
  }
);

export const getGlobalTrackNames: Selector<string[]> = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads) =>
    globalTracks.map(globalTrack =>
      Tracks.getGlobalTrackName(globalTrack, threads)
    )
);

export const getGlobalTrackName: DangerousSelectorWithArguments<
  string,
  TrackIndex
> = (state, trackIndex) => getGlobalTrackNames(state)[trackIndex];

export const getLocalTrackNamesByPid: Selector<
  Map<Pid, string[]>
> = createSelector(
  getLocalTracksByPid,
  getThreads,
  (localTracksByPid, threads) => {
    const localTrackNamesByPid = new Map();
    for (const [pid, localTracks] of localTracksByPid) {
      localTrackNamesByPid.set(
        pid,
        localTracks.map(localTrack =>
          Tracks.getLocalTrackName(localTrack, threads)
        )
      );
    }
    return localTrackNamesByPid;
  }
);

export const getLocalTrackName = (
  state: State,
  pid: Pid,
  trackIndex: TrackIndex
): string =>
  ensureExists(
    getLocalTrackNamesByPid(state).get(pid),
    'Could not find the track names from the given pid'
  )[trackIndex];

const _getDefaultCategoryWrappedInObject = createSelector(
  getDefaultCategory,
  defaultCategory => ({ value: defaultCategory })
);

export type SelectorsForThread = {
  getThread: Selector<Thread>,
  getStringTable: Selector<UniqueStringArray>,
  getViewOptions: Selector<ThreadViewOptions>,
  getTransformStack: Selector<TransformStack>,
  getTransformLabels: Selector<string[]>,
  getRangeFilteredThread: Selector<Thread>,
  getRangeAndTransformFilteredThread: Selector<Thread>,
  getJankInstances: Selector<TracingMarker[]>,
  getProcessedMarkersTable: Selector<MarkersTable>,
  getTracingMarkers: Selector<TracingMarker[]>,
  getIsNetworkChartEmptyInFullRange: Selector<boolean>,
  getNetworkChartTracingMarkers: Selector<TracingMarker[]>,
  getMarkerChartTracingMarkers: Selector<TracingMarker[]>,
  getIsMarkerChartEmptyInFullRange: Selector<boolean>,
  getMarkerChartTiming: Selector<MarkerTimingRows>,
  getNetworkChartTiming: Selector<MarkerTimingRows>,
  getMergedNetworkChartTracingMarkers: Selector<TracingMarker[]>,
  getCommittedRangeFilteredTracingMarkers: Selector<TracingMarker[]>,
  getCommittedRangeFilteredTracingMarkersForHeader: Selector<TracingMarker[]>,
  getNetworkTracingMarkers: Selector<TracingMarker[]>,
  getNetworkTrackTiming: Selector<MarkerTimingRows>,
  getRangeFilteredScreenshotsById: Selector<Map<string, TracingMarker[]>>,
  getFilteredThread: Selector<Thread>,
  getPreviewFilteredThread: Selector<Thread>,
  getCallNodeInfo: Selector<CallNodeInfo>,
  getCallNodeMaxDepth: Selector<number>,
  getSelectedCallNodePath: Selector<CallNodePath>,
  getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null>,
  getExpandedCallNodePaths: Selector<PathSet>,
  getExpandedCallNodeIndexes: Selector<Array<IndexIntoCallNodeTable | null>>,
  getSamplesSelectedStatesInFilteredThread: Selector<SelectedState[]>,
  getTreeOrderComparatorInFilteredThread: Selector<
    (IndexIntoSamplesTable, IndexIntoSamplesTable) => number
  >,
  getCallTree: Selector<CallTree.CallTree>,
  getStackTimingByDepth: Selector<StackTiming.StackTimingByDepth>,
  getCallNodeMaxDepthForFlameGraph: Selector<number>,
  getFlameGraphTiming: Selector<FlameGraph.FlameGraphTiming>,
  getFriendlyThreadName: Selector<string>,
  getThreadProcessDetails: Selector<string>,
  getSearchFilteredTracingMarkers: Selector<TracingMarker[]>,
  getPreviewFilteredTracingMarkers: Selector<TracingMarker[]>,
  unfilteredSamplesRange: Selector<StartEndRange | null>,
  getSelectedMarkerIndex: Selector<IndexIntoMarkersTable | -1>,
  getJsTracerTable: Selector<JsTracerTable | null>,
  getExpensiveJsTracerTiming: Selector<null | JsTracerTiming[]>,
  getExpensiveJsTracerLeafTiming: Selector<null | JsTracerTiming[]>,
};

const selectorsForThreads: { [key: ThreadIndex]: SelectorsForThread } = {};

export const selectorsForThread = (
  threadIndex: ThreadIndex
): SelectorsForThread => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread: Selector<Thread> = state =>
      getProfile(state).threads[threadIndex];
    const _getMarkersTable: Selector<MarkersTable> = state =>
      getThread(state).markers;
    const getStringTable: Selector<UniqueStringArray> = state =>
      getThread(state).stringTable;

    /**
     * The first per-thread selectors filter out and transform a thread based on user's
     * interactions. The transforms are order dependendent.
     *
     * 1. Unfiltered getThread - The first selector gets the unmodified original thread.
     * 2. Range - New samples table with only samples in the committed range.
     * 3. Transform - Apply the transform stack that modifies the stacks and samples.
     * 4. Implementation - Modify stacks and samples to only show a single implementation.
     * 5. Search - Exclude samples that don't include some text in the stack.
     * 6. Preview - Only include samples that are within a user's preview range selection.
     */
    const getRangeFilteredThread: Selector<Thread> = createSelector(
      getThread,
      getCommittedRange,
      (thread, range) => {
        const { start, end } = range;
        return ProfileData.filterThreadToRange(thread, start, end);
      }
    );

    const applyTransform = (
      thread: Thread,
      transform: Transform,
      defaultCategory: IndexIntoCategoryList
    ) => {
      switch (transform.type) {
        case 'focus-subtree':
          return transform.inverted
            ? Transforms.focusInvertedSubtree(
                thread,
                transform.callNodePath,
                transform.implementation
              )
            : Transforms.focusSubtree(
                thread,
                transform.callNodePath,
                transform.implementation
              );
        case 'merge-call-node':
          return Transforms.mergeCallNode(
            thread,
            transform.callNodePath,
            transform.implementation
          );
        case 'merge-function':
          return Transforms.mergeFunction(thread, transform.funcIndex);
        case 'drop-function':
          return Transforms.dropFunction(thread, transform.funcIndex);
        case 'focus-function':
          return Transforms.focusFunction(thread, transform.funcIndex);
        case 'collapse-resource':
          return Transforms.collapseResource(
            thread,
            transform.resourceIndex,
            transform.implementation,
            defaultCategory
          );
        case 'collapse-direct-recursion':
          return Transforms.collapseDirectRecursion(
            thread,
            transform.funcIndex,
            transform.implementation
          );
        case 'collapse-function-subtree':
          return Transforms.collapseFunctionSubtree(
            thread,
            transform.funcIndex,
            defaultCategory
          );
        default:
          throw assertExhaustiveCheck(transform);
      }
    };

    // It becomes very expensive to apply each transform over and over again as they
    // typically take around 100ms to run per transform on a fast machine. Memoize
    // memoize each step individually so that they transform stack can be pushed and
    // popped frequently and easily.
    const applyTransformMemoized = memoize(applyTransform, {
      cache: new MixedTupleMap(),
    });

    const getTransformStack: Selector<TransformStack> = state =>
      UrlState.getTransformStack(state, threadIndex);

    const getRangeAndTransformFilteredThread: Selector<Thread> = createSelector(
      getRangeFilteredThread,
      getTransformStack,
      _getDefaultCategoryWrappedInObject,
      (startingThread, transforms, defaultCategoryObj) =>
        transforms.reduce(
          // Apply the reducer using an arrow function to ensure correct memoization.
          (thread, transform) =>
            applyTransformMemoized(thread, transform, defaultCategoryObj.value),
          startingThread
        )
    );

    const _getImplementationFilteredThread: Selector<Thread> = createSelector(
      getRangeAndTransformFilteredThread,
      UrlState.getImplementationFilter,
      getDefaultCategory,
      ProfileData.filterThreadByImplementation
    );

    const _getImplementationAndSearchFilteredThread: Selector<
      Thread
    > = createSelector(
      _getImplementationFilteredThread,
      UrlState.getSearchStrings,
      (thread, searchStrings) => {
        return ProfileData.filterThreadToSearchStrings(thread, searchStrings);
      }
    );

    const getFilteredThread: Selector<Thread> = createSelector(
      _getImplementationAndSearchFilteredThread,
      UrlState.getInvertCallstack,
      getDefaultCategory,
      (thread, shouldInvertCallstack, defaultCategory) => {
        return shouldInvertCallstack
          ? ProfileData.invertCallstack(thread, defaultCategory)
          : thread;
      }
    );

    const getPreviewFilteredThread: Selector<Thread> = createSelector(
      getFilteredThread,
      getPreviewSelection,
      (thread, previewSelection): Thread => {
        if (!previewSelection.hasSelection) {
          return thread;
        }
        const { selectionStart, selectionEnd } = previewSelection;
        return ProfileData.filterThreadToRange(
          thread,
          selectionStart,
          selectionEnd
        );
      }
    );

    const getViewOptions: Selector<ThreadViewOptions> = state =>
      getProfileViewOptions(state).perThread[threadIndex];

    const getFriendlyThreadName: Selector<string> = createSelector(
      getThreads,
      getThread,
      ProfileData.getFriendlyThreadName
    );

    const getThreadProcessDetails: Selector<string> = createSelector(
      getThread,
      ProfileData.getThreadProcessDetails
    );

    const getTransformLabels: Selector<string[]> = createSelector(
      getRangeAndTransformFilteredThread,
      getFriendlyThreadName,
      getTransformStack,
      Transforms.getTransformLabels
    );

    const _getRangeFilteredThreadSamples: Selector<
      SamplesTable
    > = createSelector(getRangeFilteredThread, thread => thread.samples);

    const getJankInstances: Selector<TracingMarker[]> = createSelector(
      _getRangeFilteredThreadSamples,
      (samples): TracingMarker[] => MarkerData.getJankInstances(samples, 50)
    );

    /**
     * Similar to thread filtering, the markers can be filtered as well, and it's
     * important to use the right type of filtering for the view. The steps for filtering
     * markers are a bit different, since markers can be valid over ranges, and need a
     * bit more processing in order to get into a correct state. There are a few
     * variants of the selectors that are created for specific views that have been
     * omitted, but the ordered steps below give the general picture.
     *
     * 1. _getMarkersTable - Get the MarkersTable from the current thread.
     * 2. getProcessedMarkersTable - Process marker payloads out of raw strings, and other
     *                               future processing needs. This returns a MarkersTable
     *                               still.
     * 3. getTracingMarkers - Match up start/end markers, and start returning
     *                        TracingMarkers.
     * 4. getCommittedRangeFilteredTracingMarkers - Apply the commited range.
     * 5. getSearchFilteredTracingMarkers - Apply the search string
     * 6. getPreviewFilteredTracingMarkers - Apply the preview range
     */
    const getProcessedMarkersTable: Selector<MarkersTable> = createSelector(
      _getMarkersTable,
      getStringTable,
      MarkerData.extractMarkerDataFromName
    );

    const getTracingMarkers: Selector<TracingMarker[]> = createSelector(
      getProcessedMarkersTable,
      getStringTable,
      MarkerData.getTracingMarkers
    );

    const getCommittedRangeFilteredTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(
      getTracingMarkers,
      getCommittedRange,
      (markers, range): TracingMarker[] => {
        const { start, end } = range;
        return MarkerData.filterTracingMarkersToRange(markers, start, end);
      }
    );

    const getCommittedRangeFilteredTracingMarkersForHeader: Selector<
      TracingMarker[]
    > = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      (markers): TracingMarker[] =>
        markers.filter(
          tm =>
            tm.name !== 'GCMajor' &&
            tm.name !== 'BHR-detected hang' &&
            tm.name !== 'LongTask' &&
            tm.name !== 'LongIdleTask' &&
            !MarkerData.isNetworkMarker(tm)
        )
    );

    const getSearchFilteredTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      UrlState.getMarkersSearchString,
      MarkerData.getSearchFilteredTracingMarkers
    );

    const getPreviewFilteredTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(
      getSearchFilteredTracingMarkers,
      getPreviewSelection,
      (markers, previewSelection) => {
        if (!previewSelection.hasSelection) {
          return markers;
        }
        const { selectionStart, selectionEnd } = previewSelection;
        return MarkerData.filterTracingMarkersToRange(
          markers,
          selectionStart,
          selectionEnd
        );
      }
    );

    const getIsNetworkChartEmptyInFullRange: Selector<boolean> = createSelector(
      getTracingMarkers,
      markers => markers.filter(MarkerData.isNetworkMarker).length === 0
    );

    const getNetworkChartTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(getSearchFilteredTracingMarkers, markers =>
      markers.filter(MarkerData.isNetworkMarker)
    );

    const getMergedNetworkChartTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(
      getNetworkChartTracingMarkers,
      MarkerData.mergeStartAndEndNetworkMarker
    );

    const getIsMarkerChartEmptyInFullRange: Selector<boolean> = createSelector(
      getTracingMarkers,
      markers => MarkerData.filterForMarkerChart(markers).length === 0
    );

    const getMarkerChartTracingMarkers: Selector<
      TracingMarker[]
    > = createSelector(
      getSearchFilteredTracingMarkers,
      MarkerData.filterForMarkerChart
    );

    const getMarkerChartTiming: Selector<MarkerTimingRows> = createSelector(
      getMarkerChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );

    const getNetworkChartTiming: Selector<MarkerTimingRows> = createSelector(
      getNetworkChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );

    const getNetworkTracingMarkers: Selector<TracingMarker[]> = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      tracingMarkers => tracingMarkers.filter(MarkerData.isNetworkMarker)
    );

    const getNetworkTrackTiming: Selector<MarkerTimingRows> = createSelector(
      getNetworkTracingMarkers,
      MarkerTiming.getMarkerTiming
    );

    const getScreenshotsById = createSelector(
      _getMarkersTable,
      getStringTable,
      getProfileRootRange,
      MarkerData.extractScreenshotsById
    );

    const getRangeFilteredScreenshotsById: Selector<
      Map<string, TracingMarker[]>
    > = createSelector(
      getScreenshotsById,
      getCommittedRange,
      (screenshotsById, { start, end }) => {
        const newMap = new Map();
        for (const [id, screenshots] of screenshotsById) {
          newMap.set(
            id,
            MarkerData.filterTracingMarkersToRange(screenshots, start, end)
          );
        }
        return newMap;
      }
    );

    const getCallNodeInfo: Selector<CallNodeInfo> = createSelector(
      getFilteredThread,
      getDefaultCategory,
      (
        { stackTable, frameTable, funcTable }: Thread,
        defaultCategory: IndexIntoCategoryList
      ): CallNodeInfo => {
        return ProfileData.getCallNodeInfo(
          stackTable,
          frameTable,
          funcTable,
          defaultCategory
        );
      }
    );

    const getCallNodeMaxDepth: Selector<number> = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );

    const getSelectedCallNodePath: Selector<CallNodePath> = createSelector(
      getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedCallNodePath
    );

    const getSelectedCallNodeIndex: Selector<IndexIntoCallNodeTable | null> = createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath) => {
        return ProfileData.getCallNodeIndexFromPath(
          callNodePath,
          callNodeInfo.callNodeTable
        );
      }
    );

    const getExpandedCallNodePaths: Selector<PathSet> = createSelector(
      getViewOptions,
      threadViewOptions => threadViewOptions.expandedCallNodePaths
    );

    const getExpandedCallNodeIndexes: Selector<
      Array<IndexIntoCallNodeTable | null>
    > = createSelector(
      getCallNodeInfo,
      getExpandedCallNodePaths,
      ({ callNodeTable }, callNodePaths) =>
        ProfileData.getCallNodeIndicesFromPaths(
          Array.from(callNodePaths),
          callNodeTable
        )
    );

    const getSamplesSelectedStatesInFilteredThread: Selector<
      SelectedState[]
    > = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      getSelectedCallNodeIndex,
      (
        thread,
        { callNodeTable, stackIndexToCallNodeIndex },
        selectedCallNode
      ) => {
        const sampleCallNodes = ProfileData.getSampleCallNodes(
          thread.samples,
          stackIndexToCallNodeIndex
        );
        return ProfileData.getSamplesSelectedStates(
          callNodeTable,
          sampleCallNodes,
          selectedCallNode
        );
      }
    );

    const getTreeOrderComparatorInFilteredThread: Selector<
      (IndexIntoSamplesTable, IndexIntoSamplesTable) => number
    > = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      (thread, { callNodeTable, stackIndexToCallNodeIndex }) => {
        const sampleCallNodes = ProfileData.getSampleCallNodes(
          thread.samples,
          stackIndexToCallNodeIndex
        );
        return ProfileData.getTreeOrderComparator(
          callNodeTable,
          sampleCallNodes
        );
      }
    );

    const getCallTree: Selector<CallTree.CallTree> = createSelector(
      getPreviewFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      getCategories,
      UrlState.getImplementationFilter,
      UrlState.getInvertCallstack,
      CallTree.getCallTree
    );

    const getStackTimingByDepth: Selector<
      StackTiming.StackTimingByDepth
    > = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );

    const getCallNodeMaxDepthForFlameGraph: Selector<number> = createSelector(
      getPreviewFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );

    const getFlameGraphTiming: Selector<
      FlameGraph.FlameGraphTiming
    > = createSelector(
      getPreviewFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      UrlState.getInvertCallstack,
      FlameGraph.getFlameGraphTiming
    );

    /**
     * The buffers of the samples can be cleared out. This function lets us know the
     * absolute range of samples that we have collected.
     */
    const unfilteredSamplesRange: Selector<StartEndRange | null> = createSelector(
      getThread,
      getProfileInterval,
      (thread, interval) => {
        const { time } = thread.samples;
        if (time.length === 0) {
          return null;
        }
        return { start: time[0], end: time[time.length - 1] + interval };
      }
    );

    const getSelectedMarkerIndex: Selector<
      IndexIntoMarkersTable | -1
    > = state => getViewOptions(state).selectedMarker;

    const getJsTracerTable: Selector<JsTracerTable | null> = state =>
      getThread(state).jsTracer || null;

    /**
     * This selector can be very slow, so care should be taken when running it to provide
     * a helpful loading message for the user. Provide separate selectors for the stack
     * based timing, and the leaf timing, so that they memoize nicely.
     */
    const getExpensiveJsTracerTiming: Selector<
      JsTracerTiming[] | null
    > = createSelector(
      getJsTracerTable,
      getStringTable,
      (jsTracerTable, stringTable) =>
        jsTracerTable === null
          ? null
          : JsTracer.getJsTracerTiming(jsTracerTable, stringTable)
    );

    /**
     * This selector can be very slow, so care should be taken when running it to provide
     * a helpful loading message for the user. Provide separate selectors for the stack
     * based timing, and the leaf timing, so that they memoize nicely.
     */
    const getExpensiveJsTracerLeafTiming: Selector<
      JsTracerTiming[] | null
    > = createSelector(
      getJsTracerTable,
      getStringTable,
      (jsTracerTable, stringTable) =>
        jsTracerTable === null
          ? null
          : JsTracer.getJsTracerLeafTiming(jsTracerTable, stringTable)
    );

    selectorsForThreads[threadIndex] = {
      getThread,
      getStringTable,
      getViewOptions,
      getTransformStack,
      getTransformLabels,
      getRangeFilteredThread,
      getRangeAndTransformFilteredThread,
      getJankInstances,
      getProcessedMarkersTable,
      getTracingMarkers,
      getIsNetworkChartEmptyInFullRange,
      getNetworkChartTracingMarkers,
      getIsMarkerChartEmptyInFullRange,
      getMarkerChartTracingMarkers,
      getMarkerChartTiming,
      getNetworkChartTiming,
      getCommittedRangeFilteredTracingMarkers,
      getCommittedRangeFilteredTracingMarkersForHeader,
      getNetworkTracingMarkers,
      getNetworkTrackTiming,
      getMergedNetworkChartTracingMarkers,
      getRangeFilteredScreenshotsById,
      getFilteredThread,
      getPreviewFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getSelectedCallNodePath,
      getSelectedCallNodeIndex,
      getExpandedCallNodePaths,
      getExpandedCallNodeIndexes,
      getSamplesSelectedStatesInFilteredThread,
      getTreeOrderComparatorInFilteredThread,
      getCallTree,
      getStackTimingByDepth,
      getCallNodeMaxDepthForFlameGraph,
      getFlameGraphTiming,
      getFriendlyThreadName,
      getThreadProcessDetails,
      getSearchFilteredTracingMarkers,
      getPreviewFilteredTracingMarkers,
      unfilteredSamplesRange,
      getSelectedMarkerIndex,
      getJsTracerTable,
      getExpensiveJsTracerTiming,
      getExpensiveJsTracerLeafTiming,
    };
  }
  return selectorsForThreads[threadIndex];
};

export const selectedThreadSelectors: SelectorsForThread = (() => {
  const anyThreadSelectors: SelectorsForThread = selectorsForThread(0);
  const result: { [key: string]: (State) => any } = {};
  for (const key in anyThreadSelectors) {
    result[key] = state =>
      selectorsForThread(UrlState.getSelectedThreadIndex(state))[key](state);
  }
  const result2: SelectorsForThread = result;
  return result2;
})();

export type SelectorsForNode = {|
  +getName: Selector<string>,
  +getIsJS: Selector<boolean>,
  +getLib: Selector<string>,
  +getTimingsForSidebar: Selector<TimingsForPath>,
|};

export const selectedNodeSelectors: SelectorsForNode = (() => {
  const getName: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return stringTable.getString(funcTable.name[funcIndex]);
    }
  );

  const getIsJS: Selector<boolean> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { funcTable }) => {
      if (!selectedPath.length) {
        return false;
      }

      const funcIndex = ProfileData.getLeafFuncIndex(selectedPath);
      return funcTable.isJS[funcIndex];
    }
  );

  const getLib: Selector<string> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getFilteredThread,
    (selectedPath, { stringTable, funcTable, resourceTable }) => {
      if (!selectedPath.length) {
        return '';
      }

      return ProfileData.getOriginAnnotationForFunc(
        ProfileData.getLeafFuncIndex(selectedPath),
        funcTable,
        resourceTable,
        stringTable
      );
    }
  );

  const getTimingsForSidebar: Selector<TimingsForPath> = createSelector(
    selectedThreadSelectors.getSelectedCallNodePath,
    selectedThreadSelectors.getCallNodeInfo,
    getProfileInterval,
    UrlState.getInvertCallstack,
    selectedThreadSelectors.getPreviewFilteredThread,
    (
      selectedPath,
      callNodeInfo,
      interval,
      isInvertedTree,
      thread
    ): TimingsForPath => {
      return ProfileData.getTimingsForPath(
        selectedPath,
        callNodeInfo,
        interval,
        isInvertedTree,
        thread
      );
    }
  );

  return {
    getName,
    getIsJS,
    getLib,
    getTimingsForSidebar,
  };
})();
