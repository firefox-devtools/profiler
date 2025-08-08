/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Returns set1 ∩ set2, i.e. a new set which contains the elements which are
// present in both set1 and set2.
export function intersectSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set(Array.from(set1).filter((x) => set2.has(x)));
}

// Returns set1 ∖ set2, i.e. a new set  which contains the elements which are
// in set1 but not in set2.
export function subtractSets<T>(set1: Set<T>, set2: Set<T>): Set<T> {
  return new Set(Array.from(set1).filter((x) => !set2.has(x)));
}
