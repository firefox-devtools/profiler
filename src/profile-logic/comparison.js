/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { IndexIntoCategoryList, CategoryList } from '../types/profile';

type TranslationMapForCategories = Map<
  IndexIntoCategoryList,
  IndexIntoCategoryList
>;
export function mergeCategories(
  categoriesPerThread: CategoryList[]
): {|
  categories: CategoryList,
  translationMaps: TranslationMapForCategories[],
|} {
  const newCategories = [];
  const translationMaps = [];

  categoriesPerThread.forEach(categories => {
    const translationMap = new Map();
    translationMaps.push(translationMap);
    const insertedCategories: Map<string, IndexIntoCategoryList> = new Map();

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
        `Category with index ${category} wasn't found in the translation map.`
      );
    }
    return result;
  });
}
