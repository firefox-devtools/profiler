/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as UrlState from '../url-state';
import * as MarkerData from '../../profile-logic/marker-data';
import * as MarkerTiming from '../../profile-logic/marker-timing';
import * as ProfileSelectors from '../profile';

import type {
  SamplesTable,
  MarkersTable,
  IndexIntoMarkersTable,
} from '../../types/profile';
import type {
  TracingMarker,
  MarkerTimingRows,
} from '../../types/profile-derived';
import type { Selector } from '../../types/store';
import type { $ReturnType } from '../../types/utils';
import type { Milliseconds } from '../../types/units';

/**
 * Infer the return type from the getMarkerSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type MarkerSelectorsPerThread = $ReturnType<
  typeof getMarkerSelectorsPerThread
>;

/**
 * Create the selectors for a thread that have to do with either markers.
 */
export function getMarkerSelectorsPerThread(threadSelectors: *) {
  const _getMarkersTable: Selector<MarkersTable> = state =>
    threadSelectors.getThread(state).markers;

  const _getRangeFilteredThreadSamples: Selector<SamplesTable> = createSelector(
    threadSelectors.getRangeFilteredThread,
    thread => thread.samples
  );

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
    threadSelectors.getStringTable,
    MarkerData.extractMarkerDataFromName
  );

  const _getFirstSampleTime: Selector<Milliseconds> = state =>
    threadSelectors.getThread(state).samples.time[0] || 0;
  const _getLastSampleTime: Selector<Milliseconds> = state =>
    threadSelectors.getThread(state).samples.time.slice(-1)[0] || 0;

  const getTracingMarkers: Selector<TracingMarker[]> = createSelector(
    getProcessedMarkersTable,
    threadSelectors.getStringTable,
    _getFirstSampleTime,
    _getLastSampleTime,
    MarkerData.getTracingMarkers
  );

  const getCommittedRangeFilteredTracingMarkers: Selector<
    TracingMarker[]
  > = createSelector(
    getTracingMarkers,
    ProfileSelectors.getCommittedRange,
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
    ProfileSelectors.getPreviewSelection,
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
    threadSelectors.getStringTable,
    ProfileSelectors.getProfileRootRange,
    MarkerData.extractScreenshotsById
  );

  const getRangeFilteredScreenshotsById: Selector<
    Map<string, TracingMarker[]>
  > = createSelector(
    getScreenshotsById,
    ProfileSelectors.getCommittedRange,
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

  const getSelectedMarkerIndex: Selector<IndexIntoMarkersTable | -1> = state =>
    threadSelectors.getViewOptions(state).selectedMarker;

  return {
    getJankInstances,
    getProcessedMarkersTable,
    getTracingMarkers,
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
    getSearchFilteredTracingMarkers,
    getPreviewFilteredTracingMarkers,
    getSelectedMarkerIndex,
    getIsNetworkChartEmptyInFullRange,
  };
}
