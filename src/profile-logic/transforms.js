/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  uintArrayToString,
  stringToUintArray,
} from '../utils/uintarray-encoding';
import { toValidImplementationFilter } from './profile-data';

import type { Thread } from '../types/profile';
import type { Transform, TransformStack } from '../types/transforms';

/**
 * Map each transform key into a short representation.
 */
const TRANSFORM_TO_SHORT_KEY = {
  'focus-subtree': 'f',
  'merge-subtree': 'ms',
  'merge-call-node': 'mcn',
};

const SHORT_KEY_TO_TRANSFORM = {
  f: 'focus-subtree',
  ms: 'merge-subtree',
  mcn: 'merge-call-node',
};

/**
 * Every transform is separated by the "~" character.
 * Each transform is made up of a tuple separated by "-"
 * The first value in the tuple is a short key of the transform type.
 *
 * e.g "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
 */
export function parseTransforms(stringValue: string = '') {
  return stringValue
    .split('~')
    .map(s => {
      const tuple = s.split('-');
      const shortKey = tuple[0];
      const type = SHORT_KEY_TO_TRANSFORM[shortKey];

      if (!type) {
        console.error('Unrecognized transform was passed to the URL.');
        return undefined;
      }

      // e.g. "f-js-xFFpUMl-i" or "f-cpp-0KV4KV5KV61KV7KV8K"
      const [, implementation, serializedCallNodePath, inverted] = tuple;
      const transform = {
        type,
        implementation: toValidImplementationFilter(implementation),
        callNodePath: stringToUintArray(serializedCallNodePath),
        inverted: Boolean(inverted),
      };
      return transform;
    })
    .filter(f => f);
}

export function stringifyTransforms(transforms: TransformStack = []): string {
  return transforms
    .map(transform => {
      let string = [
        TRANSFORM_TO_SHORT_KEY[transform.type],
        transform.implementation,
        uintArrayToString(transform.callNodePath),
      ].join('-');
      if (transform.inverted) {
        string += '-i';
      }
      return string;
    })
    .join('~');
}

export function getTransformLabels(
  thread: Thread,
  threadName: string,
  transforms: Transform[]
) {
  const { funcTable, stringTable } = thread;
  const labels = transforms.map(transform => {
    function lastFuncString(callNodePath) {
      const lastFunc = callNodePath[callNodePath.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }

    const funcName = lastFuncString(transform.callNodePath);

    switch (transform.type) {
      case 'focus-subtree':
        return `Focus: ${funcName}`;
      case 'merge-subtree':
        return `Merge Subtree: ${funcName}`;
      case 'merge-call-node':
        return `Merge: ${funcName}`;
      default:
        throw new Error('Unexpected transform type');
    }
  });
  labels.unshift(`Complete "${threadName}"`);
  return labels;
}
