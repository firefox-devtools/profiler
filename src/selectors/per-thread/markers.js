/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';
import { stripIndent } from 'common-tags';

import * as UrlState from '../url-state';
import * as MarkerData from '../../profile-logic/marker-data';
import * as MarkerTiming from '../../profile-logic/marker-timing';
import * as ProfileSelectors from '../profile';

import type { RawMarkerTable } from '../../types/profile';
import type {
  MarkerIndex,
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
   * 4. getFullMarkerList - Concatenates and sorts all markers coming from
   *                        different origin structures.
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

  const getFullMarkerList: Selector<Marker[]> = createSelector(
    _getDerivedMarkers,
    _getDerivedJankMarkers,
    (derivedMarkers, derivedJankMarkers) =>
      [...derivedMarkers, ...derivedJankMarkers].sort(
        (a, b) => a.start - b.start
      )
  );

  const getMarkerGetter: Selector<(MarkerIndex) => Marker> = createSelector(
    getFullMarkerList,
    markerList => (markerIndex: MarkerIndex): Marker => {
      const marker = markerList[markerIndex];
      if (!marker) {
        throw new Error(stripIndent`
          Tried to get marker index ${markerIndex} but it's not in the full list.
          This is a programming error.
        `);
      }
      return marker;
    }
  );

  const getFullMarkerListIndexes: Selector<MarkerIndex[]> = createSelector(
    getFullMarkerList,
    markers => markers.map((_, i) => i)
  );

  const getCommittedRangeFilteredMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getFullMarkerListIndexes,
    ProfileSelectors.getCommittedRange,
    (getMarker, markerIndexes, range): MarkerIndex[] => {
      const { start, end } = range;
      return MarkerData.filterMarkerIndexesToRange(
        getMarker,
        markerIndexes,
        start,
        end
      );
    }
  );

  const getCommittedRangeFilteredMarkerIndexesForHeader: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes): MarkerIndex[] =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        marker =>
          marker.name !== 'BHR-detected hang' &&
          marker.name !== 'LongTask' &&
          marker.name !== 'LongIdleTask' &&
          marker.name !== 'Jank' &&
          !MarkerData.isNetworkMarker(marker) &&
          !MarkerData.isFileIoMarker(marker) &&
          !MarkerData.isNavigationMarker(marker) &&
          !MarkerData.isMemoryMarker(marker)
      )
  );

  const getTimelineVerticalMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes): MarkerIndex[] =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        MarkerData.isNavigationMarker
      )
  );

  const getJankMarkerIndexesForHeader: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes) =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        marker => marker.name === 'Jank'
      )
  );

  const getSearchFilteredMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    UrlState.getMarkersSearchString,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  const getPreviewFilteredMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getSearchFilteredMarkerIndexes,
    ProfileSelectors.getPreviewSelection,
    (getMarker, markerIndexes, previewSelection) => {
      if (!previewSelection.hasSelection) {
        return markerIndexes;
      }
      const { selectionStart, selectionEnd } = previewSelection;
      return MarkerData.filterMarkerIndexesToRange(
        getMarker,
        markerIndexes,
        selectionStart,
        selectionEnd
      );
    }
  );

  const getIsNetworkChartEmptyInFullRange: Selector<boolean> = createSelector(
    getFullMarkerList,
    markers => markers.every(marker => !MarkerData.isNetworkMarker(marker))
  );

  const getNetworkChartMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes) =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        MarkerData.isNetworkMarker
      )
  );

  const getSearchFilteredNetworkChartMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getNetworkChartMarkerIndexes,
    UrlState.getNetworkSearchString,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  const getIsMarkerChartEmptyInFullRange: Selector<boolean> = createSelector(
    getFullMarkerList,
    markers => markers.every(marker => MarkerData.isNetworkMarker(marker))
  );

  const getMarkerChartMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    MarkerData.filterForMarkerChart
  );

  const getSearchFilteredMarkerChartMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getMarkerChartMarkerIndexes,
    UrlState.getMarkersSearchString,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  const getMarkerChartTiming: Selector<MarkerTimingRows> = createSelector(
    getMarkerGetter,
    getSearchFilteredMarkerChartMarkerIndexes,
    MarkerTiming.getMarkerTiming
  );

  const getNetworkMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes) =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        MarkerData.isNetworkMarker
      )
  );

  const getFileIoMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes) =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        MarkerData.isFileIoMarker
      )
  );

  const getMemoryMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    (markerList, markerIndexes) =>
      MarkerData.filterMarkerIndexes(
        markerList,
        markerIndexes,
        MarkerData.isMemoryMarker
      )
  );

  const getNetworkTrackTiming: Selector<MarkerTimingRows> = createSelector(
    getMarkerGetter,
    getNetworkMarkerIndexes,
    MarkerTiming.getMarkerTiming
  );

  const getRangeFilteredScreenshotsById: Selector<
    Map<string, Marker[]>
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    MarkerData.groupScreenshotsById
  );

  const getSelectedMarkerIndex: Selector<MarkerIndex | null> = state =>
    threadSelectors.getViewOptions(state).selectedMarker;

  return {
    getMarkerGetter,
    getJankMarkerIndexesForHeader,
    getProcessedRawMarkerTable,
    getFullMarkerListIndexes,
    getNetworkChartMarkerIndexes,
    getSearchFilteredNetworkChartMarkerIndexes,
    getIsMarkerChartEmptyInFullRange,
    getMarkerChartMarkerIndexes,
    getSearchFilteredMarkerChartMarkerIndexes,
    getMarkerChartTiming,
    getCommittedRangeFilteredMarkerIndexes,
    getCommittedRangeFilteredMarkerIndexesForHeader,
    getTimelineVerticalMarkerIndexes,
    getFileIoMarkerIndexes,
    getMemoryMarkerIndexes,
    getNetworkMarkerIndexes,
    getNetworkTrackTiming,
    getRangeFilteredScreenshotsById,
    getSearchFilteredMarkerIndexes,
    getPreviewFilteredMarkerIndexes,
    getSelectedMarkerIndex,
    getIsNetworkChartEmptyInFullRange,
  };
}
