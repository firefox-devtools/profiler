/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as colors from 'photon-colors';

import type { CssPixels, Marker } from 'firefox-profiler/types';

import { maybeLightDark } from '../utils/dark-mode';

type MarkerStyle = {
  readonly top: CssPixels;
  readonly height: CssPixels;
  readonly _background: string | [string, string];
  readonly getBackground: () => string;
  readonly squareCorners: boolean;
  readonly borderLeft: null | string;
  readonly borderRight: null | string;
};

const defaultStyle: MarkerStyle = {
  top: 0,
  height: 6,
  _background: ['black', colors.GREY_40],
  getBackground: function () {
    return maybeLightDark(this._background);
  },
  squareCorners: false,
  borderLeft: null,
  borderRight: null,
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
  RefreshDriverTick: {
    ...defaultStyle,
    _background: 'rgba(237, 237, 240, 0.05)',
    height: 18,
    squareCorners: true,
  },
  RD: {
    ...defaultStyle,
    _background: 'rgba(237, 237, 240, 0.05)',
    height: 18,
    squareCorners: true,
  },
  // Scripts is renamed to 'requestAnimationFrame callbacks' but keeping this
  // here for backwards compatibility.
  Scripts: {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 6,
  },
  'requestAnimationFrame callbacks': {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 6,
  },
  Styles: {
    ...defaultStyle,
    _background: [colors.TEAL_50, colors.TEAL_60],
    top: 7,
  },
  FireScrollEvent: {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 7,
  },
  Reflow: {
    ...defaultStyle,
    _background: colors.BLUE_50,
    top: 7,
  },
  DispatchSynthMouseMove: {
    ...defaultStyle,
    _background: colors.ORANGE_70,
    top: 8,
  },
  DisplayList: {
    ...defaultStyle,
    _background: colors.PURPLE_50,
    top: 9,
  },
  LayerBuilding: {
    ...defaultStyle,
    _background: colors.ORANGE_50,
    top: 9,
  },
  Rasterize: {
    ...defaultStyle,
    _background: [colors.GREEN_50, colors.GREEN_60],
    top: 10,
  },
  ForwardTransaction: {
    ...defaultStyle,
    _background: colors.RED_70,
    top: 11,
  },
  NotifyDidPaint: {
    ...defaultStyle,
    _background: colors.GREY_40,
    top: 12,
  },
  LayerTransaction: {
    ...defaultStyle,
    _background: colors.RED_70,
  },
  Composite: {
    ...defaultStyle,
    _background: colors.BLUE_50,
  },
  Vsync: {
    ...defaultStyle,
    _background: 'rgb(255, 128, 0)',
  },
  LayerContentGPU: {
    ...defaultStyle,
    _background: 'rgba(0,200,0,0.5)',
  },
  LayerCompositorGPU: {
    ...defaultStyle,
    _background: 'rgba(0,200,0,0.5)',
  },
  LayerOther: {
    ...defaultStyle,
    _background: 'rgb(200,0,0)',
  },
  Jank: {
    ...defaultStyle,
    _background: ['hsl(347, 100%, 60%)', 'hsl(347, 75%, 50%)'],
    borderLeft: colors.RED_50,
    borderRight: colors.RED_50,
    squareCorners: true,
  },
  // BHR markers are displayed in the timeline only if jank markers are
  // unavailable. Let's style them like Jank markers.
  'BHR-detected hang': {
    ...defaultStyle,
    _background: ['hsl(347, 100%, 60%)', 'hsl(347, 75%, 50%)'],
    borderLeft: colors.RED_50,
    borderRight: colors.RED_50,
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
  'GC Interrupt': gcStyle,
  CC: {
    ...ccStyle,
    squareCorners: true,
    top: 0,
  },
  CCSlice: ccStyle,
  ForgetSkippable: ccStyle,
  // Note: these Idle* markers have been removed in Firefox 99 (Bug 1752646),
  // but they're still here for compatibility for older profiles.
  IdleCCSlice: ccStyle,
  IdleForgetSkippable: ccStyle,

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
