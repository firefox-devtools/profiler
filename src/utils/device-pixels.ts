/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { DevicePixels } from 'firefox-profiler/types';

/**
 * Round the given value to integers, consistently rounding x.5 towards positive infinity.
 * This is different from Math.round: Math.round rounds 0.5 to the right (to 1), and -0.5
 * to the left (to -1).
 * snap should be preferred over Math.round for rounding coordinates which might
 * be negative, so that there is no discontinuity when a box moves past zero.
 */
export function snap(floatDeviceValue: DevicePixels): DevicePixels {
  return Math.floor(floatDeviceValue + 0.5);
}

/**
 * Round the given value to a multiple of `integerFactor`.
 */
export function snapValueToMultipleOf(
  floatDeviceValue: DevicePixels,
  integerFactor: number
): DevicePixels {
  return snap(floatDeviceValue / integerFactor) * integerFactor;
}
