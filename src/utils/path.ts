/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { CallNodePath, IndexIntoFuncTable } from 'firefox-profiler/types';

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
// This is _quite_ costly because converting numbers to strings is costly.
// But this is counter-balanced by the fact that this hash function is perfect:
// it's a bijection. This avoids the need of buckets in the Set and Map
// implementations which is a lot faster.
export function hashPath(a: CallNodePath): string {
  return a.join('-');
}

export function concatHash(
  hash: string,
  extraFunc: IndexIntoFuncTable
): string {
  return hash + '-' + extraFunc;
}

export function hashPathSingleFunc(func: IndexIntoFuncTable): string {
  return '' + func;
}

// This class implements all of the methods of the native Set, but provides a
// unique list of CallNodePaths. These paths can be different objects, but as
// long as they contain the same data, they are considered to be the same.
// These CallNodePaths are keyed off of the string value returned by the
// `hashPath` function above.
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

  forEach(func: (value: CallNodePath, value2: CallNodePath, set: PathSet) => void, thisArg?: any) {
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

  *[Symbol.iterator]() {
    yield* this._table.values();
  }
}