/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getTimingsForAllSamples,
  getTimingsForCallNodeIndex,
  getTimingsForFuncIndex,
} from '../../profile-logic/profile-data';
import { sortCategoryBreakdown } from '../../profile-logic/category-breakdown';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getCategories } from 'firefox-profiler/selectors/profile';

import type { BreakdownByCategory } from '../../profile-logic/profile-data';
import type { CategoryList } from 'firefox-profiler/types';

function setupWithTextSamples(textSamples: string) {
  const { profile, funcNamesDictPerThread } =
    getProfileFromTextSamples(textSamples);
  const store = storeWithProfile(profile);
  const state = store.getState();
  const threadSelectors = getThreadSelectors(0);
  const categories = getCategories(state);

  return {
    state,
    threadSelectors,
    categories,
    funcNames: funcNamesDictPerThread[0],
    samples: threadSelectors.getPreviewFilteredCtssSamples(state),
    sampleCategoriesAndSubcategories:
      threadSelectors.getPreviewFilteredCtssSampleCategoriesAndSubcategories(
        state
      ),
  };
}

/** The value of one category in a breakdown, by category name. */
function valuesByCategoryName(
  breakdown: BreakdownByCategory | null,
  categories: CategoryList
): { [name: string]: number } {
  const values: { [name: string]: number } = {};
  if (breakdown === null) {
    return values;
  }
  breakdown.forEach((oneCategoryBreakdown, categoryIndex) => {
    if (oneCategoryBreakdown.entireCategoryValue !== 0) {
      values[categories[categoryIndex].name] =
        oneCategoryBreakdown.entireCategoryValue;
    }
  });
  return values;
}

describe('getTimingsForAllSamples', function () {
  it('counts every sample in its own category', function () {
    const { categories, samples, sampleCategoriesAndSubcategories } =
      setupWithTextSamples(`
        A[cat:Layout]  A[cat:Layout]  A[cat:Layout]  B[cat:Graphics]
        C[cat:Layout]  C[cat:Layout]  D[cat:GC / CC]
      `);

    const { value, breakdownByCategory } = getTimingsForAllSamples(
      categories,
      samples,
      sampleCategoriesAndSubcategories
    );

    expect(value).toBe(4);
    expect(valuesByCategoryName(breakdownByCategory, categories)).toEqual({
      Layout: 2,
      'GC / CC': 1,
      Graphics: 1,
    });
  });

  it('matches the root time of getTimingsForCallNodeIndex', function () {
    const {
      state,
      threadSelectors,
      categories,
      samples,
      sampleCategoriesAndSubcategories,
    } = setupWithTextSamples(`
        A[cat:Layout]  A[cat:Layout]  E[cat:Graphics]
        B[cat:Layout]  C[cat:GC / CC]
      `);

    const { rootTime } = getTimingsForCallNodeIndex(
      0,
      threadSelectors.getCallNodeInfo(state),
      categories,
      samples,
      sampleCategoriesAndSubcategories
    );

    expect(
      getTimingsForAllSamples(
        categories,
        samples,
        sampleCategoriesAndSubcategories
      ).value
    ).toBe(rootTime);
  });
});

describe('getTimingsForFuncIndex', function () {
  it('splits self and running time by category', function () {
    const {
      state,
      threadSelectors,
      categories,
      funcNames,
      samples,
      sampleCategoriesAndSubcategories,
    } = setupWithTextSamples(`
      A[cat:Layout]  A[cat:Layout]     A[cat:Layout]
      B[cat:Layout]  B[cat:GC / CC]
                     C[cat:Graphics]
    `);

    const { forFunc, rootTime } = getTimingsForFuncIndex(
      funcNames.B,
      threadSelectors.getNonInvertedCallNodeInfo(state),
      categories,
      samples,
      sampleCategoriesAndSubcategories
    );

    expect(rootTime).toBe(3);
    expect(forFunc.totalTime.value).toBe(2);
    expect(
      valuesByCategoryName(forFunc.totalTime.breakdownByCategory, categories)
    ).toEqual({ Layout: 1, Graphics: 1 });

    // Only the first sample has B as its leaf; in the second one B calls C.
    expect(forFunc.selfTime.value).toBe(1);
    expect(
      valuesByCategoryName(forFunc.selfTime.breakdownByCategory, categories)
    ).toEqual({ Layout: 1 });
  });

  it('counts a recursive function once per sample, like the function list', function () {
    const {
      state,
      threadSelectors,
      categories,
      funcNames,
      samples,
      sampleCategoriesAndSubcategories,
    } = setupWithTextSamples(`
      A  A  A  A
      B  B  B
      A  A  A
      B  B
      A
    `);

    const functionListTree = threadSelectors.getFunctionListTree(state);
    const callNodeInfo = threadSelectors.getNonInvertedCallNodeInfo(state);

    for (const funcName of ['A', 'B']) {
      const funcIndex = funcNames[funcName];
      const { forFunc } = getTimingsForFuncIndex(
        funcIndex,
        callNodeInfo,
        categories,
        samples,
        sampleCategoriesAndSubcategories
      );
      const nodeData = functionListTree.getNodeData(funcIndex);

      expect({
        funcName,
        total: forFunc.totalTime.value,
        self: forFunc.selfTime.value,
      }).toEqual({
        funcName,
        total: nodeData.total,
        self: nodeData.self,
      });
    }
  });
});

describe('sortCategoryBreakdown', function () {
  const categoryList: CategoryList = [
    { name: 'Idle', color: 'transparent', subcategories: ['Other'] },
    {
      name: 'Layout',
      color: 'purple',
      subcategories: ['Other', 'Reflow', 'Restyle'],
    },
    { name: 'Graphics', color: 'green', subcategories: ['Other'] },
  ];

  it('sorts descending, drops the empty entries and computes ratios', function () {
    const sorted = sortCategoryBreakdown(
      [
        { entireCategoryValue: 0, subcategoryBreakdown: [0] },
        { entireCategoryValue: 30, subcategoryBreakdown: [10, 20, 0] },
        { entireCategoryValue: 10, subcategoryBreakdown: [10] },
      ],
      categoryList
    );

    expect(sorted.total).toBe(40);
    expect(
      sorted.categories.map(({ category, value, ratio, hasSubcategories }) => ({
        name: category.name,
        value,
        ratio,
        hasSubcategories,
      }))
    ).toEqual([
      { name: 'Layout', value: 30, ratio: 0.75, hasSubcategories: true },
      { name: 'Graphics', value: 10, ratio: 0.25, hasSubcategories: false },
    ]);
    expect(sorted.categories[0].subcategories).toEqual([
      { subcategoryIndex: 1, name: 'Reflow', value: 20, ratio: 0.5 },
      { subcategoryIndex: 0, name: 'Other', value: 10, ratio: 0.25 },
    ]);
  });

  it('uses absolute values as the denominator, so diff profiles still add up', function () {
    const sorted = sortCategoryBreakdown(
      [
        { entireCategoryValue: 0, subcategoryBreakdown: [0] },
        { entireCategoryValue: 30, subcategoryBreakdown: [30, 0, 0] },
        { entireCategoryValue: -10, subcategoryBreakdown: [-10] },
      ],
      categoryList
    );

    expect(sorted.total).toBe(40);
    expect(sorted.categories.map(({ value }) => value)).toEqual([30, -10]);
  });
});
