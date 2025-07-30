/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A "data table" is a JS object of the form:
 * {
 *   length: <length>
 *   someColumnName: SomeType[<length>]
 *   someOtherColumnName: SomeOtherType[<length>]
 * }
 */

type DataTable = {
  length: number;
  [key: string]: unknown[] | number;
};

type compareFn<T> = { (a: T, b: T): number };

/**
 * Sorts the data table |table|, affecting all columns.
 * This is necessary because Array.prototype.sort doesn't let you sort
 * multiple arrays at the same time; you'd need to convert from
 * struct-of-arrays form to array-of-structs, sort, and convert back into
 * struct-of-arrays form.
 * This function lets you sort without conversion, and saves the garbage
 * allocation that this would cause.
 * @param {object}   table       The data table. Gets mutated.
 * @param {string}   keyColumn   The column whose values to pass to the
 *                               comparator function. E.g. table.time
 * @param {function} comparator  A comparator function that receives two
 *                               arguments which are values from keyColumn,
 *                               and behaves like one that you'd pass to
 *                               Array.prototype.sort.
 * @returns The data table.
 */
export function sortDataTable<KeyColumnElementType>(
  table: DataTable,
  keyColumn: KeyColumnElementType[],
  comparator: compareFn<KeyColumnElementType>
): DataTable {
  function swap(i: number, j: number) {
    if (i !== j) {
      for (const columnName in table) {
        if (columnName !== 'length') {
          const column = table[columnName];
          const temp = column[i];
          column[i] = column[j];
          column[j] = temp;
        }
      }
    }
  }

  // Reorders the values in the range left <= k <= right and returns an index
  // "partitionIndex" such that the elements at k for left <= k < partitionIndex
  // are < pivotValue, the elements at k for partitionIndex < k <= right
  // are >= pivotValue, and the element at partitionIndex is == pivotValue.
  // If the range is already sorted, no swaps are performed.
  function partition(pivot: number, left: number, right: number) {
    const pivotValue = keyColumn[pivot];

    // At the end of each iteration, the following is true:
    // All elements at k for left <= k < partitionIndex are < pivotValue.
    // All elements at k for partitionIndex <= k <= i are >= pivotValue.
    // Specifically, the element at partitionIndex is the first one in the
    // range left <= k <= right which is potentially >= pivotValue, and which
    // will need to be moved out of the way when encountering an element
    // that's < pivotValue.
    let partitionIndex = left;
    let pivotIndex = pivot;
    for (let i = left; i <= right; i++) {
      if (comparator(keyColumn[i], pivotValue) < 0) {
        swap(i, partitionIndex);
        if (partitionIndex === pivotIndex) {
          // We just swapped our pivot away. Update pivotIndex to keep track
          // of it.
          pivotIndex = i;
        }
        partitionIndex++;
      }
    }
    // Swap the pivot back into the position at partitionIndex.
    swap(partitionIndex, pivotIndex);
    return partitionIndex;
  }

  function quickSort(left: number, right: number) {
    if (left < right) {
      // QuickSort's effectiveness depends on its ability to partition the
      // sequence being sorted into two subsequences of roughly equal length:
      // by halving the length at each recursion level, the subproblems get
      // smaller faster. To get a good partition, we must choose a pivot value
      // that is close to the median of the values in the sequence: by
      // definition, half of the values will fall before the median, half
      // after it.
      // If the sequence is already mostly sorted, then choosing the first or
      // last value as the pivot is probably as far from the median as you
      // could possibly get; this is a "pessimal", not optimal, choice.
      // Choosing the middle value as the pivot is likely to be much closer to
      // the median.
      const pivot = (left + right) >> 1;
      const partitionIndex = partition(pivot, left, right);

      // Sort left and right
      quickSort(left, partitionIndex - 1);
      quickSort(partitionIndex + 1, right);
    }
  }

  quickSort(0, table.length - 1);
  return table;
}