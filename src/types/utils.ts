/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This type serves as documentation for how an array is meant to be used, but does
 * not support type checking. We often use an Array instead of a Map to translate
 * one type of index into another type of index. This is similar to how we use the
 * Map<K,V> type, but with the Array.
 */
export type IndexedArray<_IndexType, Value> = Array<Value>;

export type MixedObject = { [key: string]: unknown };
