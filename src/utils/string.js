/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

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
