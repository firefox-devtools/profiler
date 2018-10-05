/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as colors from 'photon-colors';

export const styles = {
  default: {
    top: 0,
    height: 6,
    background: colors.ORANGE_50,
    squareCorners: false,
    borderLeft: null,
    borderRight: null,
  },
  RefreshDriverTick: {
    background: 'hsla(0,0%,0%,0.05)',
    height: 18,
    squareCorners: true,
  },
  RD: {
    background: 'hsla(0,0%,0%,0.05)',
    height: 18,
    squareCorners: true,
  },
  Scripts: {
    background: colors.ORANGE_70,
    top: 6,
  },
  Styles: {
    background: colors.TEAL_50,
    top: 7,
  },
  FireScrollEvent: {
    background: colors.ORANGE_70,
    top: 7,
  },
  Reflow: {
    background: colors.BLUE_50,
    top: 7,
  },
  DispatchSynthMouseMove: {
    background: colors.ORANGE_70,
    top: 8,
  },
  DisplayList: {
    background: colors.PURPLE_50,
    top: 9,
  },
  LayerBuilding: {
    background: colors.ORANGE_50,
    top: 9,
  },
  Rasterize: {
    background: colors.GREEN_50,
    top: 10,
  },
  ForwardTransaction: {
    background: colors.RED_70,
    top: 11,
  },
  NotifyDidPaint: {
    background: colors.GREY_40,
    top: 12,
  },
  LayerTransaction: {
    background: colors.RED_70,
  },
  Composite: {
    background: colors.BLUE_50,
  },
  Vsync: {
    background: 'rgb(255, 128, 0)',
  },
  LayerContentGPU: {
    background: 'rgba(0,200,0,0.5)',
  },
  LayerCompositorGPU: {
    background: 'rgba(0,200,0,0.5)',
  },
  LayerOther: {
    background: 'rgb(200,0,0)',
  },
  Jank: {
    background: 'hsl(347, 100%, 60%)',
    borderLeft: colors.RED_50,
    borderRight: colors.RED_50,
    squareCorners: true,
  },
};

for (const name in styles) {
  if (name !== 'default') {
    styles[name] = Object.assign({}, styles.default, styles[name]);
  }
}

export const overlayFills = {
  HOVERED: 'hsla(0,0%,100%,0.3)',
  PRESSED: 'rgba(0,0,0,0.3)',
};
