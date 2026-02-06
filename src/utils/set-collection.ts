/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export type IndexIntoSetCollectionTable = number;

/**
 * A data structure which efficiently stores a collection of sets of T
 * in a trie-like structure.
 *
 * Given the index i of an entry in the collection, the elements in the
 * set i are the following:
 * ```
 * for (let ancestor = i; ancestor !== null; ancestor = table.parent[ancestor]) {
 *   yield table.value[ancestor];
 * }
 * ```
 *
 * The creator of the table guarantees:
 * - The loop above does not yield any duplicates.
 * - The loop above always terminates (there are no cycles).
 *
 * Example:
 *
 *    value        parent    represents set
 * -----------------------------------------
 * 0: A            null      { A }
 * 1: - B          0         { A, B }
 * 2:   - C        1         { A, B, C }
 * 3:   - D        1         { A, B, D }
 * 4:   - C        1         { A, B, C }
 * 5: D            null      { D }
 * 6: - A          5         { D, A }
 * 7:   - B        6         { D, A, B }
 * 8: - A          5         { D, A }
 *
 * This example demonstrates the structural sharing, as well as the limits of that
 * sharing. For example, we have some duplicates:
 * - The set { A, B, C } is present twice.
 * - The set { D, A } is present twice.
 * - We have both { A, B, D } and { D, A, B }, even though both represent the same
 *   set of values.
 *
 * This is allowed.
 *
 * It's just things like { A, B, A } that are not allowed.
 *
 * ## The "self" value
 *
 * In addition to storing a set per entry, we also store a "self" value.
 * So really, each entry represents a pair (set of values, self value).
 *
 * This is kind of an unrelated concern, but quite useful.
 *
 * For every entry i, table.self[i] is one of the values in the set represented by
 * i, but not necessarily the same as table.value[i] - for example, it could be
 * the same as parent or grand-parent's value instead.
 *
 * Here's a valid example with some self values:
 *
 *    value        parent    represents set   self
 *   ---------------------------------------------
 * 0: A            null      { A }            A
 * 1: - B          0         { A, B }         B
 * 2:   - C        1         { A, B, C }      C
 * 3:   - D        1         { A, B, D }      D
 * 4:   - C        1         { A, B, C }      B
 * 5: D            null      { D }            D
 * 6: - A          5         { D, A }         A
 * 7:   - B        6         { D, A, B }      B
 * 8: - A          5         { D, A }         D
 *
 * For example, the entry at i==8 has a set of { D, A } and a self of D.
 *
 * ## Application
 *
 * We use this data structure when we compute per-line timings for the source view,
 * specifically for for compactly storing the set of line numbers per stack.
 *
 * Example stackTable:
 * - A [file.cpp:23]
 *   - B [file.cpp:45]
 *     - C [file.cpp:54]
 *       - B [file.cpp:45]
 *         - D [file.cpp:63]
 *
 * Here, the deepest stack node has self-line 63 and hits the lines { 23, 45, 54, 63 }.
 * Crucially, we only want to count 45 once!
 *
 * And we want to store only one index per stack, because the stackTable can
 * be extremely large. The SetCollectionTable lets us use a single index to
 * represent both the set of hit lines and the self line.
 *
 * For the above example, we would create the following SetCollectionTable<LineNumber>:
 *
 *      value  parent   represents set       self
 * -------------------------------------------------
 * 0:   23     null     { 23 }               23
 * 1:   45     0        { 23, 45 }           45
 * 2:   54     1        { 23, 45, 54 }       54
 * 3:   54     1        { 23, 45, 54 }       45
 * 4:   63     2        { 23, 45, 54, 63 }   63
 *
 * And then have stackIndexToLineSetIndex: [0, 1, 2, 3, 4].
 */
export type SetCollectionTable<T> = {
  parent: Array<IndexIntoSetCollectionTable | null>;
  value: Array<T>;
  self: Array<T>;
  length: number;
};

/**
 * Builds a SetCollectionTable via a series calls to `extend`.
 * The type T must have value equality semantics.
 *
 * ```
 * const builder = new SetCollectionBuilder<number>();
 * const set1 = builder.extend(null, 1);      // {1}
 * const set12 = builder.extend(set1, 2);     // {1,2}
 * const set123 = builder.extend(set12, 3);   // {1,2,3}
 * const table = builder.finish();
 *
 * table.value[set123] == 3
 * table.value[table.parent[set123]] == 2
 * table.value[table.parent[table.parent[set123]]] == 1
 * ```
 */
export class SetCollectionBuilder<T> {
  // These columns will become the table.
  _parentCol: Array<IndexIntoSetCollectionTable | null> = [];
  _valueCol: Array<T> = [];
  _selfCol: Array<T> = [];
  _length: number = 0;

  // These columns are only used while building the structure and
  // do not end up in the table.
  _headRoot: IndexIntoSetCollectionTable | null = null;
  _headChild: Array<IndexIntoSetCollectionTable | null> = [];
  _next: Array<IndexIntoSetCollectionTable | null> = [];
  _nextNonCanonical: Array<number | null> = [];
  _canonicalIndex: Array<number> = [];

  /**
   * Contains "canonical" and "non-canonical" nodes.
   * A canonical node is one which has value == self, a non-canonical node is one which has value != self.
   * Canonical nodes are connected to other canonical nodes via _next.
   * Canonical nodes also have a linked list of non-canonical nodes (_nextNonCanonical).
   * _nextNonCanonical, if non-null, always points to a node with the same value and same parent.
   * _canonicalIndex always points back at a canonical node with the same value and same parent.
   * Only canonical nodes have children.
   *
   *  builder
   *     │
   *     | headRoot
   *     ▼
   *     A  ────┐
   *     │      │ headChild
   *     │      ▼
   *     │      B ───┐
   *     │           │ headChild
   *     │           ▼              nextNC
   *     │           C ─────────────────────► C [self=B]
   *     │           │
   *     │           │ next
   *     │           ▼
   *     │ next      D
   *     │
   *     ▼
   *     D ────┐
   *           │ headChild
   *           ▼              nextNC
   *           A ─────────────────────► A [self=D]
   *            `───┐
   *                │ headChild
   *                ▼
   *                B
   *
   */

  /**
   * Returns the index for an entry that represents the pair (parentSet ∪ { self }, self)
   */
  extend(
    parent: IndexIntoSetCollectionTable | null,
    self: T
  ): IndexIntoSetCollectionTable {
    if (parent !== null) {
      if (this._selfCol[parent] === self) {
        return parent;
      }

      parent = this._canonicalIndex[parent];
    }

    const canonicalNode = this._getOrCreateCanonicalNode(parent, self);
    return this._getOrCreateNodeWithCorrectSelf(canonicalNode, self);
  }

  _getOrCreateCanonicalNode(
    parent: IndexIntoSetCollectionTable | null,
    value: T
  ): IndexIntoSetCollectionTable {
    if (parent !== null && this._doesSetAlreadyContainValue(parent, value)) {
      return parent;
    }

    return (
      this._findCanonicalSiblingWithValue(parent, value) ??
      this._createCanonicalNode(parent, value)
    );
  }

  _doesSetAlreadyContainValue(
    node: IndexIntoSetCollectionTable,
    value: T
  ): boolean {
    for (
      let ancestor: IndexIntoSetCollectionTable | null = node;
      ancestor !== null;
      ancestor = this._parentCol[ancestor]
    ) {
      if (this._valueCol[ancestor] === value) {
        return true;
      }
    }
    return false;
  }

  _findCanonicalSiblingWithValue(
    parent: IndexIntoSetCollectionTable | null,
    value: T
  ): IndexIntoSetCollectionTable | null {
    const head = parent !== null ? this._headChild[parent] : this._headRoot;
    for (
      let candidate: IndexIntoSetCollectionTable | null = head,
        prevCandidate: IndexIntoSetCollectionTable | null = null;
      candidate !== null;
      prevCandidate = candidate, candidate = this._next[candidate]
    ) {
      if (this._valueCol[candidate] === value) {
        // We found a matching node!
        // At this point we could just return it.
        //
        // However, to improve performance, we will reorder the linked list of canonical siblings
        // such that the most-recently used node is at the front. This has performance advantages
        // because the more frequently-used siblings will be more likely to be near the front
        // of the list, requiring fewer next-sibling hops.
        // Without LRU: https://share.firefox.dev/4rFbzwZ , with LRU: https://share.firefox.dev/4qmvPlR

        if (candidate !== head) {
          // Before: head -> ... -> prevCandidate -> candidate -> nextCandidate -> ...
          // After:  candidate -> head -> ... -> prevCandidate -> nextCandidate -> ...
          if (parent !== null) {
            this._headChild[parent] = candidate;
          } else {
            this._headRoot = candidate;
          }
          const nextCandidate = this._next[candidate];
          this._next[candidate] = head;
          if (prevCandidate !== null) {
            this._next[prevCandidate] = nextCandidate;
          }
        }

        return candidate;
      }
    }
    return null;
  }

  _getOrCreateNodeWithCorrectSelf(
    canonicalNode: IndexIntoSetCollectionTable,
    self: T
  ): IndexIntoSetCollectionTable {
    return (
      this._findNodeWithCorrectSelf(canonicalNode, self) ??
      this._createNonCanonicalNode(canonicalNode, self)
    );
  }

  _findNodeWithCorrectSelf(
    canonicalNode: IndexIntoSetCollectionTable,
    self: T
  ): IndexIntoSetCollectionTable | null {
    for (
      let candidate: IndexIntoSetCollectionTable | null = canonicalNode;
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
    parent: IndexIntoSetCollectionTable | null,
    value: T
  ): IndexIntoSetCollectionTable {
    const headSibling =
      parent !== null ? this._headChild[parent] : this._headRoot;

    const newNode = this._length++;
    this._parentCol[newNode] = parent;
    this._valueCol[newNode] = value;
    this._selfCol[newNode] = value;
    this._canonicalIndex[newNode] = newNode;
    this._nextNonCanonical[newNode] = null;
    this._headChild[newNode] = null;
    this._next[newNode] = headSibling;

    if (parent !== null) {
      this._headChild[parent] = newNode;
    } else {
      this._headRoot = newNode;
    }
    return newNode;
  }

  _createNonCanonicalNode(
    canonicalNode: IndexIntoSetCollectionTable,
    self: T
  ): IndexIntoSetCollectionTable {
    const newNode = this._length++;
    this._parentCol[newNode] = this._parentCol[canonicalNode];
    this._valueCol[newNode] = this._valueCol[canonicalNode];
    this._selfCol[newNode] = self;
    this._canonicalIndex[newNode] = canonicalNode;
    this._nextNonCanonical[newNode] = this._nextNonCanonical[canonicalNode];
    this._nextNonCanonical[canonicalNode] = newNode;
    this._headChild[newNode] = null;
    this._next[newNode] = null;
    return newNode;
  }

  finish(): SetCollectionTable<T> {
    return {
      parent: this._parentCol,
      self: this._selfCol,
      value: this._valueCol,
      length: this._length,
    };
  }
}
