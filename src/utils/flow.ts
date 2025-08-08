/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { TabSlug } from '../app-logic/tabs-handling';
import type { TransformType } from 'firefox-profiler/types';

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
  notValid: never,
  errorMessage: string = `There was an unhandled case for the value: "${notValid}"`
): void {
  throw new Error(errorMessage);
}

/**
 * Immutably update an object through Object.assign, but retain the original
 * type information of the object. Flow will occasionally throw errors when
 * inferring what is going on with Object.assign.
 */
export function immutableUpdate<T>(object: T, ...rest: any[]): T {
  return Object.assign({}, object, ...rest);
}

/**
 * This function takes a string and returns either a valid TabSlug or null, this doesn't
 * throw an error so that any arbitrary string can be converted, e.g. from a URL.
 */
export function toValidTabSlug(tabSlug: any): TabSlug | null {
  const coercedTabSlug = tabSlug as TabSlug;
  switch (coercedTabSlug) {
    case 'calltree':
    case 'stack-chart':
    case 'marker-chart':
    case 'network-chart':
    case 'marker-table':
    case 'flame-graph':
    case 'js-tracer':
      return coercedTabSlug;
    default: {
      // The coerced type SHOULD be empty here. If in reality we get
      // here, then it's not a valid transform type, so return null.
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
  const coercedType = type as TransformType;
  switch (coercedType) {
    // Exhaustively check each TransformType. The default arm will assert that
    // we have been exhaustive.
    case 'merge-call-node':
    case 'merge-function':
    case 'focus-subtree':
    case 'focus-function':
    case 'focus-category':
    case 'collapse-resource':
    case 'collapse-direct-recursion':
    case 'collapse-recursion':
    case 'collapse-function-subtree':
    case 'drop-function':
    case 'filter-samples':
      return coercedType;
    default: {
      // The coerced type SHOULD be empty here. If in reality we get
      // here, then it's not a valid transform type, so return null.
      return null;
    }
  }
}

/**
 * This function coerces one type into another type.
 * This is equivalent to: (((value: A): any): B)
 */
export function coerce<A, B>(item: A): B {
  return item as any;
}

/**
 * It can be helpful to coerce one type that matches the shape of another.
 */
export function coerceMatchingShape<T>(item: Partial<T>): T {
  return item as any;
}

/**
 * This is a type-friendly version of Object.values that assumes the object has
 * a Map-like structure.
 */
export function objectValues<Value, Obj extends Record<string, Value>>(
  object: Obj
): Value[] {
  return Object.values(object) as any;
}

/**
 * This is a type-friendly version of Object.entries that assumes the object has
 * a Map-like structure.
 */
export function objectEntries<Key extends string, Value>(object: {
  [K in Key]: Value;
}): Array<[Key, Value]> {
  return Object.entries(object) as any;
}

/**
 * This is a type-friendly version of Object.entries that assumes the object has
 * a Map-like structure.
 */
export function objectMap<Return, Key extends string, Value>(
  object: { [K in Key]: Value },
  fn: (value: Value, key: Key) => Return
): { [K in Key]: Return } {
  const result: { [K in Key]: Return } = {} as any;
  for (const [key, value] of objectEntries(object)) {
    result[key] = fn(value, key);
  }
  return result;
}

export function getObjectValuesAsUnion<T extends Record<string, any>>(
  obj: T
): Array<T[keyof T]> {
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

export function ensureExists<T>(
  item: T | null | undefined,
  message?: string
): T {
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
 * Returns the first item from Set in a type friendly manner.
 */
export function getFirstItemFromSet<T>(set: Set<T>): T | undefined {
  return set.values().next().value;
}
