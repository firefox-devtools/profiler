/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  BLUE_50,
  BLUE_60,
  GREEN_50,
  GREEN_60,
  GREY_50,
  GREY_60,
  INK_50,
  INK_60,
  MAGENTA_50,
  MAGENTA_60,
  ORANGE_50,
  ORANGE_60,
  PURPLE_50,
  PURPLE_60,
  RED_50,
  RED_60,
  TEAL_50,
  TEAL_60,
  YELLOW_50,
  YELLOW_60,
} from 'photon-colors';

import { mapCategoryColorNameToStyles } from 'firefox-profiler/utils/colors';
import type { GraphColor } from 'firefox-profiler/types';

export function getStrokeColor(color: GraphColor) {
  switch (color) {
    case 'magenta':
      return MAGENTA_50;
    case 'purple':
      return PURPLE_50;
    case 'blue':
      return BLUE_50;
    case 'teal':
      return TEAL_50;
    case 'green':
      return GREEN_50;
    case 'yellow':
      return YELLOW_50;
    case 'red':
      return RED_50;
    case 'orange':
      return ORANGE_50;
    case 'grey':
      return GREY_50;
    case 'ink':
      return INK_50;
    default:
      throw new Error('Unexpected track color: ' + color);
  }
}

export function getFillColor(color: GraphColor) {
  // Same as stroke color with transparency.
  return getStrokeColor(color) + '88';
}

export function getDotColor(color: GraphColor) {
  switch (color) {
    case 'magenta':
      return MAGENTA_60;
    case 'purple':
      return PURPLE_60;
    case 'blue':
      return BLUE_60;
    case 'teal':
      return TEAL_60;
    case 'green':
      return GREEN_60;
    case 'yellow':
      return YELLOW_60;
    case 'red':
      return RED_60;
    case 'orange':
      return ORANGE_60;
    case 'grey':
      return GREY_60;
    case 'ink':
      return INK_60;
    default:
      throw new Error('Unexpected track color: ' + color);
  }
}

/**
 * Get the appropriate text color for a graph color background to ensure readability.
 * Uses mapCategoryColorNameToStyles from colors.ts to get the predefined text colors.
 */
export function getTextColor(color: GraphColor): string {
  // There is some overlap between GraphColor and the valid category color
  // values. For other values, mapCategoryColorNameToStyles defaults to gray.
  // This is good enough for now.
  const colorStyles = mapCategoryColorNameToStyles(color);
  return colorStyles.selectedTextColor;
}

/**
 * Check if a string is a valid GraphColor value.
 */
export function isValidGraphColor(value: string): value is GraphColor {
  const validColors: GraphColor[] = [
    'blue',
    'green',
    'grey',
    'ink',
    'magenta',
    'orange',
    'purple',
    'red',
    'teal',
    'yellow',
  ];
  return validColors.includes(value as GraphColor);
}
