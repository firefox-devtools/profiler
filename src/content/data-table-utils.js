// @flow
/**
 * A "data table" is a JS object of the form:
 * {
 *   length: <length>
 *   someColumnName: SomeType[<length>]
 *   someOtherColumnName: SomeOtherType[<length>]
 * }
 */

type DataTable = {
  [key: string]: mixed[],
  length: number,
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
  function swap(i, j) {
    for (const columnName in table) {
      if (columnName !== 'length') {
        const column = table[columnName];
        const temp = column[i];
        column[i] = column[j];
        column[j] = temp;
      }
    }
  }

  function partition(pivot, left, right) {
    const pivotValue = keyColumn[pivot];
    let partitionIndex = left;

    for (let i = left; i < right; i++) {
      if (comparator(keyColumn[i], pivotValue) < 0) {
        swap(i, partitionIndex);
        partitionIndex++;
      }
    }
    swap(right, partitionIndex);
    return partitionIndex;
  }

  function quickSort(left, right) {
    if (left < right) {
      const pivot = right;
      const partitionIndex = partition(pivot, left, right);

      // Sort left and right
      quickSort(left, partitionIndex - 1);
      quickSort(partitionIndex + 1, right);
    }
  }

  quickSort(0, table.length - 1);
  return table;
}
