/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as colors from 'photon-colors';
import memoize from 'memoize-immutable';

import type { CssPixels, Marker, MarkerSchema } from 'firefox-profiler/types';

import { maybeLightDark } from '../utils/dark-mode';
import { getDotColor, getStrokeColor, isValidGraphColor } from './graph-color';

export const MARKER_HEIGHT: CssPixels = 6;

type MarkerStyle = {
  readonly top: CssPixels;
  readonly _background: string | [string, string];
  readonly getBackground: () => string;
  readonly squareCorners: boolean;
  readonly _borderLeft: null | string | [string, string];
  readonly hasBorderLeft: () => boolean;
  readonly getBorderLeft: () => string;
  readonly _borderRight: null | string | [string, string];
  readonly hasBorderRight: () => boolean;
  readonly getBorderRight: () => string;
};

const defaultStyle: MarkerStyle = {
  top: 0,
  _background: ['black', colors.GREY_40],
  getBackground: function () {
    return maybeLightDark(this._background);
  },
  squareCorners: false,
  _borderLeft: null,
  hasBorderLeft: function () {
    return this._borderLeft !== null;
  },
  getBorderLeft: function () {
    return maybeLightDark(this._borderLeft as string | [string, string]);
  },
  _borderRight: null,
  hasBorderRight: function () {
    return this._borderRight !== null;
  },
  getBorderRight: function () {
    return maybeLightDark(this._borderRight as string | [string, string]);
  },
};

/**
 * Get the marker style. Start off by looking at the marker name, then fallback to
 * the marker schema.
 */
export function getMarkerStyle(
  marker: Marker,
  markerSchema: MarkerSchema | null
): MarkerStyle {
  if (marker.name in markerStylesByName) {
    return markerStylesByName[marker.name];
  }
  return markerSchema ? _getMarkerSchemaStyle(markerSchema) : defaultStyle;
}

const _getMarkerSchemaStyle = memoize(
  ({ color, timelineStyle }: MarkerSchema): MarkerStyle => {
    // The color comes from the profile, so it isn't guaranteed to be a GraphColor.
    const graphColor =
      color !== undefined && isValidGraphColor(color) ? color : null;
    const borderColor =
      graphColor !== null && timelineStyle?.borders
        ? getDotColor(graphColor)
        : null;
    return {
      ...defaultStyle,
      top: timelineStyle?.top ?? defaultStyle.top,
      squareCorners: timelineStyle?.squareCorners ?? defaultStyle.squareCorners,
      _background:
        graphColor !== null
          ? getStrokeColor(graphColor)
          : defaultStyle._background,
      _borderLeft: borderColor,
      _borderRight: borderColor,
    };
  },
  { cache: new WeakMap() }
);

const markerStylesByName: { readonly [markerName: string]: MarkerStyle } = {
  'requestAnimationFrame callbacks': {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 6,
  },
  DisplayList: {
    ...defaultStyle,
    _background: colors.PURPLE_50,
    top: 9,
  },

  IPCOut: {
    ...defaultStyle,
    _background: colors.BLUE_50,
    top: 2,
  },
  SyncIPCOut: {
    ...defaultStyle,
    _background: colors.BLUE_70,
    top: 6,
  },
  IPCIn: {
    ...defaultStyle,
    _background: colors.PURPLE_40,
    top: 13,
  },
  SyncIPCIn: {
    ...defaultStyle,
    _background: colors.PURPLE_70,
    top: 17,
  },
};

export const overlayFills = {
  HOVERED: 'hsla(0,0%,100%,0.3)',
  PRESSED: 'rgba(0,0,0,0.3)',
};
