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
import type {
  Transform,
  TransformStack,
  FocusSubtreeTransform,
} from '../types/transforms';

/**
 * Map each transform key into a short representation.
 */
const TRANSFORM_SHORT_KEY = {
  'focus-subtree': 'f',
};

/**
 * Every transform is separated by the "~" character.
 * Each transform is made up of a tuple separated by "-"
 * The first value in the tuple is a short key of the transform type.
 *
 * e.g "prefix-0KV4KV5KV61KV7KV8K~postfixjs-xFFpUMl"
 */
export function parseTransforms(stringValue: string = '') {
  return stringValue
    .split('~')
    .map(s => {
      const tuple = s.split('-');
      const type = tuple[0];
      switch (type) {
        case TRANSFORM_SHORT_KEY['focus-subtree']: {
          // e.g. "fs-js-xFFpUMl-i" or "fs-cpp-0KV4KV5KV61KV7KV8K"
          const [, implementation, serializedCallNodePath, inverted] = tuple;
          const transform: FocusSubtreeTransform = {
            type: 'focus-subtree',
            implementation: toValidImplementationFilter(implementation),
            callNodePath: stringToUintArray(serializedCallNodePath),
            inverted: Boolean(inverted),
          };
          return transform;
        }
        default:
          // Do a soft notification that a transform wasn't matched.
          console.error('Unrecognized transform was passed to the URL.');
          return undefined;
      }
    })
    .filter(f => f);
}

export function stringifyTransforms(transforms: TransformStack = []): string {
  return transforms
    .map(transform => {
      switch (transform.type) {
        case 'focus-subtree': {
          let string = [
            TRANSFORM_SHORT_KEY['focus-subtree'],
            transform.implementation,
            uintArrayToString(transform.callNodePath),
          ].join('-');
          if (transform.inverted) {
            string += '-i';
          }
          return string;
        }
        default:
          throw new Error('unknown filter type');
      }
    })
    .join('~');
}

export function getTransformLabels(
  thread: Thread,
  threadName: string,
  focusSubtreeTransforms: Transform[]
) {
  const { funcTable, stringTable } = thread;
  const labels = focusSubtreeTransforms.map(transform => {
    function lastFuncString(callNodePath) {
      const lastFunc = callNodePath[callNodePath.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }
    switch (transform.type) {
      case 'focus-subtree':
        return lastFuncString(transform.callNodePath);
      default:
        throw new Error('Unexpected transform type');
    }
  });
  labels.unshift(`Complete "${threadName}"`);
  return labels;
}
