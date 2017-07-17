/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

export type Milliseconds = number;

/**
 * The pixels represented by the px unit of CSS, e.g. the height of a div by setting the
 * div.style.height = "15px". This may not be the actual size of pixels in a canvas or
 * displayed on the screen.
 */
export type CssPixels = number;

/**
 * The size of the pixels actually present on the device, particularly used on canvas
 * sizing.
 */
export type DevicePixels = number;

/**
 * Given a specific timing range in a profile, 0 is the left-most side of this range,
 * and 1 is the right-most.
 */
export type UnitIntervalOfProfileRange = number;

/**
 * For the a viewport into the profile range.
 */
export type HorizontalViewport = {
  left: UnitIntervalOfProfileRange,
  right: UnitIntervalOfProfileRange,
  length: UnitIntervalOfProfileRange,
};

export type StartEndRange = { start: Milliseconds, end: Milliseconds };

export type MemoryOffset = number;
