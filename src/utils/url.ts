/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const localhostHostnames: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '::1',
];

// Used to determine if a URL (usually one that's provided a profile)
// is local, and therefore likely to have gone away, meaning we should
// be careful offering tools to the user that refresh the page or
// otherwise lose state, as refetching that state may not work.
export function isLocalURL(url: string | URL): boolean {
  try {
    const parsedUrl = url instanceof URL ? url : new URL(url);
    return localhostHostnames.includes(parsedUrl.hostname);
  } catch (_e) {
    return false;
  }
}
