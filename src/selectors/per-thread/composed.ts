/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { createSelector } from 'reselect';

import {
  tabSlugs,
  type TabSlug,
  tabsShowingSampleData,
} from '../../app-logic/tabs-handling';

import { getRawProfileSharedData } from '../profile';

import {
  Selector,
  $ReturnType,
  RawThread,
  JsTracerTable,
  MarkerTimingRows,
  CombinedTimingRows,
  MarkerTiming,
} from 'firefox-profiler/types';

import {
  StackTiming,
  StackTimingByDepth,
} from '../../profile-logic/stack-timing';

import { hasUsefulSamples } from '../../profile-logic/profile-data';

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
  getRawThread: Selector<RawThread>;
  getIsNetworkChartEmptyInFullRange: Selector<boolean>;
  getJsTracerTable: Selector<JsTracerTable | null>;
  getUserTimingMarkerTiming: Selector<MarkerTimingRows>;
  getStackTimingByDepth: Selector<StackTimingByDepth>;
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
  const getUsefulTabs: Selector<ReadonlyArray<TabSlug>> = createSelector(
    getRawProfileSharedData,
    threadSelectors.getRawThread,
    threadSelectors.getIsNetworkChartEmptyInFullRange,
    threadSelectors.getJsTracerTable,
    (shared, thread, isNetworkChartEmpty, jsTracerTable) => {
      if (thread.processType === 'comparison') {
        // For a diffing tracks, we display only the calltree tab for now, because
        // other views make no or not much sense.
        return ['calltree'];
      }

      let visibleTabs = tabSlugs;
      if (isNetworkChartEmpty) {
        // Don't show the network chart if it's empty.
        visibleTabs = visibleTabs.filter(
          (tabSlug) => tabSlug !== 'network-chart'
        );
      }

      if (!jsTracerTable) {
        visibleTabs = visibleTabs.filter((tabSlug) => tabSlug !== 'js-tracer');
      }

      const { samples, jsAllocations, nativeAllocations } = thread;
      const hasSamples = [samples, jsAllocations, nativeAllocations].some(
        (table) => hasUsefulSamples(table?.stack, thread, shared)
      );
      if (!hasSamples) {
        visibleTabs = visibleTabs.filter(
          (tabSlug) => !tabsShowingSampleData.includes(tabSlug)
        );
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
