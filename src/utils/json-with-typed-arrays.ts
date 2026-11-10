/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * JSON.stringify an object which may contain typed arrays somewhere in
 * its structure (nested arbitrarily deeply), with those typed arrays
 * serialized as regular arrays of numbers.
 *
 * Calling JSON.stringify on a typed array would normally give you something
 * like `{"0": 1, "1": 2}` which is not what you want.
 *
 * This function does not mutate rootObject.
 */
export function jsonEncodeObjectWithTypedArraysAsRegularArrays(
  rootObject: unknown
): string {
  // We could use JSON.stringify with a "replacer" here.
  // But instead, we do a full traversal of the object first, possibly
  // creating new objects (so that the original doesn't get mutated),
  // and then a regular JSON.stringify with no replacer. This is 5x faster.
  return JSON.stringify(rewriteTypedArrays(rootObject));
}

function rewriteTypedArrays(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    // Found a typed array! Use Array.from to convert it to a regular
    // array of numbers.
    return Array.from(value as unknown as Iterable<number>);
  }
  if (Array.isArray(value)) {
    return rewriteTypedArraysInArray(value);
  }
  return rewriteTypedArraysInObject(value as Record<string, unknown>);
}

function rewriteTypedArraysInArray(arr: readonly unknown[]): unknown[] {
  let result: unknown[] | null = null;
  for (let i = 0; i < arr.length; i++) {
    const el = arr[i];
    // Inline fast-path for primitives: an array of 1000 numbers walks this
    // loop without any function call.
    if (el === null || typeof el !== 'object') {
      continue;
    }
    const replaced = rewriteTypedArrays(el);
    if (replaced !== el) {
      if (result === null) {
        result = arr.slice();
      }
      result[i] = replaced;
    }
  }
  return result ?? (arr as unknown[]);
}

function rewriteTypedArraysInObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  let result: Record<string, unknown> | null = null;
  for (const key in obj) {
    if (!Object.hasOwn(obj, key)) {
      continue;
    }
    const el = obj[key];
    if (el === null || typeof el !== 'object') {
      continue;
    }
    const replaced = rewriteTypedArrays(el);
    if (replaced !== el) {
      if (result === null) {
        result = { ...obj };
      }
      result[key] = replaced;
    }
  }
  return result ?? obj;
}
