/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type IndexIntoIntSetTable = number;

export type IntSetTable = {
  prefix: Array<IndexIntoIntSetTable | null>;
  self: Array<number>;
  value: Array<number>;
  length: number;
};

export class IntSetTableBuilder {
  /**
   * Contains canonical and non-canonical nodes.
   * Canonical nodes have value == self, non-canonical nodes have value != self.
   * Canonical nodes are connected to other canonical nodes via prevSibling.
   * Canonical nodes also have a linked list of non-canonical nodes.
   */
  _prefixCol: Array<IndexIntoIntSetTable | null> = [];
  _valueCol: Array<number> = [];
  _selfCol: Array<number> = [];
  _canonicalIndex: Array<number> = [];
  _nextNonCanonical: Array<number | null> = [];
  _currentLastChildCol: Array<IndexIntoIntSetTable | null> = [];
  _prevSiblingCol: Array<IndexIntoIntSetTable | null> = [];
  _currentLastRoot: IndexIntoIntSetTable | null = null;
  _length: number = 0;

  /**
   * (), -1 -> (-1)
   * (5), 5 -> (5)
   * (5), -1 -> (5, -1)
   * (2, -1, 3), 3 -> (2, -1, 3)
   * (2, -1, 3), -1 -> (2, -1, 3)
   * (2, 3), 3 -> (2, 3)
   */
  indexForSetWithParentAndSelf(
    prefix: IndexIntoIntSetTable | null,
    self: number
  ): IndexIntoIntSetTable {
    if (prefix !== null) {
      if (this._selfCol[prefix] === self) {
        return prefix;
      }

      prefix = this._canonicalIndex[prefix];
    }

    const canonicalNode = this._getOrCreateCanonicalNode(prefix, self);
    return this._getOrCreateNodeWithCorrectSelf(canonicalNode, self);
  }

  _getOrCreateCanonicalNode(
    prefix: IndexIntoIntSetTable | null,
    value: number
  ): IndexIntoIntSetTable {
    if (prefix !== null && this._doesSetAlreadyContainValue(prefix, value)) {
      return prefix;
    }

    return (
      this._findCanonicalSiblingWithValue(prefix, value) ??
      this._createCanonicalNode(prefix, value)
    );
  }

  _doesSetAlreadyContainValue(
    node: IndexIntoIntSetTable,
    value: number
  ): boolean {
    for (
      let ancestor: IndexIntoIntSetTable | null = node;
      ancestor !== null;
      ancestor = this._prefixCol[ancestor]
    ) {
      if (this._valueCol[ancestor] === value) {
        return true;
      }
    }
    return false;
  }

  _findCanonicalSiblingWithValue(
    prefix: IndexIntoIntSetTable | null,
    value: number
  ): IndexIntoIntSetTable | null {
    const currentLastSibling =
      prefix !== null
        ? this._currentLastChildCol[prefix]
        : this._currentLastRoot;
    for (
      let candidate: IndexIntoIntSetTable | null = currentLastSibling,
        candidateNextSibling: IndexIntoIntSetTable | null = null;
      candidate !== null;
      candidateNextSibling = candidate,
        candidate = this._prevSiblingCol[candidate]
    ) {
      if (this._valueCol[candidate] === value) {
        // apply LRU sort
        // Before: -> currentLastSibling -> ... -> candidateNextSibling -> candidate -> candidatePrevSibling -> ...
        // After:  -> candidate -> currentLastSibling -> ... -> candidateNextSibling -> candidatePrevSibling -> ...

        // Only move if not already at the front
        if (candidate !== currentLastSibling) {
          if (prefix !== null) {
            this._currentLastChildCol[prefix] = candidate;
          } else {
            this._currentLastRoot = candidate;
          }
          const candidatePrevSibling = this._prevSiblingCol[candidate];
          this._prevSiblingCol[candidate] = currentLastSibling;
          if (candidateNextSibling !== null) {
            this._prevSiblingCol[candidateNextSibling] = candidatePrevSibling;
          }
        }

        return candidate;
      }
    }
    return null;
  }

  _getOrCreateNodeWithCorrectSelf(
    canonicalNode: IndexIntoIntSetTable,
    self: number
  ): IndexIntoIntSetTable {
    return (
      this._findNodeWithCorrectSelf(canonicalNode, self) ??
      this._createNonCanonicalNode(canonicalNode, self)
    );
  }

  _findNodeWithCorrectSelf(
    canonicalNode: IndexIntoIntSetTable,
    self: number
  ): IndexIntoIntSetTable | null {
    for (
      let candidate: IndexIntoIntSetTable | null = canonicalNode;
      candidate !== null;
      candidate = this._nextNonCanonical[candidate]
    ) {
      if (this._selfCol[candidate] === self) {
        return candidate;
      }
    }
    return null;
  }

  _createCanonicalNode(
    prefix: IndexIntoIntSetTable | null,
    value: number
  ): IndexIntoIntSetTable {
    const prevSibling =
      prefix !== null
        ? this._currentLastChildCol[prefix]
        : this._currentLastRoot;

    const newNode = this._length++;
    this._prefixCol[newNode] = prefix;
    this._valueCol[newNode] = value;
    this._selfCol[newNode] = value;
    this._canonicalIndex[newNode] = newNode;
    this._nextNonCanonical[newNode] = null;
    this._currentLastChildCol[newNode] = null;
    this._prevSiblingCol[newNode] = prevSibling;

    if (prefix !== null) {
      this._currentLastChildCol[prefix] = newNode;
    } else {
      this._currentLastRoot = newNode;
    }
    return newNode;
  }

  _createNonCanonicalNode(
    canonicalNode: IndexIntoIntSetTable,
    self: number
  ): IndexIntoIntSetTable {
    const newNode = this._length++;
    this._prefixCol[newNode] = this._prefixCol[canonicalNode];
    this._valueCol[newNode] = this._valueCol[canonicalNode];
    this._selfCol[newNode] = self;
    this._canonicalIndex[newNode] = canonicalNode;
    this._nextNonCanonical[newNode] = this._nextNonCanonical[canonicalNode];
    this._nextNonCanonical[canonicalNode] = newNode;
    this._currentLastChildCol[newNode] = null;
    this._prevSiblingCol[newNode] = null;
    return newNode;
  }

  finish(): IntSetTable {
    return {
      prefix: this._prefixCol,
      self: this._selfCol,
      value: this._valueCol,
      length: this._length,
    };
  }
}
