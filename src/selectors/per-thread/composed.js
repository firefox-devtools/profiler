/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import { tabSlugs, type TabSlug } from '../../app-logic/tabs-handling';
import { getTimelineTrackOrganization } from '../url-state';

import type {
  Selector,
  $ReturnType,
  Thread,
  JsTracerTable,
  MarkerTimingRows,
  CombinedTimingRows,
  MarkerTiming,
} from 'firefox-profiler/types';

import type {
  StackTiming,
  StackTimingByDepth,
} from '../../profile-logic/stack-timing';

/**
 * Infer the return type from the getStackAndSampleSelectorsPerThread function. This
 * is done that so that the local type definition with `Selector<T>` is the canonical
 * definition for the type of the selector.
 */
export type ComposedSelectorsPerThread = $ReturnType<
  typeof getComposedSelectorsPerThread
>;

/**
 * This type contains the selectors needed for the extra selectors defined in
 * this file. It's non-exact because the passed object _will_ contain more
 * elements that we don't use here, and that's OK.
 */
type NeededThreadSelectors = {
  getThread: Selector<Thread>,
  getIsNetworkChartEmptyInFullRange: Selector<boolean>,
  getJsTracerTable: Selector<JsTracerTable | null>,
  getUserTimingMarkerTiming: Selector<MarkerTimingRows>,
  getStackTimingByDepth: Selector<StackTimingByDepth>,
};

/**
 * Create the selectors for a thread that have to do with either stacks or samples.
 */
export function getComposedSelectorsPerThread(
  threadSelectors: NeededThreadSelectors
) {
  /**
   * Visible tabs are computed based on the current state of the profile. Some
   * effort is made to not show a tab when there is no data available for it or
   * when it's absurd.
   */
  const getUsefulTabs: Selector<$ReadOnlyArray<TabSlug>> = createSelector(
    threadSelectors.getThread,
    threadSelectors.getIsNetworkChartEmptyInFullRange,
    threadSelectors.getJsTracerTable,
    getTimelineTrackOrganization,
    (
      { processType },
      isNetworkChartEmpty,
      jsTracerTable,
      timelineTrackOrganization
    ) => {
      if (processType === 'comparison') {
        // For a diffing tracks, we display only the calltree tab for now, because
        // other views make no or not much sense.
        return ['calltree'];
      }

      let visibleTabs = tabSlugs;
      if (
        isNetworkChartEmpty ||
        timelineTrackOrganization.type === 'active-tab'
      ) {
        // We either don't show the network chart if it's empty or we don't show it
        // for now when we are in single tab mode. This is because we don't know
        // which network request belongs to which page currently.
        visibleTabs = visibleTabs.filter(
          tabSlug => tabSlug !== 'network-chart'
        );
      }
      if (!jsTracerTable) {
        visibleTabs = visibleTabs.filter(tabSlug => tabSlug !== 'js-tracer');
      }
      return visibleTabs;
    }
  );

  /**
   * This selector combines the marker timing and stack timing for the stack chart.
   * This way it displays UserTiming along with the stack chart.
   */
  const getCombinedTimingRows: Selector<CombinedTimingRows> = createSelector(
    threadSelectors.getUserTimingMarkerTiming,
    threadSelectors.getStackTimingByDepth,
    (
      userTimingMarkerTiming,
      stackTimingByDepth
    ): Array<MarkerTiming | StackTiming> => [
      ...userTimingMarkerTiming,
      ...stackTimingByDepth,
    ]
  );

  return {
    getUsefulTabs,
    getCombinedTimingRows,
  };
}
