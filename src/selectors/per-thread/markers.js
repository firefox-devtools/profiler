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
   * 2. getProcessedRawMarkerTable - Process marker payloads out of raw strings, and
   *                                 other future processing needs. This returns a
   *                                 RawMarkerTable still.
   * 3a. _getDerivedMarkers        - Match up start/end markers, and start
   *                                 returning the Marker[] type.
   * 3b. _getDerivedJankMarkers    - Jank markers come from our samples data, and
   *                                 this selector returns Marker structures out of
   *                                 the samples structure.
   * 4. getFullMarkerList          - Concatenates and sorts all markers coming from
   *                                 different origin structures.
   * 5. getFullMarkerListIndexes   - From the full marker list, generates an array
   *                                 containing the sequence of indexes for all markers.
   * 5. getCommittedRangeFilteredMarkerIndexes - Apply the committed range.
   * 6. getSearchFilteredMarkerIndexes         - Apply the search string
   * 7. getPreviewFilteredMarkerIndexes        - Apply the preview range
   *
   * Selectors are commonly written using the utility filterMarkerIndexesCreator
   * (see below for more information about this function).
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

  /**
   * This selector constructs jank markers from the responsiveness data.
   */
  const _getDerivedJankMarkers: Selector<Marker[]> = createSelector(
    threadSelectors.getSamplesTable,
    samples => MarkerData.deriveJankMarkers(samples, 50)
  );

  /**
   * This selector returns the list of all markers, this is our reference list
   * that MarkerIndex values refer to.
   */
  const getFullMarkerList: Selector<Marker[]> = createSelector(
    _getDerivedMarkers,
    _getDerivedJankMarkers,
    (derivedMarkers, derivedJankMarkers) =>
      [...derivedMarkers, ...derivedJankMarkers].sort(
        (a, b) => a.start - b.start
      )
  );

  /**
   * This selector returns a function that's used to retrieve a marker object
   * from its MarkerIndex:
   *
   *   const getMarker = selectedThreadSelectors.getMarkerGetter(state);
   *   const marker = getMarker(markerIndex);
   *
   * This is essentially the same as using the full marker list, but it's more
   * encapsulated and handles the case where a marker object isn't found (which
   * means the marker index is incorrect).
   */
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

  /**
   * This returns the list of all marker indexes. This is simply a sequence
   * built from the full marker list.
   */
  const getFullMarkerListIndexes: Selector<MarkerIndex[]> = createSelector(
    getFullMarkerList,
    markers => markers.map((_, i) => i)
  );

  /**
   * This utility function makes it easy to write selectors that deal with list
   * of marker indexes.
   * It takes a filtering function as parameter. This filtering function takes a
   * marker as parameter and returns a boolean deciding whether this marker
   * should be kept.
   * This function returns a function that does the actual filtering.
   *
   * It is typically used this way:
   *  const filteredMarkerIndexes = createSelector(
   *    getMarkerGetter,
   *    getSourceMarkerIndexesSelector,
   *    filterMarkerIndexesCreator(
   *      marker => MarkerData.isNetworkMarker(marker)
   *    )
   *  );
   */
  const filterMarkerIndexesCreator = (filterFunc: Marker => boolean) => (
    getMarker: MarkerIndex => Marker,
    markerIndexes: MarkerIndex[]
  ): MarkerIndex[] =>
    MarkerData.filterMarkerIndexes(getMarker, markerIndexes, filterFunc);

  /**
   * This selector applies the committed range to the full list of markers.
   */
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

  /**
   * This selector filters out markers that are usually too long to be displayed
   * in the header, because they would obscure the header, or that are displayed
   * in other tracks already.
   */
  const getCommittedRangeFilteredMarkerIndexesForHeader: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(
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

  /**
   * This selector selects only navigation markers.
   */
  const getTimelineVerticalMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(MarkerData.isNavigationMarker)
  );

  /**
   * This selector selects only jank markers.
   */
  const getJankMarkerIndexesForHeader: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(marker => marker.name === 'Jank')
  );

  /**
   * This selector filters markers matching a search string.
   */
  const getSearchFilteredMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    UrlState.getMarkersSearchStringsAsRegExp,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  /**
   * This further filters markers using the preview selection range.
   */
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

  /**
   * This selector finds out whether there's any network marker in this thread.
   */
  const getIsNetworkChartEmptyInFullRange: Selector<boolean> = createSelector(
    getFullMarkerList,
    markers => markers.every(marker => !MarkerData.isNetworkMarker(marker))
  );

  /**
   * This selector filters network markers from the range filtered markers.
   */
  const getNetworkMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(MarkerData.isNetworkMarker)
  );

  /**
   * This filters network markers using a search string.
   */
  const getSearchFilteredNetworkMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getNetworkMarkerIndexes,
    UrlState.getNetworkSearchStringsAsRegExp,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  /**
   * Returns whether there's any marker besides network markers.
   */
  const getAreMarkerPanelsEmptyInFullRange: Selector<boolean> = createSelector(
    getFullMarkerList,
    markers => markers.every(marker => MarkerData.isNetworkMarker(marker))
  );

  /**
   * This filters out network markers from the list of all markers, so that
   * they'll be displayed in the marker chart.
   */
  const getMarkerChartMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    MarkerData.filterForMarkerChart
  );

  /**
   * This filters the previous result using a search string.
   */
  const getSearchFilteredMarkerChartMarkerIndexes: Selector<
    MarkerIndex[]
  > = createSelector(
    getMarkerGetter,
    getMarkerChartMarkerIndexes,
    UrlState.getMarkersSearchStringsAsRegExp,
    MarkerData.getSearchFilteredMarkerIndexes
  );

  /**
   * This organizes the result of the previous selector in rows to be nicely
   * displayed in the marker chart.
   */
  const getMarkerChartTiming: Selector<MarkerTimingRows> = createSelector(
    getMarkerGetter,
    getSearchFilteredMarkerChartMarkerIndexes,
    MarkerTiming.getMarkerTiming
  );

  /**
   * This returns only FileIO markers.
   */
  const getFileIoMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(MarkerData.isFileIoMarker)
  );

  /**
   * This returns only memory markers.
   */
  const getMemoryMarkerIndexes: Selector<MarkerIndex[]> = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    filterMarkerIndexesCreator(MarkerData.isMemoryMarker)
  );

  /**
   * This organizes the network markers in rows so that they're nicely displayed
   * in the header.
   */
  const getNetworkTrackTiming: Selector<MarkerTimingRows> = createSelector(
    getMarkerGetter,
    getNetworkMarkerIndexes,
    MarkerTiming.getMarkerTiming
  );

  /**
   * This groups screenshot markers by their window ID.
   */
  const getRangeFilteredScreenshotsById: Selector<
    Map<string, Marker[]>
  > = createSelector(
    getMarkerGetter,
    getCommittedRangeFilteredMarkerIndexes,
    MarkerData.groupScreenshotsById
  );

  /**
   * This returns the marker index for the currently selected marker.
   */
  const getSelectedMarkerIndex: Selector<MarkerIndex | null> = state =>
    threadSelectors.getViewOptions(state).selectedMarker;

  /**
   * From the previous value, this returns the full marker object for the
   * selected marker.
   */
  const getSelectedMarker: Selector<Marker | null> = state => {
    const getMarker = getMarkerGetter(state);
    const selectedMarkerIndex = getSelectedMarkerIndex(state);

    if (selectedMarkerIndex === null) {
      return null;
    }

    return getMarker(selectedMarkerIndex);
  };

  /**
   * This returns the marker index for the currently right clicked marker.
   */
  const getRightClickedMarkerIndex: Selector<MarkerIndex | null> = state =>
    threadSelectors.getViewOptions(state).rightClickedMarker;

  /**
   * From the previous value, this returns the full marker object for the
   * selected marker.
   */
  const getRightClickedMarker: Selector<Marker | null> = state => {
    const getMarker = getMarkerGetter(state);
    const rightClickedMarkerIndex = getRightClickedMarkerIndex(state);

    if (rightClickedMarkerIndex === null) {
      return null;
    }

    return getMarker(rightClickedMarkerIndex);
  };

  return {
    getMarkerGetter,
    getJankMarkerIndexesForHeader,
    getProcessedRawMarkerTable,
    getFullMarkerListIndexes,
    getNetworkMarkerIndexes,
    getSearchFilteredNetworkMarkerIndexes,
    getAreMarkerPanelsEmptyInFullRange,
    getMarkerChartMarkerIndexes,
    getSearchFilteredMarkerChartMarkerIndexes,
    getMarkerChartTiming,
    getCommittedRangeFilteredMarkerIndexes,
    getCommittedRangeFilteredMarkerIndexesForHeader,
    getTimelineVerticalMarkerIndexes,
    getFileIoMarkerIndexes,
    getMemoryMarkerIndexes,
    getNetworkTrackTiming,
    getRangeFilteredScreenshotsById,
    getSearchFilteredMarkerIndexes,
    getPreviewFilteredMarkerIndexes,
    getSelectedMarkerIndex,
    getSelectedMarker,
    getRightClickedMarkerIndex,
    getRightClickedMarker,
    getIsNetworkChartEmptyInFullRange,
  };
}
