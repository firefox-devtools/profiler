/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/*
 * A not-void type
 * https://flow.org/try/#0C4TwDgpgBAcg9sAanAlgEygXigKClAHygDsBXAWwCMIAnPQqAZ2BpWIHN6jK44AbCAENiXEqT59RAQRo1BIADzCQAPlEB5SgCsIAY2ABuHDgBmpYvpRxiUMxYUAVAFywEydCoAUAN0F9SEC4OAJRBUADe9DQQwKQ0Nr7+EEYAvsZ2up4AjMFGGZ4ARMysHAW5puaZ4ba8LgDklII0dVAp5flkEu2VngDaWQA0UABMALrdFp7maBAmbBBoE5nlQA
 */
export type NotVoidOrNull = number | string | boolean | Array<any> | Object;

export type ExtractReturnType = <V>((...args: any[]) => V) => V;

/**
 * This type serves as documentation for how an array is meant to be used, but does
 * not support type checking. We often use an Array instead of a Map to translate
 * one type of index into another type of index. This is similar to how we use the
 * Map<K,V> type, but with the Array.
 */
// eslint-disable-next-line no-unused-vars
export type IndexedArray<_IndexType, Value> = Array<Value>;

/**
 * This is a utility type that extracts the return type of a function.
 */
export type $ReturnType<Fn> = $Call<ExtractReturnType, Fn>;
