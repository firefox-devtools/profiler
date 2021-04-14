/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type {
  StartEndRange,
  Marker,
  Milliseconds,
} from 'firefox-profiler/types';

/**
 * Firefox has issues switching quickly between fill style colors, as the CSS color
 * is fully parsed each time it is set. As a mitigation, provide a class that only
 * switches the color when it's really needed.
 */
export class FastFillStyle {
  _ctx: CanvasRenderingContext2D;
  _previousFillColor: string;

  constructor(ctx: CanvasRenderingContext2D) {
    this._ctx = ctx;
    this._previousFillColor = '';
  }

  set(fillStyle: string) {
    if (fillStyle !== this._previousFillColor) {
      this._ctx.fillStyle = fillStyle;
      this._previousFillColor = fillStyle;
    }
  }
}

/**
 * Perform a simple shallow object equality check.
 */
export function objectShallowEquals<
  // False positive, Objects are fine as generic trait bounds.
  // eslint-disable-next-line flowtype/no-weak-types
  A: Object,
  // eslint-disable-next-line flowtype/no-weak-types
  B: Object
>(a: A, b: B): boolean {
  let aLength = 0;
  let bLength = 0;
  for (const key in a) {
    if (Object.prototype.hasOwnProperty.call(a, key)) {
      aLength++;
      if (a[key] !== b[key]) {
        return false;
      }
    }
  }
  for (const key in b) {
    if (Object.prototype.hasOwnProperty.call(b, key)) {
      bLength++;
    }
  }
  return aLength === bLength;
}

/**
 * Don't completely trust URLs that get displayed to the screen. These could
 * be extraordinarily long data-uris. This function could also be updated to
 * return a nicely formatted React span.
 */
export function displayNiceUrl(rawUrl: string): string {
  if (rawUrl.length < 200) {
    return rawUrl;
  }
  return `${rawUrl.slice(0, 150)}...${rawUrl.slice(-20)}`;
}

/**
 * This function handles the logic of converting both Interval and Instant markers
 * into a range selection. For instant markers, it creates a range that is 5%
 * of the range selection (typically the committed range).
 */
export function getStartEndRangeForMarker(
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  marker: Marker
): StartEndRange {
  let start = marker.start;
  let end = marker.end;

  if (end === null) {
    const delta = (rangeEnd - rangeStart) / 40;
    start = marker.start - delta;
    end = marker.start + delta;
  }

  return { start, end };
}

/**
 * This logic is shared between multiple components, but it is used to determine how a
 * track gets selected, based on the modifiers used.
 *
 * See issue #2710 about adding "shift" behavior.
 */
export function getTrackSelectionModifier(
  event:
    | MouseEvent
    | KeyboardEvent
    | SyntheticMouseEvent<>
    | SyntheticKeyboardEvent<>
): 'ctrl' | 'none' {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
    return 'ctrl';
  }
  // Uncomment the following lines to implement issue #2710:
  // if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
  //   return 'shift';
  // }
  return 'none';
}
