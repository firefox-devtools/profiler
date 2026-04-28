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
    const hostname = parsedUrl.hostname;
    if (localhostHostnames.includes(hostname)) {
      return true;
    }
    // LAN addresses: 10.x.x.x, 172.16.x.x-172.31.x.x, 192.168.x.x
    if (
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      /^192\.168\./.test(hostname)
    ) {
      return true;
    }
    // .local domains or hostnames without dots
    if (hostname.endsWith('.local') || !hostname.includes('.')) {
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * Escape a URL string so it can be safely embedded inside a double-quoted CSS
 * url("...").
 */
export function escapeCssUrl(url: string): string {
  return url
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\A ')
    .replace(/\r/g, '');
}
