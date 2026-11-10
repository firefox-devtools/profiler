/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as colors from 'photon-colors';

import type { CssPixels, Marker } from 'firefox-profiler/types';

import { maybeLightDark } from '../utils/dark-mode';

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

const gcStyle = {
  ...defaultStyle,
  top: 6,
  _background: colors.ORANGE_50,
};

const ccStyle = {
  ...gcStyle,
  // This is a paler orange to distinguish CC from GC.
  _background: '#ffc600',
};

/**
 * Get the marker style. Start off by looking at the marker name, then fallback to
 * the marker type.
 */
export function getMarkerStyle(marker: Marker): MarkerStyle {
  const { data, name } = marker;
  if (name in markerStyles) {
    return markerStyles[name];
  }
  if (data && data.type in markerStyles) {
    return markerStyles[data.type];
  }
  return markerStyles.default;
}

const markerStyles: { readonly [styleName: string]: MarkerStyle } = {
  default: defaultStyle,
  'requestAnimationFrame callbacks': {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 6,
  },
  Styles: {
    ...defaultStyle,
    _background: [colors.TEAL_50, colors.TEAL_70],
    top: 7,
  },
  DisplayList: {
    ...defaultStyle,
    _background: colors.PURPLE_50,
    top: 9,
  },
  Jank: {
    ...defaultStyle,
    _background: ['hsl(347, 100%, 60%)', 'hsl(347, 75%, 40%)'],
    _borderLeft: [colors.RED_50, colors.RED_70],
    _borderRight: [colors.RED_50, colors.RED_70],
    squareCorners: true,
  },
  // BHR markers are displayed in the timeline only if jank markers are
  // unavailable. Let's style them like Jank markers.
  'BHR-detected hang': {
    ...defaultStyle,
    _background: ['hsl(347, 100%, 60%)', 'hsl(347, 75%, 40%)'],
    _borderLeft: [colors.RED_50, colors.RED_70],
    _borderRight: [colors.RED_50, colors.RED_70],
    squareCorners: true,
  },
  // Memory:
  GCMajor: {
    ...gcStyle,
    squareCorners: true,
    top: 0,
  },
  GCSlice: gcStyle,
  GCMinor: gcStyle,
  CC: {
    ...ccStyle,
    squareCorners: true,
    top: 0,
  },
  CCSlice: ccStyle,
  ForgetSkippable: ccStyle,

  // IO:
  FileIO: {
    ...defaultStyle,
    _background: colors.BLUE_50,
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
