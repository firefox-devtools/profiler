/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// TypeScript types

export type Nanoseconds = number;
export type Microseconds = number;
export type Milliseconds = number;
export type Seconds = number;

/**
 * The pixels represented by the px unit of CSS, e.g. the height of a div by setting the
 * div.style.height = "15px". This may not be the actual size of pixels in a canvas or
 * displayed on the screen.
 */
export type CssPixels = number;

/**
 * The size of the pixels actually present on the device, particularly used on canvas
 * sizing. For instance on a device with a devicePixelRatio of 2, the DevicePixels
 * will be  twice as large as CssPixels.
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
  left: UnitIntervalOfProfileRange;
  right: UnitIntervalOfProfileRange;
  length: UnitIntervalOfProfileRange;
};

export type StartEndRange = { start: Milliseconds; end: Milliseconds };

// An absolute address that was valid in the (virtual memory) address space of
// the profiled process, in bytes.
// Addresses in this space are present in:
//  - Original unsymbolicated native stack frames (before profile processing).
//  - The memory ranges of the shared libraries that were loaded into the process.
//
// Most other "offsets", or "addresses", in the profiler code are relative to
// some library, and those use a different type: Address.
export type MemoryOffset = number;

// An address, in bytes, relative to a library. The library that the address
// is relative to is usually given by the context in some way.
// Also called a library-relative offset.
// The vast majority of addresses that we deal with in profiler code are in this
// form, rather than in the absolute MemoryOffset form.
export type Address = number;

export type Bytes = number;
