/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// TypeScript types

export type ExtractReturnType<V> = (...args: any[]) => V;

/**
 * This type serves as documentation for how an array is meant to be used, but does
 * not support type checking. We often use an Array instead of a Map to translate
 * one type of index into another type of index. This is similar to how we use the
 * Map<K,V> type, but with the Array.
 */
export type IndexedArray<_IndexType, Value> = Array<Value>;

/**
 * This is a utility type that extracts the return type of a function.
 */
export type $ReturnType<Fn extends (...args: any[]) => any> = ReturnType<Fn>;

/**
 * This type was used in Flow because as an equivalent to {[string]: T} for an
 * object created without a prototype, e.g. Object.create(null).
 *
 * It can probably be removed.
 */
export type ObjectMap<T> = {
  [key: string]: T;
};

export type MixedObject = { [key: string]: unknown };
