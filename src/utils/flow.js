/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * This file contains utils that help Flow understand things better. Occasionally
 * statements can be logically equivalent, but Flow infers them in a specific way. Most
 * of the time tweaks can be done by editing the type system, but occasionally functions
 * are needed to get the desired result.
 */

/**
 * This function can be run as the default arm of a switch statement to ensure exhaustive
 * checking of a given type. It relies on an assumption that a given case will not be
 * the string 'Error: non exhaustive switch found.' This assumption generates more
 * readable errors. Flow will only generate an error if it's possible to get there
 * within the type system.
 */
export function unexpectedCase(notValid: empty): void {
  throw new Error(`Unexpected case ${notValid}`);
}

/**
 * Immutably update an object through Object.assign, but retain the original
 * type information of the object. Flow will occasionally throw errors when
 * inferring what is going on with Object.assign.
 */
export function immutableUpdate<T: Object>(object: T, ...rest: Object[]): T {
  return Object.assign({}, object, ...rest);
}
