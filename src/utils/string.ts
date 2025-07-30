/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


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

  // Captures the protocol part (like "http://") in group 1
  const standardUrlPattern = `\\b((?:${protocols.join('|')})://)/?[^\\s/$.?#][^\\s)]*`;
  //                          ^  ^                              ^ ^          ^
  //                          |  |                              | |          Matches any characters except
  //                          |  |                              | |          whitespaces and ')' character.
  //                          |  |                              | Matches any character except whitespace
  //                          |  |                              | and '/', '$', '.', '?' or '#' characters
  //                          |  |                              | because this is start of the URL path/host
  //                          |  |                              Optional '/' after '://'
  //                          |  Captures the protocol and '://' part (Group 1)
  //                          Word boundary, ensures the protocol isn't part of a larger word.

  // Captures the base 'about:...' part (like "about:profiling") in group 2
  const aboutQueryPattern = `\\b(about:[^?#\\s]+)([?#])[^\\s)]*`;
  //                         ^  ^                ^     ^
  //                         |  |                |     Captures the query string:
  //                         |  |                |     Zero or more non-whitespace characters except ')'.
  //                         |  |                Matches the literal '?' or '#' as a saparator (Group 3)
  //                         |  Captures the base 'about:' URI (Group 2):
  //                         |  'about:' followed by one or more non-?, non-#, non-whitespace chars.
  //                         |
  //                         Word boundary, ensures the protocol isn't part of a larger word.

  return new RegExp(
    // Combine two patterns into one RegExp.
    `${standardUrlPattern}|${aboutQueryPattern}`,
    'gi'
  );
})();

/**
 * Takes a string and returns the string with public URLs removed.
 * It doesn't remove the URLs like `chrome://..` because they are internal URLs
 * and they shouldn't be removed.
 *
 * Additionally, for "about:*" URLs, only remove the query strings if they exist.
 */
export function removeURLs(
  string: string,
  redactedText: string = '<URL>',
  sanitizedQueryText: string = '<sanitized>'
): string {
  return string.replace(
    REMOVE_URLS_REGEXP,
    (match, protoGroup, aboutBaseGroup, separator) => {
      if (protoGroup) {
        // Matched a standard URL (http, https, ftp, file, etc.).
        // Replace everything after the protocol part
        return protoGroup + redactedText;
      } else if (aboutBaseGroup) {
        // Matched an `about:` URL with a query string.
        // Replace only the query string part (after '?')
        return aboutBaseGroup + separator + sanitizedQueryText;
      }
      return match;
    }
  );
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
