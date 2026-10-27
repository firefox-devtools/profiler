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
  GREY_10,
  GREY_20,
  GREY_30,
  GREY_40,
  GREY_50,
  GREY_60,
  GREY_70,
  GREY_80,
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

/**
 * A neutral style used to dim non-matching nodes in the stack chart when a
 * search filter is active. Closer to the background than any category color
 * so that matching nodes stand out clearly.
 */
const DIMMED_STYLE: ColorStyles = {
  ...DEFAULT_STYLE,
  _selectedFillStyle: [GREY_10, GREY_80],
  _unselectedFillStyle: [GREY_10, GREY_80],
  _selectedTextColor: [GREY_50, GREY_40],
  gravity: 0,
};

export function getDimmedStyles(): ColorStyles {
  return DIMMED_STYLE;
}

export function getForegroundColor(): string {
  return lightDark('#000000', GREY_20);
}

export function getBackgroundColor(): string {
  return lightDark('#ffffff', '#18181a');
}

type RgbaColor = { r: number; g: number; b: number; a: number };

/**
 * Parse a color in the #rrggbb or #rrggbbaa format. The returned channels are
 * between 0 and 1.
 */
function parseHexColor(color: string): RgbaColor {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color);
  if (match === null) {
    throw new Error(`Expected a color in the #rrggbb[aa] format: ${color}`);
  }
  const rgb = parseInt(match[1], 16);
  return {
    r: ((rgb >> 16) & 0xff) / 255,
    g: ((rgb >> 8) & 0xff) / 255,
    b: (rgb & 0xff) / 255,
    a: match[2] === undefined ? 1 : parseInt(match[2], 16) / 255,
  };
}

function toHexColor({ r, g, b }: RgbaColor): string {
  const toHex = (channel: number) =>
    Math.round(channel * 255)
      .toString(16)
      .padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Compute the opaque color that results from drawing `color`, which can be
 * translucent, on top of `backgroundColor`. Both colors use the #rrggbb[aa]
 * format. The result uses the #rrggbb format.
 */
export function blendColors(color: string, backgroundColor: string): string {
  const fg = parseHexColor(color);
  const bg = parseHexColor(backgroundColor);
  const blend = (fgChannel: number, bgChannel: number) =>
    fgChannel * fg.a + bgChannel * (1 - fg.a);
  return toHexColor({
    r: blend(fg.r, bg.r),
    g: blend(fg.g, bg.g),
    b: blend(fg.b, bg.b),
    a: 1,
  });
}

/**
 * Compute the relative luminance of an opaque color, as defined by WCAG 2.
 * See https://www.w3.org/TR/WCAG22/#dfn-relative-luminance
 */
function getRelativeLuminance(color: string): number {
  const { r, g, b } = parseHexColor(color);
  const linearize = (channel: number) =>
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Compute the contrast ratio between two opaque colors, as defined by WCAG 2.
 * The result is between 1 and 21. For small text, WCAG level AA requires a
 * contrast ratio of at least 4.5.
 * See https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
export function getContrastRatio(colorA: string, colorB: string): number {
  const luminanceA = getRelativeLuminance(colorA);
  const luminanceB = getRelativeLuminance(colorB);
  return (
    (Math.max(luminanceA, luminanceB) + 0.05) /
    (Math.min(luminanceA, luminanceB) + 0.05)
  );
}

/**
 * Return black or white, whichever has the higher contrast with text drawn on
 * `fillColor`. The fill color can be translucent, in which case it's blended
 * with `backgroundColor` first.
 */
export function getContrastingTextColor(
  fillColor: string,
  backgroundColor: string
): string {
  const color = blendColors(fillColor, backgroundColor);
  return getContrastRatio('#000000', color) >=
    getContrastRatio('#ffffff', color)
    ? '#000000'
    : '#ffffff';
}
