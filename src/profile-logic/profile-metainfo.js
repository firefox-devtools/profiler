/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This extracts the version number out of the 'misc' value we have in the
// profile.
// The 'misc' value looks like `rv:<version>`, we want to return the version.
// The function uses a permissive regexp to support more use cases (like having
// the version directly without the prefix `rv:`). Also we remove the `.0` at
// the end of the version if present because this gives no added value.
export function formatVersionNumber(version?: string): string {
  if (version) {
    const regex = /[\d.]+$/; // Matches any group of number and dots at the end of the string.
    const match = regex.exec(version);
    if (match) {
      return match[0];
    }
  }
  return '';
}

// This removes the ending `.0` in version strings, if present.
function removeUselessEndZeroInVersion(version: string): string {
  if (version.endsWith('.0')) {
    // Remove useless `.0` at the end of Firefox versions.
    return version.slice(0, -2);
  }
  return version;
}

// This returns a string to identify the product and its version out of the meta
// information, eg `Firefox 77` of `Firefox Preview 78`.
export function formatProductAndVersion(meta: {
  +product: string,
  +misc?: string,
}): string {
  const product = meta.product || '';
  const version = removeUselessEndZeroInVersion(formatVersionNumber(meta.misc));

  return product + (version ? ' ' + version : '');
}

export function formatPlatform(meta: {
  +platform?: string,
  +oscpu?: string,
  +toolkit?: string,
}): string {
  switch (meta.toolkit) {
    case 'android':
      // Typically `platform` contains 'Android <version>'.
      // `oscpu` contains the same thing as a normal Linux so this isn't
      // interesting in this case.
      return meta.platform
        ? removeUselessEndZeroInVersion(meta.platform)
        : 'Android';
    case 'cocoa':
      // Typically `oscpu` contains 'Intel Mac OS X <version>'.
      // We're doing the replacement in 2 steps just in case we get `macOS`
      // already in the string in the future.
      return meta.oscpu
        ? meta.oscpu.replace(/^Intel /, '').replace(/^Mac OS X/, 'macOS')
        : 'macOS';
    case 'windows': {
      // Typically `oscpu` contains 'Windows NT 10.0; Win64; x64'
      // This oddly looking regexp removes everything after (and including) the
      // first semicolon.
      return meta.oscpu
        ? removeUselessEndZeroInVersion(
            meta.oscpu.replace(/;.*$/, '').replace(/ NT/, '')
          )
        : 'Windows';
    }
    case 'gtk':
      // Typically `oscpu` contains 'Linux x86_64'.
      // We slice instead of always returning Linux for other Unixes. But we
      // haven't really tried them.
      return meta.oscpu
        ? meta.oscpu.slice(0, meta.oscpu.indexOf(' '))
        : 'Linux';
    default:
      return meta.oscpu || '';
  }
}
