/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import escapeStringRegexp from 'escape-string-regexp';

// Initializing this RegExp outside of removeURLs because that function is in a
// hot path during sanitization and it's good to avoid the initialization of the
// RegExp which is costly.
const REMOVE_URLS_REGEXP = (function () {
  const protocols = [
    'http',
    'https',
    'ftp',
    'file',
    'moz-extension',
    'moz-page-thumb',
  ];

  return new RegExp(
    `\\b((?:${protocols.join('|')})://)/?[^\\s/$.?#][^\\s)]*`,
    //    ^                              ^          ^
    //    |                              |          Matches any characters except
    //    |                              |          whitespaces and ')' character.
    //    |                              |          Other characters are allowed now
    //    |                              Matches any character except whitespace
    //    |                              and '/', '$', '.', '?' or '#' characters
    //    |                              because this is start of the URL
    //    Matches URL schemes we need to sanitize.
    'gi'
  );
})();

/**
 * Takes a string and returns the string with public URLs removed.
 * It doesn't remove the URLs like `chrome://..` because they are internal URLs
 * and they shouldn't be removed.
 */
export function removeURLs(
  string: string,
  redactedText: string = '<URL>'
): string {
  return string.replace(REMOVE_URLS_REGEXP, '$1' + redactedText);
}

/**
 * Take an absolute file path string and sanitize it except the last file name segment.
 *
 * Note: Do not use this function if the string not only contains a file path but
 * also contains more text. This function is intended to use only for path strings.
 */
export function removeFilePath(
  filePath: string,
  redactedText: string = '<PATH>'
): string {
  let pathSeparator = null;

  // Figure out which separator the path uses and the last separator index.
  let lastSeparatorIndex = filePath.lastIndexOf('/');
  if (lastSeparatorIndex !== -1) {
    // This is a Unix-like path.
    pathSeparator = '/';
  } else {
    lastSeparatorIndex = filePath.lastIndexOf('\\');
    if (lastSeparatorIndex !== -1) {
      // This is a Windows path.
      pathSeparator = '\\';
    }
  }

  if (pathSeparator === null) {
    // There is no path separator, which means it's either not a file path or empty.
    return filePath;
  }

  return redactedText + pathSeparator + filePath.slice(lastSeparatorIndex + 1);
}

/**
 * Divide a search string into several parts by splitting on comma.
 */
export const splitSearchString = (searchString: string): string[] | null => {
  if (!searchString) {
    return null;
  }
  const result = searchString
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part);

  if (result.length) {
    return result;
  }

  return null;
};

/**
 * Concatenate an array of strings into a RegExp that matches on all
 * the strings.
 */
export const stringsToRegExp = (strings: string[] | null): RegExp | null => {
  if (!strings || !strings.length) {
    return null;
  }

  const regexpStr = strings.map(escapeStringRegexp).join('|');
  return new RegExp(regexpStr, 'gi');
};

export type MarkerRegExps = {
  generic: RegExp | null,
  fieldMap: Map<string, RegExp>,
};

/**
 * Concatenate an array of strings into a RegExp that matches on all
 * the strings.
 */
export const stringsToMarkerRegExps = (
  strings: string[] | null
): MarkerRegExps | null => {
  if (!strings || !strings.length) {
    return null;
  }

  const fieldStrings = new Map();
  const genericStrings = [];
  for (const string of strings) {
    const prefixMatch = string.match(/^([a-z0-1]+):(.+)/i);
    if (prefixMatch) {
      // This is a key-value pair that will only be matched for a specific field.
      let fieldStrs = fieldStrings.get(prefixMatch[1]);
      if (!fieldStrs) {
        fieldStrs = [];
        fieldStrings.set(prefixMatch[1], fieldStrs);
      }
      fieldStrs.push(prefixMatch[2]);
    } else {
      genericStrings.push(string);
    }
  }

  const fieldMap = new Map();
  for (const [field, strings] of fieldStrings) {
    fieldMap.set(field, new RegExp(strings.join('|'), 'gi'));
  }

  return {
    generic:
      genericStrings.length > 0
        ? new RegExp(genericStrings.join('|'), 'gi')
        : null,
    fieldMap,
  };
};
