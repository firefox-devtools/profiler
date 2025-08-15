/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

declare module 'namedtuplemap' {
  class NamedTupleMap<K, V> {
    constructor(options?: { limit?: number });
    has(key: K): boolean;
    get(key: K): V | undefined;
    set(key: K, value: V): NamedTupleMap<K, V>;
    clear(): void;
  }

  export default NamedTupleMap;
}
