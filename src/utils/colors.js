/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/**
 * These are the colors from Photon. They are inlined to provide easy access. If updating
 * please change the CSS variables as well.
 *
 * Firefox Colors v1.0.3
 * https://github.com/FirefoxUX/photon-colors/blob/master/photon-colors.js
 */

export const MAGENTA_50 = '#ff1ad9';
export const MAGENTA_60 = '#ed00b5';
export const MAGENTA_70 = '#b5007f';
export const MAGENTA_80 = '#7d004f';
export const MAGENTA_90 = '#440027';

export const PURPLE_50 = '#9400ff';
export const PURPLE_60 = '#8000d7';
export const PURPLE_70 = '#6200a4';
export const PURPLE_80 = '#440071';
export const PURPLE_90 = '#25003e';

export const BLUE_40 = '#45a1ff';
export const BLUE_50 = '#0a84ff';
export const BLUE_60 = '#0060df';
export const BLUE_70 = '#003eaa';
export const BLUE_80 = '#002275';
export const BLUE_90 = '#000f40';

export const TEAL_50 = '#00feff';
export const TEAL_60 = '#00c8d7';
export const TEAL_70 = '#008ea4';
export const TEAL_80 = '#005a71';
export const TEAL_90 = '#002d3e';

export const GREEN_50 = '#30e60b';
export const GREEN_60 = '#12bc00';
export const GREEN_70 = '#058b00';
export const GREEN_80 = '#006504';
export const GREEN_90 = '#003706';

export const YELLOW_50 = '#ffe900';
export const YELLOW_60 = '#d7b600';
export const YELLOW_70 = '#a47f00';
export const YELLOW_80 = '#715100';
export const YELLOW_90 = '#3e2800';

export const RED_50 = '#ff0039';
export const RED_60 = '#d70022';
export const RED_70 = '#a4000f';
export const RED_80 = '#5a0002';
export const RED_90 = '#3e0200';

export const ORANGE_50 = '#ff9400';
export const ORANGE_60 = '#d76e00';
export const ORANGE_70 = '#a44900';
export const ORANGE_80 = '#712b00';
export const ORANGE_90 = '#3e1300';

export const GREY_10 = '#f9f9fa';
export const GREY_20 = '#ededf0';
export const GREY_30 = '#d7d7db';
export const GREY_40 = '#b1b1b3';
export const GREY_50 = '#737373';
export const GREY_60 = '#4a4a4f';
export const GREY_70 = '#38383d';
export const GREY_80 = '#2a2a2e';
export const GREY_90 = '#0c0c0d';

export const INK_70 = '#363959';
export const INK_80 = '#202340';
export const INK_90 = '#0f1126';

type ColorStyles = {
  readonly selectedFillStyle: string,
  readonly unselectedFillStyle: string,
  readonly selectedTextColor: string,
  readonly gravity: number,
};

const GRAY_STYLE = {
  selectedFillStyle: GREY_40,
  unselectedFillStyle: GREY_40 + '60',
  selectedTextColor: '#000',
  gravity: 10,
};
const DARK_GRAY_STYLE = {
  selectedFillStyle: GREY_50,
  unselectedFillStyle: GREY_50 + '60',
  selectedTextColor: '#fff',
  gravity: 11,
};
const STYLE_MAP: { [string]: ColorStyles } = {
  transparent: {
    selectedFillStyle: 'transparent',
    unselectedFillStyle: 'transparent',
    selectedTextColor: '#000',
    gravity: 0,
  },
  lightblue: {
    selectedFillStyle: BLUE_40,
    // Colors are assumed to have the form #RRGGBB, so concatenating 2 more digits to
    // the end defines the transparency #RRGGBBAA.
    unselectedFillStyle: BLUE_40 + '60',
    selectedTextColor: '#000',
    gravity: 1,
  },
  red: {
    selectedFillStyle: RED_60,
    unselectedFillStyle: RED_60 + '60',
    selectedTextColor: '#fff',
    gravity: 1,
  },
  lightred: {
    selectedFillStyle: RED_70 + '60',
    unselectedFillStyle: RED_70 + '30',
    selectedTextColor: '#000',
    gravity: 1,
  },
  orange: {
    selectedFillStyle: ORANGE_50,
    unselectedFillStyle: ORANGE_50 + '60',
    selectedTextColor: '#fff',
    gravity: 2,
  },
  blue: {
    selectedFillStyle: BLUE_60,
    unselectedFillStyle: BLUE_60 + '60',
    selectedTextColor: '#fff',
    gravity: 3,
  },
  green: {
    selectedFillStyle: GREEN_60,
    unselectedFillStyle: GREEN_60 + '60',
    selectedTextColor: '#fff',
    gravity: 4,
  },
  purple: {
    selectedFillStyle: PURPLE_70,
    unselectedFillStyle: PURPLE_70 + '60',
    selectedTextColor: '#fff',
    gravity: 5,
  },
  yellow: {
    selectedFillStyle: '#ffe129', // This yellow has more contrast than YELLOW_50.
    unselectedFillStyle: YELLOW_50 + '70',
    selectedTextColor: '#000',
    gravity: 6,
  },
  brown: {
    selectedFillStyle: ORANGE_70,
    unselectedFillStyle: ORANGE_70 + '60',
    selectedTextColor: '#fff',
    gravity: 7,
  },
  magenta: {
    selectedFillStyle: MAGENTA_60,
    unselectedFillStyle: MAGENTA_60 + '60',
    selectedTextColor: '#fff',
    gravity: 8,
  },
  lightgreen: {
    selectedFillStyle: GREEN_50,
    unselectedFillStyle: GREEN_50 + '60',
    selectedTextColor: '#fff',
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
    return {
      selectedFillStyle: GREY_30,
      unselectedFillStyle: GREY_30 + '60',
      selectedTextColor: '#000',
      gravity: 8,
    };
  }
  return mapCategoryColorNameToStyles(colorName);
}
