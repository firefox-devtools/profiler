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
  RawMarkerTable,
  IndexIntoRawMarkerTable,
} from '../../types/profile';
import type { Marker, MarkerTimingRows } from '../../types/profile-derived';
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
  const _getRawMarkerTable: Selector<RawMarkerTable> = state =>
    threadSelectors.getThread(state).markers;

  const _getRangeFilteredThreadSamples: Selector<SamplesTable> = createSelector(
    threadSelectors.getRangeFilteredThread,
    thread => thread.samples
  );

  const getJankMarkers: Selector<Marker[]> = createSelector(
    _getRangeFilteredThreadSamples,
    (samples): Marker[] => MarkerData.getJankMarkers(samples, 50)
  );

  /**
   * Similar to thread filtering, the markers can be filtered as well, and it's
   * important to use the right type of filtering for the view. The steps for filtering
   * markers are a bit different, since markers can be valid over ranges, and need a
   * bit more processing in order to get into a correct state. There are a few
   * variants of the selectors that are created for specific views that have been
   * omitted, but the ordered steps below give the general picture.
   *
   * 1. _getRawMarkerTable - Get the RawMarkerTable from the current thread.
   * 2. getProcessedRawMarkerTable - Process marker payloads out of raw strings, and other
   *                                 future processing needs. This returns a
   *                                 RawMarkerTable still.
   * 3. getMarkers - Match up start/end markers, and start returning the Marker[] type.
   * 4. getCommittedRangeFilteredMarkers - Apply the committed range.
   * 5. getSearchFilteredMarkers - Apply the search string
   * 6. getPreviewFilteredMarkers - Apply the preview range
   */
  const getProcessedRawMarkerTable: Selector<RawMarkerTable> = createSelector(
    _getRawMarkerTable,
    threadSelectors.getStringTable,
    MarkerData.extractMarkerDataFromName
  );

  const _getFirstSampleTime: Selector<Milliseconds> = state =>
    threadSelectors.getThread(state).samples.time[0] || 0;

  const getMarkers: Selector<Marker[]> = createSelector(
    getProcessedRawMarkerTable,
    threadSelectors.getStringTable,
    _getFirstSampleTime,
    MarkerData.deriveMarkersFromRawMarkerTable
  );

  const getCommittedRangeFilteredMarkers: Selector<Marker[]> = createSelector(
    getMarkers,
    ProfileSelectors.getCommittedRange,
    (markers, range): Marker[] => {
      const { start, end } = range;
      return MarkerData.filterMarkersToRange(markers, start, end);
    }
  );

  const getCommittedRangeFilteredMarkersForHeader: Selector<
    Marker[]
  > = createSelector(getCommittedRangeFilteredMarkers, (markers): Marker[] =>
    markers.filter(
      tm =>
        tm.name !== 'GCMajor' &&
        tm.name !== 'BHR-detected hang' &&
        tm.name !== 'LongTask' &&
        tm.name !== 'LongIdleTask' &&
        !MarkerData.isNetworkMarker(tm)
    )
  );

  const getSearchFilteredMarkers: Selector<Marker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    UrlState.getMarkersSearchString,
    MarkerData.getSearchFilteredMarkers
  );

  const getPreviewFilteredMarkers: Selector<Marker[]> = createSelector(
    getSearchFilteredMarkers,
    ProfileSelectors.getPreviewSelection,
    (markers, previewSelection) => {
      if (!previewSelection.hasSelection) {
        return markers;
      }
      const { selectionStart, selectionEnd } = previewSelection;
      return MarkerData.filterMarkersToRange(
        markers,
        selectionStart,
        selectionEnd
      );
    }
  );

  const getIsNetworkChartEmptyInFullRange: Selector<boolean> = createSelector(
    getMarkers,
    markers => markers.filter(MarkerData.isNetworkMarker).length === 0
  );

  const getNetworkChartMarkers: Selector<Marker[]> = createSelector(
    getSearchFilteredMarkers,
    markers => markers.filter(MarkerData.isNetworkMarker)
  );

  const getMergedNetworkChartMarkers: Selector<Marker[]> = createSelector(
    getNetworkChartMarkers,
    MarkerData.mergeStartAndEndNetworkMarker
  );

  const getIsMarkerChartEmptyInFullRange: Selector<boolean> = createSelector(
    getMarkers,
    markers => MarkerData.filterForMarkerChart(markers).length === 0
  );

  const getMarkerChartMarkers: Selector<Marker[]> = createSelector(
    getSearchFilteredMarkers,
    MarkerData.filterForMarkerChart
  );

  const getMarkerChartTiming: Selector<MarkerTimingRows> = createSelector(
    getMarkerChartMarkers,
    MarkerTiming.getMarkerTiming
  );

  const getNetworkChartTiming: Selector<MarkerTimingRows> = createSelector(
    getNetworkChartMarkers,
    MarkerTiming.getMarkerTiming
  );

  const getNetworkMarkers: Selector<Marker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    markers => markers.filter(MarkerData.isNetworkMarker)
  );

  const getNetworkTrackTiming: Selector<MarkerTimingRows> = createSelector(
    getNetworkMarkers,
    MarkerTiming.getMarkerTiming
  );

  const getScreenshotsById = createSelector(
    _getRawMarkerTable,
    threadSelectors.getStringTable,
    ProfileSelectors.getProfileRootRange,
    MarkerData.extractScreenshotsById
  );

  const getRangeFilteredScreenshotsById: Selector<
    Map<string, Marker[]>
  > = createSelector(
    getScreenshotsById,
    ProfileSelectors.getCommittedRange,
    (screenshotsById, { start, end }) => {
      const newMap = new Map();
      for (const [id, screenshots] of screenshotsById) {
        newMap.set(
          id,
          MarkerData.filterMarkersToRange(screenshots, start, end)
        );
      }
      return newMap;
    }
  );

  const getSelectedMarkerIndex: Selector<
    IndexIntoRawMarkerTable | -1
  > = state => threadSelectors.getViewOptions(state).selectedMarker;

  return {
    getJankMarkers,
    getProcessedRawMarkerTable,
    getMarkers,
    getNetworkChartMarkers,
    getIsMarkerChartEmptyInFullRange,
    getMarkerChartMarkers,
    getMarkerChartTiming,
    getNetworkChartTiming,
    getCommittedRangeFilteredMarkers,
    getCommittedRangeFilteredMarkersForHeader,
    getNetworkMarkers,
    getNetworkTrackTiming,
    getMergedNetworkChartMarkers,
    getRangeFilteredScreenshotsById,
    getSearchFilteredMarkers,
    getPreviewFilteredMarkers,
    getSelectedMarkerIndex,
    getIsNetworkChartEmptyInFullRange,
  };
}
