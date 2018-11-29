/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

export class BasicTree<DataType, DisplayData> {
  _data: DataType[];
  _displayDataByIndex: Map<number, DisplayData>;

  constructor(data: DataType[]) {
    this._data = data;
    this._displayDataByIndex = new Map();
  }

  getRoots(): number[] {
    return this._data.map((_, i) => i);
  }

  getChildren(index: number): number[] {
    return index === -1 ? this.getRoots() : [];
  }

  hasChildren(_index: number): boolean {
    return false;
  }

  getAllDescendants(): Set<number> {
    return new Set();
  }

  getParent(): number {
    // -1 isn't used, but needs to be compatible with the call tree.
    return -1;
  }

  getDepth() {
    return 0;
  }

  hasSameNodeIds(tree: BasicTree<DataType, DisplayData>) {
    return this._data === tree._data;
  }

  getDisplayData(_index: number): DisplayData {
    throw new Error('Please implement `getDisplayData` in your extension.');
  }
}
