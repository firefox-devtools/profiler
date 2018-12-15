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
} from '../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../types/units';
import type { TrackReference } from '../types/actions';
import type {
  State,
  ProfileViewState,
  ThreadViewOptions,
} from '../types/state';
import type { Transform, TransformStack } from '../types/transforms';
import type {
  TimingsForPath,
  SelectedState,
} from '../profile-logic/profile-data';
import type { UniqueStringArray } from '../utils/unique-string-array';

export const getProfileView = (state: State): ProfileViewState =>
  state.profileView;

/**
 * Profile View Options
 */
export const getProfileViewOptions = (state: State) =>
  getProfileView(state).viewOptions;
export const getProfileRootRange = (state: State) =>
  getProfileViewOptions(state).rootRange;
export const getSymbolicationStatus = (state: State) =>
  getProfileViewOptions(state).symbolicationStatus;
export const getProfileSharingStatus = (state: State) =>
  getProfileViewOptions(state).profileSharingStatus;
export const getScrollToSelectionGeneration = (state: State) =>
  getProfileViewOptions(state).scrollToSelectionGeneration;
export const getFocusCallTreeGeneration = (state: State) =>
  getProfileViewOptions(state).focusCallTreeGeneration;
export const getZeroAt = (state: State) => getProfileRootRange(state).start;

export const getCommittedRange = createSelector(
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
export const getProfileOrNull = (state: State): Profile | null =>
  getProfileView(state).profile;
export const getProfile = (state: State): Profile =>
  ensureExists(
    getProfileOrNull(state),
    'Tried to access the profile before it was loaded.'
  );
export const getProfileInterval = (state: State): Milliseconds =>
  getProfile(state).meta.interval;
export const getCategories = (state: State): CategoryList =>
  getProfile(state).meta.categories;
export const getDefaultCategory = (state: State): IndexIntoCategoryList =>
  getCategories(state).findIndex(c => c.color === 'grey');
export const getThreads = (state: State): Thread[] => getProfile(state).threads;
export const getThreadNames = (state: State): string[] =>
  getProfile(state).threads.map(t => t.name);
export const getRightClickedTrack = (state: State) =>
  getProfileViewOptions(state).rightClickedTrack;
export const getPreviewSelection = (state: State) =>
  getProfileViewOptions(state).previewSelection;

/**
 * Tracks
 *
 * Tracks come in two flavors: global tracks and local tracks.
 * They're uniquely referenced by a TrackReference.
 */
export const getGlobalTracks = (state: State) =>
  getProfileView(state).globalTracks;

/**
 * This returns all TrackReferences for global tracks.
 */
export const getGlobalTrackReferences = createSelector(
  getGlobalTracks,
  (globalTracks): TrackReference[] =>
    globalTracks.map((globalTrack, trackIndex) => ({
      type: 'global',
      trackIndex,
    }))
);

/**
 * This finds a GlobalTrack from its TrackReference.
 */
export const getGlobalTrackFromReference = (
  state: State,
  trackReference: TrackReference
) => {
  if (trackReference.type !== 'global') {
    throw new Error('Expected a global track reference.');
  }
  const globalTracks = getGlobalTracks(state);
  return globalTracks[trackReference.trackIndex];
};

/**
 * This finds a GlobalTrack and its index for a specific Pid.
 *
 * Warning: this selector returns a new object on every call, and will not
 * properly work with a PureComponent.
 */
export const getGlobalTrackAndIndexByPid = (state: State, pid: Pid) => {
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
export const getLocalTracksByPid = (state: State) =>
  getProfileView(state).localTracksByPid;

/**
 * This returns the local tracks for a specific Pid.
 */
export const getLocalTracks = (state: State, pid: Pid) =>
  ensureExists(
    getProfileView(state).localTracksByPid.get(pid),
    'Unable to get the tracks for the given pid.'
  );

/**
 * This returns a local track from its TrackReference.
 */
export const getLocalTrackFromReference = (
  state: State,
  trackReference: TrackReference
): LocalTrack => {
  if (trackReference.type !== 'local') {
    throw new Error('Expected a local track reference.');
  }
  const { pid, trackIndex } = trackReference;
  return getLocalTracks(state, pid)[trackIndex];
};
export const getRightClickedThreadIndex = createSelector(
  getRightClickedTrack,
  getGlobalTracks,
  getLocalTracksByPid,
  (rightClickedTrack, globalTracks, localTracksByPid): null | ThreadIndex => {
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
export const getGlobalTrackNames = createSelector(
  getGlobalTracks,
  getThreads,
  (globalTracks, threads): string[] =>
    globalTracks.map(globalTrack =>
      Tracks.getGlobalTrackName(globalTrack, threads)
    )
);
export const getGlobalTrackName = (
  state: State,
  trackIndex: TrackIndex
): string => getGlobalTrackNames(state)[trackIndex];
export const getLocalTrackNamesByPid = createSelector(
  getLocalTracksByPid,
  getThreads,
  (localTracksByPid, threads): Map<Pid, string[]> => {
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
  getThread: State => Thread,
  getStringTable: State => UniqueStringArray,
  getViewOptions: State => ThreadViewOptions,
  getTransformStack: State => TransformStack,
  getTransformLabels: State => string[],
  getRangeFilteredThread: State => Thread,
  getRangeAndTransformFilteredThread: State => Thread,
  getJankInstances: State => TracingMarker[],
  getProcessedMarkersTable: State => MarkersTable,
  getTracingMarkers: State => TracingMarker[],
  getIsNetworkChartEmptyInFullRange: State => boolean,
  getNetworkChartTracingMarkers: State => TracingMarker[],
  getMarkerChartTracingMarkers: State => TracingMarker[],
  getIsMarkerChartEmptyInFullRange: State => boolean,
  getMarkerChartTiming: State => MarkerTimingRows,
  getNetworkChartTiming: State => MarkerTimingRows,
  getMergedNetworkChartTracingMarkers: State => TracingMarker[],
  getCommittedRangeFilteredTracingMarkers: State => TracingMarker[],
  getCommittedRangeFilteredTracingMarkersForHeader: State => TracingMarker[],
  getNetworkTracingMarkers: State => TracingMarker[],
  getNetworkTrackTiming: State => MarkerTimingRows,
  getRangeFilteredScreenshotsById: State => Map<string, TracingMarker[]>,
  getFilteredThread: State => Thread,
  getPreviewFilteredThread: State => Thread,
  getCallNodeInfo: State => CallNodeInfo,
  getCallNodeMaxDepth: State => number,
  getSelectedCallNodePath: State => CallNodePath,
  getSelectedCallNodeIndex: State => IndexIntoCallNodeTable | null,
  getExpandedCallNodePaths: State => PathSet,
  getExpandedCallNodeIndexes: State => Array<IndexIntoCallNodeTable | null>,
  getSamplesSelectedStatesInFilteredThread: State => SelectedState[],
  getTreeOrderComparatorInFilteredThread: State => (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  getCallTree: State => CallTree.CallTree,
  getStackTimingByDepth: State => StackTiming.StackTimingByDepth,
  getCallNodeMaxDepthForFlameGraph: State => number,
  getFlameGraphTiming: State => FlameGraph.FlameGraphTiming,
  getFriendlyThreadName: State => string,
  getThreadProcessDetails: State => string,
  getSearchFilteredTracingMarkers: State => TracingMarker[],
  getPreviewFilteredTracingMarkers: State => TracingMarker[],
  unfilteredSamplesRange: State => StartEndRange | null,
  getSelectedMarkerIndex: State => IndexIntoMarkersTable | -1,
  getJsTracerTable: State => JsTracerTable | null,
  getExpensiveJsTracerTiming: State => null | JsTracerTiming[],
  getExpensiveJsTracerLeafTiming: State => null | JsTracerTiming[],
};

const selectorsForThreads: { [key: ThreadIndex]: SelectorsForThread } = {};

export const selectorsForThread = (
  threadIndex: ThreadIndex
): SelectorsForThread => {
  if (!(threadIndex in selectorsForThreads)) {
    const getThread = (state: State): Thread =>
      getProfile(state).threads[threadIndex];
    const _getMarkersTable = (state: State) => getThread(state).markers;
    const getStringTable = (state: State) => getThread(state).stringTable;

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
    const getRangeFilteredThread = createSelector(
      getThread,
      getCommittedRange,
      (thread, range): Thread => {
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
    const getTransformStack = (state: State): TransformStack =>
      UrlState.getTransformStack(state, threadIndex);
    const getRangeAndTransformFilteredThread = createSelector(
      getRangeFilteredThread,
      getTransformStack,
      _getDefaultCategoryWrappedInObject,
      (startingThread, transforms, defaultCategoryObj): Thread =>
        transforms.reduce(
          // Apply the reducer using an arrow function to ensure correct memoization.
          (thread, transform) =>
            applyTransformMemoized(thread, transform, defaultCategoryObj.value),
          startingThread
        )
    );
    const _getImplementationFilteredThread = createSelector(
      getRangeAndTransformFilteredThread,
      UrlState.getImplementationFilter,
      getDefaultCategory,
      ProfileData.filterThreadByImplementation
    );
    const _getImplementationAndSearchFilteredThread = createSelector(
      _getImplementationFilteredThread,
      UrlState.getSearchStrings,
      (thread: Thread, searchStrings: string[] | null): Thread => {
        return ProfileData.filterThreadToSearchStrings(thread, searchStrings);
      }
    );
    const getFilteredThread = createSelector(
      _getImplementationAndSearchFilteredThread,
      UrlState.getInvertCallstack,
      getDefaultCategory,
      (thread, shouldInvertCallstack, defaultCategory): Thread => {
        return shouldInvertCallstack
          ? ProfileData.invertCallstack(thread, defaultCategory)
          : thread;
      }
    );
    const getPreviewFilteredThread = createSelector(
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

    const getViewOptions = (state: State): ThreadViewOptions =>
      getProfileViewOptions(state).perThread[threadIndex];
    const getFriendlyThreadName = createSelector(
      getThreads,
      getThread,
      ProfileData.getFriendlyThreadName
    );
    const getThreadProcessDetails = createSelector(
      getThread,
      ProfileData.getThreadProcessDetails
    );
    const getTransformLabels: (state: State) => string[] = createSelector(
      getRangeAndTransformFilteredThread,
      getFriendlyThreadName,
      getTransformStack,
      Transforms.getTransformLabels
    );
    const _getRangeFilteredThreadSamples = createSelector(
      getRangeFilteredThread,
      (thread): SamplesTable => thread.samples
    );
    const getJankInstances = createSelector(
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
    const getProcessedMarkersTable = createSelector(
      _getMarkersTable,
      getStringTable,
      MarkerData.extractMarkerDataFromName
    );
    const getTracingMarkers = createSelector(
      getProcessedMarkersTable,
      getStringTable,
      MarkerData.getTracingMarkers
    );
    const getCommittedRangeFilteredTracingMarkers = createSelector(
      getTracingMarkers,
      getCommittedRange,
      (markers, range): TracingMarker[] => {
        const { start, end } = range;
        return MarkerData.filterTracingMarkersToRange(markers, start, end);
      }
    );
    const getCommittedRangeFilteredTracingMarkersForHeader = createSelector(
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
    const getSearchFilteredTracingMarkers = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      UrlState.getMarkersSearchString,
      MarkerData.getSearchFilteredTracingMarkers
    );
    const getPreviewFilteredTracingMarkers = createSelector(
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
    const getIsNetworkChartEmptyInFullRange = createSelector(
      getTracingMarkers,
      markers => markers.filter(MarkerData.isNetworkMarker).length === 0
    );
    const getNetworkChartTracingMarkers = createSelector(
      getSearchFilteredTracingMarkers,
      markers => markers.filter(MarkerData.isNetworkMarker)
    );
    const getMergedNetworkChartTracingMarkers = createSelector(
      getNetworkChartTracingMarkers,
      MarkerData.mergeStartAndEndNetworkMarker
    );
    const getIsMarkerChartEmptyInFullRange = createSelector(
      getTracingMarkers,
      markers => MarkerData.filterForMarkerChart(markers).length === 0
    );
    const getMarkerChartTracingMarkers = createSelector(
      getSearchFilteredTracingMarkers,
      MarkerData.filterForMarkerChart
    );
    const getMarkerChartTiming = createSelector(
      getMarkerChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getNetworkChartTiming = createSelector(
      getNetworkChartTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getNetworkTracingMarkers = createSelector(
      getCommittedRangeFilteredTracingMarkers,
      tracingMarkers => tracingMarkers.filter(MarkerData.isNetworkMarker)
    );
    const getNetworkTrackTiming = createSelector(
      getNetworkTracingMarkers,
      MarkerTiming.getMarkerTiming
    );
    const getScreenshotsById = createSelector(
      _getMarkersTable,
      getStringTable,
      getProfileRootRange,
      MarkerData.extractScreenshotsById
    );
    const getRangeFilteredScreenshotsById = createSelector(
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

    const getCallNodeInfo = createSelector(
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
    const getCallNodeMaxDepth = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );
    const getSelectedCallNodePath = createSelector(
      getViewOptions,
      (threadViewOptions): CallNodePath =>
        threadViewOptions.selectedCallNodePath
    );
    const getSelectedCallNodeIndex = createSelector(
      getCallNodeInfo,
      getSelectedCallNodePath,
      (callNodeInfo, callNodePath): IndexIntoCallNodeTable | null => {
        return ProfileData.getCallNodeIndexFromPath(
          callNodePath,
          callNodeInfo.callNodeTable
        );
      }
    );
    const getExpandedCallNodePaths = createSelector(
      getViewOptions,
      (threadViewOptions): PathSet => threadViewOptions.expandedCallNodePaths
    );
    const getExpandedCallNodeIndexes = createSelector(
      getCallNodeInfo,
      getExpandedCallNodePaths,
      (
        { callNodeTable },
        callNodePaths
      ): Array<IndexIntoCallNodeTable | null> =>
        ProfileData.getCallNodeIndicesFromPaths(
          Array.from(callNodePaths),
          callNodeTable
        )
    );
    const getSamplesSelectedStatesInFilteredThread = createSelector(
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
    const getTreeOrderComparatorInFilteredThread = createSelector(
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
    const getCallTree = createSelector(
      getPreviewFilteredThread,
      getProfileInterval,
      getCallNodeInfo,
      getCategories,
      UrlState.getImplementationFilter,
      UrlState.getInvertCallstack,
      CallTree.getCallTree
    );
    const getStackTimingByDepth = createSelector(
      getFilteredThread,
      getCallNodeInfo,
      getCallNodeMaxDepth,
      getProfileInterval,
      StackTiming.getStackTimingByDepth
    );
    const getCallNodeMaxDepthForFlameGraph = createSelector(
      getPreviewFilteredThread,
      getCallNodeInfo,
      ProfileData.computeCallNodeMaxDepth
    );
    const getFlameGraphTiming = createSelector(
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
    const unfilteredSamplesRange = createSelector(
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
    const getSelectedMarkerIndex = (state: State) =>
      getViewOptions(state).selectedMarker;

    const getJsTracerTable = (state: State) =>
      getThread(state).jsTracer || null;

    /**
     * This selector can be very slow, so care should be taken when running it to provide
     * a helpful loading message for the user. Provide separate selectors for the stack
     * based timing, and the leaf timing, so that they memoize nicely.
     */
    const getExpensiveJsTracerTiming = createSelector(
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
    const getExpensiveJsTracerLeafTiming = createSelector(
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
    result[key] = (state: State) =>
      selectorsForThread(UrlState.getSelectedThreadIndex(state))[key](state);
  }
  const result2: SelectorsForThread = result;
  return result2;
})();

export type SelectorsForNode = {
  getName: State => string,
  getIsJS: State => boolean,
  getLib: State => string,
  getTimingsForSidebar: State => TimingsForPath,
};

export const selectedNodeSelectors: SelectorsForNode = (() => {
  const getName = createSelector(
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

  const getIsJS = createSelector(
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

  const getLib = createSelector(
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

  const getTimingsForSidebar = createSelector(
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
