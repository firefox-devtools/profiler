/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function assertSetContainsOnly<T>(set: Iterable<T>, expected: Array<T>) {
  const array = Array.from(set);

  expect(array).toHaveLength(expected.length);
  // Because expect.arrayContaining expects Array<mixed>, Flow doesn't accept
  // this Array<T>. Hence disabling Flow check with `any`.
  expect(array).toEqual(expect.arrayContaining((expected as any)));
}
