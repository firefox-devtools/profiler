/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { CallNodePath } from '../types/profile-derived';

export function arePathsEqual(a: CallNodePath, b: CallNodePath): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  // Iterating from the end because this will likely fail faster
  for (let i = a.length - 1; i >= 0; i--) {
    if (a[i] !== b[i]) {
      return false;
    }
  }

  return true;
}

// We take the easy path by converting the path to a string that will be unique.
// In the future and if necessary we might want to have an integer-based hash so
// that it's faster. In that case we might want to use only the n last values
// that should be more discriminate and keep it fast.
export function hashPath(a: CallNodePath): string {
  return a.join('-');
}

export class PathSet implements Iterable<CallNodePath> {
  _table: Map<string, CallNodePath>;

  constructor(iterable?: Iterable<CallNodePath>) {
    if (iterable instanceof PathSet) {
      // This shortcut avoids the call to `hashPath` by taking advantage of
      // knowing some inner workings.
      this._table = new Map(iterable._table);
      return;
    }

    this._table = new Map();

    if (!iterable) {
      return;
    }

    for (const path of iterable) {
      this._table.set(hashPath(path), path);
    }
  }

  add(path: CallNodePath) {
    this._table.set(hashPath(path), path);
    return this;
  }

  clear() {
    this._table.clear();
  }

  delete(path: CallNodePath) {
    return this._table.delete(hashPath(path));
  }

  *values(): Iterator<CallNodePath> {
    yield* this._table.values();
  }

  *entries(): Iterator<[CallNodePath, CallNodePath]> {
    for (const entry of this) {
      yield [entry, entry];
    }
  }

  forEach(func: (CallNodePath, CallNodePath, PathSet) => void, thisArg?: any) {
    for (const entry of this) {
      func.call(thisArg, entry, entry, this);
    }
  }

  has(path: CallNodePath): boolean {
    return this._table.has(hashPath(path));
  }

  get size(): number {
    return this._table.size;
  }

  // https://github.com/facebook/flow/issues/3258
  // $FlowFixMe
  *[Symbol.iterator]() {
    yield* this._table.values();
  }

  // This is a hack for Flow's Iterable support,
  // see https://stackoverflow.com/questions/48491307/iterable-class-in-flow
  /*::
  @@iterator(): * {
    // $FlowFixMe
    return this[Symbol.iterator]()
  }
  */
}
