/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  uintArrayToString,
  stringToUintArray,
} from '../utils/uintarray-encoding';

export function parseCallTreeFilters(stringValue = '') {
  if (!stringValue) {
    return [];
  }
  return stringValue
    .split('~')
    .map(s => {
      const [type, val] = s.split('-');
      switch (type) {
        case 'prefix':
          return {
            type: 'prefix',
            matchJSOnly: false,
            prefixFuncs: stringToUintArray(val),
          };
        case 'prefixjs':
          return {
            type: 'prefix',
            matchJSOnly: true,
            prefixFuncs: stringToUintArray(val),
          };
        case 'postfix':
          return {
            type: 'postfix',
            matchJSOnly: false,
            postfixFuncs: stringToUintArray(val),
          };
        case 'postfixjs':
          return {
            type: 'postfix',
            matchJSOnly: true,
            postfixFuncs: stringToUintArray(val),
          };
        default:
          return undefined;
      }
    })
    .filter(f => f);
}

export function stringifyCallTreeFilters(arrayValue = []) {
  return arrayValue
    .map(filter => {
      switch (filter.type) {
        case 'prefix':
          return (
            (filter.matchJSOnly ? 'prefixjs' : 'prefix') +
            '-' +
            uintArrayToString(filter.prefixFuncs)
          );
        case 'postfix':
          return (
            (filter.matchJSOnly ? 'postfixjs' : 'postfix') +
            '-' +
            uintArrayToString(filter.postfixFuncs)
          );
        default:
          throw new Error('unknown filter type');
      }
    })
    .join('~');
}

export function getCallTreeFilterLabels(thread, threadName, callTreeFilters) {
  const { funcTable, stringTable } = thread;
  const labels = callTreeFilters.map(filter => {
    function lastFuncString(callNodePath) {
      const lastFunc = callNodePath[callNodePath.length - 1];
      const nameIndex = funcTable.name[lastFunc];
      return stringTable.getString(nameIndex);
    }
    switch (filter.type) {
      case 'prefix':
        return lastFuncString(filter.prefixFuncs);
      case 'postfix':
        return lastFuncString(filter.postfixFuncs);
      default:
        throw new Error('Unexpected filter type');
    }
  });
  labels.unshift(`Complete "${threadName}"`);
  return labels;
}
