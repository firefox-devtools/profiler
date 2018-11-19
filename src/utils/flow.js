/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { TabSlug } from '../app-logic/tabs-handling';
import type { TransformType } from '../types/transforms';

/**
 * This file contains utils that help Flow understand things better. Occasionally
 * statements can be logically equivalent, but Flow infers them in a specific way. Most
 * of the time tweaks can be done by editing the type system, but occasionally functions
 * are needed to get the desired result.
 */

/**
 * This function can be run as the default arm of a switch statement to ensure exhaustive
 * checking of a given type. It relies on an assumption that all cases will be handled
 * and the input to the function will be empty. This function hopefully makes that check
 * more readable.
 */
export function assertExhaustiveCheck(
  notValid: empty,
  errorMessage: string = `There was an unhandled case for the value: "${notValid}"`
): void {
  throw new Error(errorMessage);
}

/**
 * Immutably update an object through Object.assign, but retain the original
 * type information of the object. Flow will occasionally throw errors when
 * inferring what is going on with Object.assign.
 */
export function immutableUpdate<T: Object>(object: T, ...rest: Object[]): T {
  return Object.assign({}, object, ...rest);
}

/**
 * This function takes a string and returns either a valid TabSlug or null, this doesn't
 * throw an error so that any arbitrary string can be converted, e.g. from a URL.
 */
export function toValidTabSlug(tabSlug: any): TabSlug | null {
  const coercedTabSlug = (tabSlug: TabSlug);
  switch (coercedTabSlug) {
    case 'calltree':
    case 'stack-chart':
    case 'marker-chart':
    case 'network-chart':
    case 'marker-table':
    case 'flame-graph':
      return coercedTabSlug;
    default: {
      // The coerced type SHOULD be empty here. If in reality we get
      // here, then it's not a valid transform type, so return null.
      (coercedTabSlug: empty);
      return null;
    }
  }
}

/**
 * This function will take an arbitrary string, and will turn it into a TabSlug
 * it will throw an error if an invalid type was passed to it.
 */
export function ensureIsValidTabSlug(type: string): TabSlug {
  const assertedType = toValidTabSlug(type);
  if (!assertedType) {
    throw new Error(
      `Attempted to assert that "${type}" is a valid TransformType, and it was not.`
    );
  }
  return assertedType;
}

/**
 * This function will take an arbitrary string, and try to convert it to a valid
 * TransformType.
 */
export function convertToTransformType(type: string): TransformType | null {
  // Coerce this into a TransformType even if it's not one.
  const coercedType = ((type: any): TransformType);
  switch (coercedType) {
    // Exhaustively check each TransformType. The default arm will assert that
    // we have been exhaustive.
    case 'merge-call-node':
    case 'merge-function':
    case 'focus-subtree':
    case 'focus-function':
    case 'collapse-resource':
    case 'collapse-direct-recursion':
    case 'collapse-function-subtree':
    case 'drop-function':
      return coercedType;
    default: {
      // The coerced type SHOULD be empty here. If in reality we get
      // here, then it's not a valid transform type, so return null.
      (coercedType: empty);
      return null;
    }
  }
}

/**
 * This is a type-friendly version of Object.values that assumes the object has
 * a Map-like structure.
 */
export function objectValues<Value, Obj: {| [string]: Value |}>(
  object: Obj
): Value[] {
  return (Object.values: Function)(object);
}

/**
 * This is a type-friendly version of Object.entries that assumes the object has
 * a Map-like structure.
 */
export function objectEntries<Value, Obj: {| [string]: Value |}>(
  object: Obj
): Array<[string, Value]> {
  return (Object.entries: Function)(object);
}

export function getObjectValuesAsUnion<T: Object>(obj: T): Array<$Values<T>> {
  return Object.values(obj);
}

/**
 * This function will take an arbitrary string, and will turn it into a TransformType
 * it will throw an error if an invalid type was passed to it.
 */
export function ensureIsTransformType(type: string): TransformType {
  const assertedType = convertToTransformType(type);
  if (!assertedType) {
    throw new Error(
      `Attempted to assert that "${type}" is a valid TransformType, and it was not.`
    );
  }
  return assertedType;
}

export function ensureExists<T>(item: ?T, message: ?string): T {
  if (item === null) {
    throw new Error(message || 'Expected an item to exist, and it was null.');
  }
  if (item === undefined) {
    throw new Error(
      message || 'Expected an item to exist, and it was undefined.'
    );
  }
  return item;
}

/**
 * Flow doesn't want us to access potentitally non-existent properties on unions of
 * of objects. This function creates a safe interface to access number properties
 * if they might exist.
 */
export function getNumberPropertyOrNull<T: Object>(
  data: T,
  property: string
): number | null {
  const maybeNumber = (data: Object)[property];
  return typeof maybeNumber === 'number' ? maybeNumber : null;
}
