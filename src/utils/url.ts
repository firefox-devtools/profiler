/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const localhostHostnames: readonly string[] = [
  'localhost',
  '127.0.0.1',
  '[::1]',
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
    // IPv4 ranges:
    if (
      /^127\./.test(hostname) || // Loopback 127.0.0.0/8
      /^10\./.test(hostname) || // Private 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) || // Private 172.16.0.0/12
      /^192\.168\./.test(hostname) || // Private 192.168.0.0/16
      /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(hostname) || // CGNAT 100.64.0.0/10
      /^169\.254\./.test(hostname) || // Link-local 169.254.0.0/16
      /^198\.(1[8-9])\./.test(hostname) // Benchmark 198.18.0.0/15
    ) {
      return true;
    }
    // IPv6 local addresses:
    // [fe80::...] (Link-local)
    // [fc00::...] or [fd00::...] (Unique Local Address)
    if (
      hostname.startsWith('[fe80:') ||
      hostname.startsWith('[fc00:') ||
      hostname.startsWith('[fd00:')
    ) {
      return true;
    }
    if (isLocalHostName(hostname)) {
      return true;
    }
    return false;
  } catch (_e) {
    return false;
  }
}

/**
 * http://hostname => true
 * https://hostname => true
 * http://hostname:8080 => true
 * https://hostname.local => true
 * http://hostname.local:8080 => true
 * http://xxx.com=> false
 * http://xxx.com:8080 => false
 * http://1.1.1.1=> false
 * http://1.1.1.1:8080 => false
 * http://[::1]=> false
 * http://[::1]:8080 => false
 */
function isLocalHostName(hostname: string): boolean {
  if (!hostname) {
    return false;
  }

  // IPv6 literals are bracketed when parsed from a URL, and IPv4 literals are
  // dot-delimited numeric segments. Neither should be treated as local
  // hostnames here; those cases are handled separately in isLocalURL.
  if (hostname.startsWith('[') || /^\d+(?:\.\d+){3}$/.test(hostname)) {
    return false;
  }

  return hostname.endsWith('.local') || !hostname.includes('.');
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
