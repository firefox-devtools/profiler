/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getCategories } from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getTimingsForAllSamples,
  getTimingsForFuncIndex,
} from 'firefox-profiler/profile-logic/profile-data';
import { sortCategoryBreakdown } from 'firefox-profiler/profile-logic/category-breakdown';

import type {
  State,
  ThreadIndex,
  IndexIntoFuncTable,
} from 'firefox-profiler/types';
import type {
  BreakdownByCategory,
  ItemTimings,
} from 'firefox-profiler/profile-logic/profile-data';
import type { SortedCategoryBreakdown } from 'firefox-profiler/profile-logic/category-breakdown';
import type { Store } from '../../types/store';
import type { ThreadMap } from '../thread-map';
import type {
  CategoryBreakdown,
  FunctionCategoryBreakdown,
  FunctionCategoryBreakdowns,
} from '../types';

const EMPTY_BREAKDOWN: CategoryBreakdown = { totalSamples: 0, categories: [] };

function toCategoryBreakdown(
  sorted: SortedCategoryBreakdown
): CategoryBreakdown {
  return {
    totalSamples: sorted.total,
    categories: sorted.categories.map((entry) => ({
      name: entry.category.name,
      categoryIndex: entry.categoryIndex,
      samples: entry.value,
      percentage: entry.ratio * 100,
      subcategories: entry.hasSubcategories
        ? entry.subcategories.map((subcategory) => ({
            name: subcategory.name,
            subcategoryIndex: subcategory.subcategoryIndex,
            samples: subcategory.value,
            percentage: subcategory.ratio * 100,
          }))
        : [],
    })),
  };
}

function breakdownFromTimings(
  state: State,
  breakdownByCategory: BreakdownByCategory | null
): CategoryBreakdown {
  if (breakdownByCategory === null) {
    return EMPTY_BREAKDOWN;
  }
  return toCategoryBreakdown(
    sortCategoryBreakdown(breakdownByCategory, getCategories(state))
  );
}

/**
 * The samples and their per-sample categories have to come from the same
 * preview-filtered selectors, otherwise they aren't index-aligned and samples
 * get attributed to the wrong category.
 */
function getSamplesAndCategories(
  state: State,
  threadIndexes: Set<ThreadIndex>
) {
  const threadSelectors = getThreadSelectors(threadIndexes);
  return {
    threadSelectors,
    samples: threadSelectors.getPreviewFilteredCtssSamples(state),
    sampleCategoriesAndSubcategories:
      threadSelectors.getPreviewFilteredCtssSampleCategoriesAndSubcategories(
        state
      ),
  };
}

/**
 * Collect the category breakdown of every sample currently in view for a thread.
 */
export function collectThreadCategoryBreakdown(
  store: Store,
  threadIndexes: Set<ThreadIndex>
): CategoryBreakdown {
  const state = store.getState();
  const { samples, sampleCategoriesAndSubcategories } = getSamplesAndCategories(
    state,
    threadIndexes
  );
  const { breakdownByCategory } = getTimingsForAllSamples(
    getCategories(state),
    samples,
    sampleCategoriesAndSubcategories
  );
  return breakdownFromTimings(state, breakdownByCategory);
}

function toFunctionBreakdown(
  state: State,
  timings: ItemTimings['selfTime'],
  threadSamples: number
): FunctionCategoryBreakdown {
  return {
    ...breakdownFromTimings(state, timings.breakdownByCategory),
    samples: timings.value,
    percentageOfThread:
      threadSamples === 0 ? 0 : (timings.value / threadSamples) * 100,
  };
}

/**
 * Collect the running and self category breakdowns for a function, across all
 * the call paths it appears in.
 */
export function collectFunctionCategoryBreakdowns(
  store: Store,
  threadMap: ThreadMap,
  threadIndexes: Set<ThreadIndex>,
  funcIndex: IndexIntoFuncTable
): FunctionCategoryBreakdowns {
  const state = store.getState();
  const { threadSelectors, samples, sampleCategoriesAndSubcategories } =
    getSamplesAndCategories(state, threadIndexes);

  // Use the non-inverted call node info so the result doesn't depend on whether
  // the session has the call stack inverted.
  const { forFunc, rootTime } = getTimingsForFuncIndex(
    funcIndex,
    threadSelectors.getNonInvertedCallNodeInfo(state),
    getCategories(state),
    samples,
    sampleCategoriesAndSubcategories
  );

  return {
    threadHandle: threadMap.handleForThreadIndexes(threadIndexes),
    friendlyThreadName: threadSelectors.getFriendlyThreadName(state),
    threadSamples: rootTime,
    running: toFunctionBreakdown(state, forFunc.totalTime, rootTime),
    self: toFunctionBreakdown(state, forFunc.selfTime, rootTime),
  };
}
