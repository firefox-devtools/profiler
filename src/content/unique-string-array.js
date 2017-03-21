// @flow
import type { IndexIntoStringTable } from '../common/types/profile';

export class UniqueStringArray {

  _array: string[]
  _stringToIndex: Map<string, IndexIntoStringTable>

  constructor(originalArray: string[] = []) {
    this._array = originalArray.slice(0);
    this._stringToIndex = new Map(originalArray.map((s, i) => [s, i]));
  }

  getString(index: IndexIntoStringTable): string {
    if (!(index in this._array)) {
      throw new Error(`index ${index} not in UniqueStringArray`);
    }
    return this._array[index];
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

  serializeToArray(): string[] {
    return this._array.slice(0);
  }
}
