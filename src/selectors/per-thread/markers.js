/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import * as UrlState from '../url-state';
import * as MarkerData from '../../profile-logic/marker-data';
import * as MarkerTiming from '../../profile-logic/marker-timing';
import * as ProfileSelectors from '../profile';

import { unsafeTransmute } from '../../utils/flow';

import type { RawMarkerTable } from '../../types/profile';
import type {
  IndexedMarker,
  IndexIntoMarkers,
  Marker,
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
  const _getRawMarkerTable: Selector<RawMarkerTable> = state =>
    threadSelectors.getThread(state).markers;

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
   * 3a. _getDerivedMarkers - Match up start/end markers, and start returning
   *                          the Marker[] type.
   * 3b. _getDerivedJankMarkers - Jank markers come from our samples data, and
   *                              this selector returns Marker structures out of
   *                              the samples structure.
   * 4. getReferenceMarkerTable - Concatenates and sorts all markers coming from
   *                              different origin structures.
   * 5. getCommittedRangeFilteredMarkers - Apply the committed range.
   * 6. getSearchFilteredMarkers - Apply the search string
   * 7. getPreviewFilteredMarkers - Apply the preview range
   */
  const getProcessedRawMarkerTable: Selector<RawMarkerTable> = createSelector(
    _getRawMarkerTable,
    threadSelectors.getStringTable,
    MarkerData.extractMarkerDataFromName
  );

  const _getFirstSampleTime: Selector<Milliseconds> = state =>
    threadSelectors.getThread(state).samples.time[0] || 0;
  const _getLastSampleTime: Selector<Milliseconds> = state =>
    threadSelectors.getThread(state).samples.time.slice(-1)[0] || 0;

  /* This selector exposes the result of the processing of the raw marker table
   * into our Marker structure that we use in the rest of our code. This is the
   * very start of our marker pipeline. */
  const _getDerivedMarkers: Selector<Marker[]> = createSelector(
    getProcessedRawMarkerTable,
    threadSelectors.getStringTable,
    _getFirstSampleTime,
    _getLastSampleTime,
    ProfileSelectors.getProfileInterval,
    MarkerData.deriveMarkersFromRawMarkerTable
  );

  const _getDerivedJankMarkers: Selector<Marker[]> = createSelector(
    threadSelectors.getSamplesTable,
    samples => MarkerData.deriveJankMarkers(samples, 50)
  );

  const getReferenceMarkerTable: Selector<IndexedMarker[]> = createSelector(
    _getDerivedMarkers,
    _getDerivedJankMarkers,
    (derivedMarkers, derivedJankMarkers) => {
      const allMarkers = [...derivedMarkers, ...derivedJankMarkers].sort(
        (a, b) => a.start - b.start
      );

      // Magic Flow Transmutation
      const resultMarkers: IndexedMarker[] = unsafeTransmute(allMarkers);
      resultMarkers.forEach((marker, i) => (marker.markerIndex = i));
      return resultMarkers;
    }
  );

  const getCommittedRangeFilteredMarkers: Selector<
    IndexedMarker[]
  > = createSelector(
    getReferenceMarkerTable,
    ProfileSelectors.getCommittedRange,
    (markers, range) => {
      const { start, end } = range;
      return MarkerData.filterMarkersToRange(markers, start, end);
    }
  );

  const getCommittedRangeFilteredMarkersForHeader: Selector<
    IndexedMarker[]
  > = createSelector(getCommittedRangeFilteredMarkers, markers =>
    markers.filter(
      tm =>
        tm.name !== 'GCMajor' &&
        tm.name !== 'BHR-detected hang' &&
        tm.name !== 'LongTask' &&
        tm.name !== 'LongIdleTask' &&
        tm.name !== 'Jank' &&
        !MarkerData.isNetworkMarker(tm) &&
        !MarkerData.isNavigationMarker(tm)
    )
  );

  const getTimelineVerticalMarkers: Selector<IndexedMarker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    markers => markers.filter(MarkerData.isNavigationMarker)
  );

  const getJankMarkersForHeader: Selector<IndexedMarker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    markers => markers.filter(marker => marker.name === 'Jank')
  );

  const getSearchFilteredMarkers: Selector<IndexedMarker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    UrlState.getMarkersSearchString,
    MarkerData.getSearchFilteredMarkers
  );

  const getPreviewFilteredMarkers: Selector<IndexedMarker[]> = createSelector(
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
    getReferenceMarkerTable,
    markers => markers.filter(MarkerData.isNetworkMarker).length === 0
  );

  const getNetworkChartMarkers: Selector<IndexedMarker[]> = createSelector(
    getSearchFilteredMarkers,
    markers => markers.filter(MarkerData.isNetworkMarker)
  );

  const getMergedNetworkChartMarkers: Selector<
    IndexedMarker[]
  > = createSelector(
    getNetworkChartMarkers,
    MarkerData.mergeStartAndEndNetworkMarker
  );

  const getIsMarkerChartEmptyInFullRange: Selector<boolean> = createSelector(
    getReferenceMarkerTable,
    markers => MarkerData.filterForMarkerChart(markers).length === 0
  );

  const getMarkerChartMarkers: Selector<IndexedMarker[]> = createSelector(
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

  const getNetworkMarkers: Selector<IndexedMarker[]> = createSelector(
    getCommittedRangeFilteredMarkers,
    markers => markers.filter(MarkerData.isNetworkMarker)
  );

  const getNetworkTrackTiming: Selector<MarkerTimingRows> = createSelector(
    getNetworkMarkers,
    MarkerTiming.getMarkerTiming
  );

  const getRangeFilteredScreenshotsById: Selector<
    Map<string, IndexedMarker[]>
  > = createSelector(
    getCommittedRangeFilteredMarkers,
    MarkerData.groupScreenshotsById
  );

  const getSelectedMarkerIndex: Selector<IndexIntoMarkers | null> = state =>
    threadSelectors.getViewOptions(state).selectedMarker;

  const getSelectedMarker: Selector<IndexedMarker | null> = state => {
    const filteredMarkers = getReferenceMarkerTable(state);
    const selectedMarkerIndex = getSelectedMarkerIndex(state);
    return selectedMarkerIndex === null
      ? null
      : filteredMarkers[selectedMarkerIndex] || null;
  };

  return {
    getJankMarkersForHeader,
    getProcessedRawMarkerTable,
    getReferenceMarkerTable,
    getNetworkChartMarkers,
    getIsMarkerChartEmptyInFullRange,
    getMarkerChartMarkers,
    getMarkerChartTiming,
    getNetworkChartTiming,
    getCommittedRangeFilteredMarkers,
    getCommittedRangeFilteredMarkersForHeader,
    getTimelineVerticalMarkers,
    getNetworkMarkers,
    getNetworkTrackTiming,
    getMergedNetworkChartMarkers,
    getRangeFilteredScreenshotsById,
    getSearchFilteredMarkers,
    getPreviewFilteredMarkers,
    getSelectedMarkerIndex,
    getSelectedMarker,
    getIsNetworkChartEmptyInFullRange,
  };
}
