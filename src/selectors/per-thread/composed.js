/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { createSelector } from 'reselect';

import { tabSlugs, type TabSlug } from '../../app-logic/tabs-handling';

import type { Selector } from '../../types/store';
import type { $ReturnType } from '../../types/utils';
import type { Thread, JsTracerTable } from '../../types/profile';

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
};

/**
 * Create the selectors for a thread that have to do with either stacks or samples.
 */
export function getComposedSelectorsPerThread(
  threadSelectors: NeededThreadSelectors
): * {
  /**
   * Visible tabs are computed based on the current state of the profile. Some
   * effort is made to not show a tab when there is no data available for it or
   * when it's absurd.
   */
  const getUsefulTabs: Selector<$ReadOnlyArray<TabSlug>> = createSelector(
    threadSelectors.getThread,
    threadSelectors.getIsNetworkChartEmptyInFullRange,
    threadSelectors.getJsTracerTable,
    ({ processType }, isNetworkChartEmpty, jsTracerTable) => {
      if (processType === 'comparison') {
        // For a diffing tracks, we display only the calltree tab for now, because
        // other views make no or not much sense.
        return ['calltree'];
      }

      let visibleTabs = tabSlugs;
      if (isNetworkChartEmpty) {
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

  return {
    getUsefulTabs,
  };
}
