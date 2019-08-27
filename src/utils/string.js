/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * Takes a string and returns the string with public URLs removed.
 * It doesn't remove the URLs like `chrome://..` because they are internal URLs
 * and they shouldn't be removed.
 */
export function removeURLs(
  string: string,
  removeExtensions: boolean = true
): string {
  const rmExtensions = removeExtensions ? '|moz-extension:' : '';
  const regExp = new RegExp(
    '((?:https?:|ftp:|file:/?' + rmExtensions + ')//)[^\\s/$.?#][^\\s)]*',
    // ^                                             ^          ^
    // |                                             |          Matches any characters except
    // |                                             |          whitespaces and ')' character.
    // |                                             |          Other characters are allowed now
    // |                                             Matches any character except whitespace
    // |                                             and '/', '$', '.', '?' or '#' characters
    // |                                             because this is start of the URL
    // Matches 'http', 'https', 'ftp', 'file' and optionally 'moz-extension' protocols.
    // The colons are repeated here but it was necessary because file protocol can be either
    // 'file://' or 'file:///' and we need to check that inside the first group.
    'gi'
  );
  return string.replace(regExp, '$1<URL>');
}
