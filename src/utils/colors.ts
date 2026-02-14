/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { lightDark, maybeLightDark } from './dark-mode';

import {
  BLUE_40,
  BLUE_60,
  GREEN_50,
  GREEN_60,
  GREEN_70,
  GREY_20,
  GREY_30,
  GREY_40,
  GREY_50,
  GREY_60,
  GREY_70,
  MAGENTA_60,
  MAGENTA_70,
  ORANGE_50,
  ORANGE_60,
  ORANGE_70,
  PURPLE_70,
  RED_60,
  RED_70,
  YELLOW_50,
} from 'photon-colors';

type ColorStyles = {
  readonly _selectedFillStyle: string | [string, string];
  readonly _unselectedFillStyle: string | [string, string];
  readonly _selectedTextColor: string | [string, string];
  readonly getSelectedFillStyle: () => string;
  readonly getUnselectedFillStyle: () => string;
  readonly getSelectedTextColor: () => string;
  readonly gravity: number;
};

const DEFAULT_STYLE: ColorStyles = {
  _selectedFillStyle: ['#ffffff', '#0f1126'],
  _unselectedFillStyle: ['#ffffff60', '#0f112660'],
  _selectedTextColor: ['#000000', GREY_20],
  getSelectedFillStyle: function () {
    return maybeLightDark(this._selectedFillStyle);
  },
  getUnselectedFillStyle: function () {
    return maybeLightDark(this._unselectedFillStyle);
  },
  getSelectedTextColor: function () {
    return maybeLightDark(this._selectedTextColor);
  },
  gravity: 0,
};

// Colors based on photon colors.
export const BLUE_65 = '#004fc4';
export const PURPLE_55 = '#8a00eb';
export const YELLOW_65 = '#be9b00';

const PSEUDO_TRANSPARENT_STYLE: ColorStyles = {
  ...DEFAULT_STYLE,
  _selectedFillStyle: [GREY_30, GREY_70],
  _unselectedFillStyle: [GREY_30 + '60', GREY_70 + '60'],
  _selectedTextColor: ['#000', GREY_20],
  gravity: 8,
};

const GRAY_STYLE: ColorStyles = {
  ...DEFAULT_STYLE,
  _selectedFillStyle: [GREY_40, GREY_50],
  _unselectedFillStyle: [GREY_40 + '60', GREY_50 + '60'],
  _selectedTextColor: ['#000', GREY_20],
  gravity: 10,
};
const DARK_GRAY_STYLE: ColorStyles = {
  ...DEFAULT_STYLE,
  _selectedFillStyle: [GREY_50, GREY_60],
  _unselectedFillStyle: [GREY_50 + '60', GREY_60 + '60'],
  _selectedTextColor: '#fff',
  gravity: 11,
};
const STYLE_MAP: { [key: string]: ColorStyles } = {
  transparent: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: 'transparent',
    _unselectedFillStyle: 'transparent',
    _selectedTextColor: ['#000', GREY_20],
    gravity: 0,
  },
  lightblue: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: BLUE_40,
    // Colors are assumed to have the form #RRGGBB, so concatenating 2 more digits to
    // the end defines the transparency #RRGGBBAA.
    _unselectedFillStyle: BLUE_40 + '60',
    _selectedTextColor: ['#000', GREY_20],
    gravity: 1,
  },
  red: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: RED_60,
    _unselectedFillStyle: RED_60 + '60',
    _selectedTextColor: '#fff',
    gravity: 1,
  },
  lightred: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: RED_70 + '60',
    _unselectedFillStyle: RED_70 + '30',
    _selectedTextColor: ['#000', GREY_20],
    gravity: 1,
  },
  orange: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [ORANGE_50, ORANGE_60],
    _unselectedFillStyle: [ORANGE_50 + '60', ORANGE_60 + '60'],
    _selectedTextColor: '#fff',
    gravity: 2,
  },
  blue: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: BLUE_60,
    _unselectedFillStyle: BLUE_60 + '60',
    _selectedTextColor: '#fff',
    gravity: 3,
  },
  green: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [GREEN_60, GREEN_70],
    _unselectedFillStyle: [GREEN_60 + '60', GREEN_70 + '60'],
    _selectedTextColor: '#fff',
    gravity: 4,
  },
  purple: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [PURPLE_70, PURPLE_55],
    _unselectedFillStyle: [PURPLE_70 + '60', PURPLE_55 + '70'],
    _selectedTextColor: '#fff',
    gravity: 5,
  },
  yellow: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [
      // This yellow has more contrast than YELLOW_50.
      '#ffe129',
      YELLOW_65,
    ],
    _unselectedFillStyle: [YELLOW_50 + '70', YELLOW_65 + '85'],
    _selectedTextColor: ['#000', GREY_20],
    gravity: 6,
  },
  brown: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: ORANGE_70,
    _unselectedFillStyle: ORANGE_70 + '60',
    _selectedTextColor: '#fff',
    gravity: 7,
  },
  magenta: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [MAGENTA_60, MAGENTA_70],
    _unselectedFillStyle: [MAGENTA_60 + '60', MAGENTA_70 + '60'],
    _selectedTextColor: '#fff',
    gravity: 8,
  },
  lightgreen: {
    ...DEFAULT_STYLE,
    _selectedFillStyle: [GREEN_50, GREEN_70],
    _unselectedFillStyle: [GREEN_50 + '60', GREEN_70 + '60'],
    _selectedTextColor: '#fff',
    gravity: 9,
  },
  gray: GRAY_STYLE,
  grey: GRAY_STYLE,
  darkgray: DARK_GRAY_STYLE,
  darkgrey: DARK_GRAY_STYLE,
};

/**
 * Map a color name, which comes from Gecko, into a CSS style color. These colors cannot
 * be changed without considering the values coming from Gecko, and from old profiles
 * that already have their category colors saved into the profile.
 *
 * Category color names come from:
 * https://searchfox.org/mozilla-central/rev/9193635dca8cfdcb68f114306194ffc860456044/js/public/ProfilingCategory.h#33
 */
export function mapCategoryColorNameToStyles(colorName: string): ColorStyles {
  const colorStyles = STYLE_MAP[colorName];
  if (colorStyles !== undefined) {
    return colorStyles;
  }
  console.error(
    `Unknown color name '${colorName}' encountered. Consider updating this code to handle it.`
  );
  return GRAY_STYLE;
}

/**
 * This function tweaks the colors for the stack chart, but re-uses most
 * of the logic from `mapCategoryColorNameToStyles`.
 */
export function mapCategoryColorNameToStackChartStyles(
  colorName: string
): ColorStyles {
  if (colorName === 'transparent') {
    return PSEUDO_TRANSPARENT_STYLE;
  }
  return mapCategoryColorNameToStyles(colorName);
}

export function getForegroundColor(): string {
  return lightDark('#000000', GREY_20);
}

export function getBackgroundColor(): string {
  return lightDark('#ffffff', '#18181a');
}
