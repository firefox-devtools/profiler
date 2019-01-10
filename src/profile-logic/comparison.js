/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/*
 * This file contains all functions that are needed to achieve profiles
 * comparison: how to merge profiles, how to diff them, etc.
 */

import { stripIndent } from 'common-tags';
import type { IndexIntoCategoryList, CategoryList } from '../types/profile';

type TranslationMapForCategories = Map<
  IndexIntoCategoryList,
  IndexIntoCategoryList
>;

/**
 * Merges several categories lists into one, resolving duplicates if necessary.
 * It returns a translation map that can be used in `adjustCategories` later.
 */
export function mergeCategories(
  categoriesPerThread: CategoryList[]
): {|
  categories: CategoryList,
  translationMaps: TranslationMapForCategories[],
|} {
  const newCategories = [];
  const translationMaps = [];
  const insertedCategories: Map<string, IndexIntoCategoryList> = new Map();

  categoriesPerThread.forEach(categories => {
    const translationMap = new Map();
    translationMaps.push(translationMap);

    categories.forEach((category, i) => {
      const { name } = category;
      const insertedCategoryIndex = insertedCategories.get(name);
      if (insertedCategoryIndex !== undefined) {
        translationMap.set(i, insertedCategoryIndex);
        return;
      }

      translationMap.set(i, newCategories.length);
      insertedCategories.set(name, newCategories.length);
      newCategories.push(category);
    });
  });

  return { categories: newCategories, translationMaps };
}

/**
 * Adjusts the category indices in a category list using a translation map.
 */
export function adjustCategories(
  categories: $ReadOnlyArray<IndexIntoCategoryList | null>,
  translationMap: TranslationMapForCategories
): Array<IndexIntoCategoryList | null> {
  return categories.map(category => {
    if (category === null) {
      return null;
    }
    const result = translationMap.get(category);
    if (result === undefined) {
      throw new Error(
        stripIndent`
          Category with index ${category} hasn't been found in the translation map.
          This shouldn't happen and indicates a bug in perf-html's code.
        `
      );
    }
    return result;
  });
}
