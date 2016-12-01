export class UniqueStringArray {
  constructor(originalArray = []) {
    this._array = originalArray.slice(0);
    this._stringToIndex = new Map(originalArray.map((s, i) => [s, i]));
  }

  getString(index) {
    if (!(index in this._array)) {
      throw new Error(`index ${index} not in UniqueStringArray`);
    }
    return this._array[index];
  }

  indexForString(s) {
    let index = this._stringToIndex.get(s);
    if (index === undefined) {
      index = this._array.length;
      this._stringToIndex.set(s, index);
      this._array.push(s);
    }
    return index;
  }

  serializeToArray() {
    return this._array.slice(0);
  }
}
