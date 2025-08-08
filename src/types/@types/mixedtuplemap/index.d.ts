/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

declare module 'mixedtuplemap' {
  export class MixedTupleMap<K, V> {
    constructor();
    toString(): string;
    has(tuple: K): boolean;
    set(tuple: K, value: V): MixedTupleMap<K, V>;
    get(tuple: K): V;
    clear(): void;
  }

  export default MixedTupleMap;
}
