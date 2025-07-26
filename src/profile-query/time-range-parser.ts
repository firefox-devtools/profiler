/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { StartEndRange } from 'firefox-profiler/types';

/**
 * Parse a time value from the push-range command.
 * Supports multiple formats:
 * - Timestamp names: "ts-6" (returns null, caller should look up in timestamp manager)
 * - Seconds: "2.7" or "2.7s" (relative to profile start)
 * - Milliseconds: "2700ms" (relative to profile start)
 * - Percentage: "10%" (percentage through profile duration)
 *
 * Returns absolute timestamp in milliseconds, or null if it's a timestamp name.
 */
export function parseTimeValue(
  value: string,
  rootRange: StartEndRange
): number | null {
  // Check if it's a timestamp name (starts with "ts")
  if (value.startsWith('ts')) {
    // Return null to signal caller should look it up
    return null;
  }

  // Check if it's a percentage
  if (value.endsWith('%')) {
    const percent = parseFloat(value.slice(0, -1));
    if (isNaN(percent)) {
      throw new Error(`Invalid percentage: "${value}"`);
    }
    const duration = rootRange.end - rootRange.start;
    return rootRange.start + (percent / 100) * duration;
  }

  // Check if it's milliseconds
  if (value.endsWith('ms')) {
    const ms = parseFloat(value.slice(0, -2));
    if (isNaN(ms)) {
      throw new Error(`Invalid milliseconds: "${value}"`);
    }
    return rootRange.start + ms;
  }

  // Check if it's seconds with 's' suffix
  if (value.endsWith('s')) {
    const seconds = parseFloat(value.slice(0, -1));
    if (isNaN(seconds)) {
      throw new Error(`Invalid seconds: "${value}"`);
    }
    return rootRange.start + seconds * 1000;
  }

  // Default: treat as seconds (no suffix)
  const seconds = parseFloat(value);
  if (isNaN(seconds)) {
    throw new Error(
      `Invalid time value: "${value}". Expected timestamp name (ts-X), seconds (2.7), milliseconds (2700ms), or percentage (10%)`
    );
  }
  return rootRange.start + seconds * 1000;
}
