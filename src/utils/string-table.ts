/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IndexIntoStringTable } from 'firefox-profiler/types';

const _cachedTables: WeakMap<string[], StringTable> = new WeakMap();

/**
 * The string table manages the storing of strings. It's used to "intern" strings,
 * i.e. to store only one copy of each string and to manage the mapping between
 * strings and string indexes.
 *
 * Create a StringTable using `StringTable.withBackingArray(strArray)`.
 * When strings are added, `strArray` is mutated.
 * The StringTable is append-only - strings are never removed.
 *
 * Do not mutate the underlying array manually!
 * Once you call `StringTable.withBackingArray`, only use
 * `StringTable.indexForString` to add strings. Otherwise the cached table,
 * specifically the string-to-index map, will not remain in-sync with the array
 * ontents, and future callers of `StringTable.withBackingArray` might receive
 * an out-of-sync cached StringTable.
 *
 * You can clone the underlying array if you want a new array to mutate manually.
 */
export class StringTable {
  _array: string[];
  _stringToIndex: Map<string, IndexIntoStringTable>;

  /**
   * This constructor should not be called directly (other than by
   * withBackingArray) - call withBackingArray instead.
   */
  constructor(mutatedArray: string[]) {
    this._array = mutatedArray;
    this._stringToIndex = new Map();
    for (let i = 0; i < mutatedArray.length; i++) {
      this._stringToIndex.set(mutatedArray[i], i);
    }
  }

  /**
   * Used to create a (new or cached) StringTable.
   *
   * When strings are added, the underlying array is mutated.
   *
   * Do not mutate the array manually! Once you call `StringTable.withBackingArray`,
   * only use `StringTable.indexForString` to add strings. Otherwise the cached
   * table (specifically the string-to-index map) will not remain in-sync with the
   * array contents, and future callers of `StringTable.withBackingArray` might
   * receive an out-of-sync StringTable.
   */
  static withBackingArray(stringArray: string[]): StringTable {
    let table = _cachedTables.get(stringArray);
    if (table === undefined) {
      table = new StringTable(stringArray);
      _cachedTables.set(stringArray, table);
    }
    return table;
  }

  getString(index: IndexIntoStringTable, els?: string | null): string {
    if (!this.hasIndex(index)) {
      if (els) {
        console.warn(`index ${index} not in StringTable`);
        return els;
      }
      throw new Error(`index ${index} not in StringTable`);
    }
    return this._array[index];
  }

  hasIndex(i: IndexIntoStringTable): boolean {
    return i in this._array;
  }

  hasString(s: string): boolean {
    return this._stringToIndex.has(s);
  }

  indexForString(s: string): IndexIntoStringTable {
    let index = this._stringToIndex.get(s);
    if (index === undefined) {
      index = this._array.length;
      this._stringToIndex.set(s, index);
      this._array.push(s);
    }
    return index;
  }

  /**
   * Exposes the underlying array. Do not mutate the contents.
   */
  getBackingArray(): string[] {
    return this._array;
  }
}
