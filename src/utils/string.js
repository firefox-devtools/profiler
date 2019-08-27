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
  const regExpExtension = removeExtensions ? '|moz-extension' : '';
  const regExp = new RegExp(
    '((?:https?|ftp' + regExpExtension + ')://)[^\\s/$.?#][^\\s)]*',
    // ^                                       ^          ^
    // |                                       |          matches any characters except
    // |                                       |          whitespaces and ) character.
    // |                                       |          Other characters are allowed now
    // |                                       matches any characters except whitespaces
    // |                                       and / $ . ? # characters because this is
    // |                                       start of the URL
    // Matches http, https, ftp and optionally moz-extension protocols
    'gi'
  );
  return string.replace(regExp, '$1<URL>');
}
