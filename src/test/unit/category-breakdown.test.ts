/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { sortCategoryBreakdown } from '../../profile-logic/category-breakdown';

import type { CategoryList } from 'firefox-profiler/types';

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
