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

export type MarkerSearchFieldMap = Map<
  string,
  {| positive: RegExp | null, negative: RegExp | null |},
>;

export type MarkerRegExps = $ReadOnly<{|
  generic: RegExp | null,
  fieldMap: MarkerSearchFieldMap,
|}>;

/**
 * Concatenate an array of strings into multiple RegExps that match on all
 * the marker strings which can include positive and negative field specific search.
 */
export const stringsToMarkerRegExps = (
  strings: string[] | null
): MarkerRegExps | null => {
  if (!strings || !strings.length) {
    return null;
  }

  // We create this map to group all the field specific search strings and then
  // we aggregate them to create a single regexp for each field later.
  const fieldStrings: Map<
    string,
    {| positive: string[], negative: string[] |},
  > = new Map();
  // These are the non-field specific search strings. They have to be positive
  // as we don't support negative generic filtering.
  const genericPositiveStrings = [];
  for (const string of strings) {
    // First capture group is used to determine if it has a "-" in front of the
    // field to understand if it's a negative filter.
    // Second capture group is used to get the field name.
    // Third capture group is to get the filter value.
    const prefixMatch = string.match(
      /^(?<maybeNegative>-?)(?<key>\w+):(?<value>.+)/i
    );
    if (prefixMatch && prefixMatch.groups) {
      // This is a key-value pair that will only be matched for a specific field.
      const { maybeNegative, value } = prefixMatch.groups;
      const key = prefixMatch.groups.key.toLowerCase();
      let fieldStrs = fieldStrings.get(key);
      if (!fieldStrs) {
        fieldStrs = { positive: [], negative: [] };
        fieldStrings.set(key, fieldStrs);
      }

      // First capture group checks if we have "-" in front of the string to see
      // if it's a negative filtering.
      if (maybeNegative.length === 0) {
        fieldStrs.positive.push(value);
      } else {
        fieldStrs.negative.push(value);
      }
    } else {
      genericPositiveStrings.push(string);
    }
  }

  // Now we constructed the grouped arrays. Let's convert them into a map of RegExps.
  const fieldMap: MarkerSearchFieldMap = new Map();
  for (const [field, strings] of fieldStrings) {
    fieldMap.set(field, {
      positive: stringsToRegExp(strings.positive),
      negative: stringsToRegExp(strings.negative),
    });
  }

  return {
    generic: stringsToRegExp(genericPositiveStrings),
    fieldMap,
  };
};
