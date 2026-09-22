/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { shouldDisplaySubcategoryInfoForCategory } from './profile-data';

import type { BreakdownByCategory } from './profile-data';
import type {
  Category,
  CategoryList,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
  Milliseconds,
} from 'firefox-profiler/types';

export type SortedSubcategoryEntry = {
  subcategoryIndex: IndexIntoSubcategoryListForCategory;
  name: string;
  value: Milliseconds;
  ratio: number;
};

export type SortedCategoryEntry = {
  categoryIndex: IndexIntoCategoryList;
  category: Category;
  value: Milliseconds;
  ratio: number;
  hasSubcategories: boolean;
  subcategories: SortedSubcategoryEntry[];
};

export type SortedCategoryBreakdown = {
  total: Milliseconds; // Sum of the absolute category values, i.e. the ratios' denominator
  categories: SortedCategoryEntry[];
};

/**
 * Turn a raw category breakdown into the shape used for display: categories and
 * subcategories sorted in descending order with the empty ones removed, each
 * with its ratio of the total.
 */
export function sortCategoryBreakdown(
  breakdown: BreakdownByCategory,
  categoryList: CategoryList
): SortedCategoryBreakdown {
  const data = breakdown
    .map((oneCategoryBreakdown, categoryIndex) => {
      const category = categoryList[categoryIndex];
      return {
        categoryIndex,
        category,
        value: oneCategoryBreakdown.entireCategoryValue || 0,
        hasSubcategories: shouldDisplaySubcategoryInfoForCategory(category),
        subcategories: category.subcategories
          .map((subcategoryName, subcategoryIndex) => ({
            subcategoryIndex,
            name: subcategoryName,
            value: oneCategoryBreakdown.subcategoryBreakdown[subcategoryIndex],
          }))
          // sort subcategories in descending order
          .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
          .filter(({ value }) => value),
      };
    })
    // sort categories in descending order
    .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
    .filter(({ value }) => value);

  // Values can be negative for diffing tracks, that's why we use the absolute
  // value to compute the total time. Indeed even if all values average out,
  // we want to display a sensible percentage.
  const total = data.reduce((accum, { value }) => accum + Math.abs(value), 0);

  return {
    total,
    categories: data.map((entry) => ({
      ...entry,
      ratio: entry.value / total,
      subcategories: entry.subcategories.map((subcategory) => ({
        ...subcategory,
        ratio: subcategory.value / total,
      })),
    })),
  };
}
