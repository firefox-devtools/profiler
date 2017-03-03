import { uintArrayToString, stringToUintArray } from './uintarray-encoding';

export function parseCallTreeFilters(stringValue = '') {
  if (!stringValue) {
    return [];
  }
  return stringValue.split('~').map(s => {
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
  }).filter(f => f);
}

export function stringifyCallTreeFilters(arrayValue = []) {
  return arrayValue.map(filter => {
    switch (filter.type) {
      case 'prefix':
        return (filter.matchJSOnly ? 'prefixjs' : 'prefix') + '-' +
               uintArrayToString(filter.prefixFuncs);
      case 'postfix':
        return (filter.matchJSOnly ? 'postfixjs' : 'postfix') + '-' +
               uintArrayToString(filter.postfixFuncs);
      default:
        throw new Error('unknown filter type');
    }
  }).join('~');
}
