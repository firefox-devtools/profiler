/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  blendColors,
  getContrastRatio,
  getContrastingTextColor,
  getBackgroundColor,
} from '../../utils/colors';
import {
  isDarkMode,
  resetForTest,
  setThemePreference,
} from '../../utils/dark-mode';
import {
  getMarkerColors,
  getHighlightRowBackgroundColor,
} from '../../components/marker-chart/Canvas';
import type { GraphColor } from 'firefox-profiler/types';

describe('blendColors', function () {
  it('returns opaque colors unchanged', function () {
    expect(blendColors('#123456', '#ffffff')).toBe('#123456');
  });

  it('blends translucent colors with the background', function () {
    expect(blendColors('#00000080', '#ffffff')).toBe('#7f7f7f');
    expect(blendColors('#ff000000', '#00ff00')).toBe('#00ff00');
  });
});

describe('getContrastRatio', function () {
  it('computes the WCAG contrast ratio', function () {
    expect(getContrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(getContrastRatio('#777777', '#777777')).toBeCloseTo(1);
    // tinycolor2.readability gives the same value for this pair.
    expect(getContrastRatio('#0060df', '#ffffff')).toBeCloseTo(5.62, 2);
  });
});

describe('getContrastingTextColor', function () {
  it('picks black or white, whichever has more contrast', function () {
    expect(getContrastingTextColor('#ffff00', '#ffffff')).toBe('#000000');
    expect(getContrastingTextColor('#0000ff', '#ffffff')).toBe('#ffffff');
  });

  it('takes the background into account for translucent fills', function () {
    expect(getContrastingTextColor('#0a84ff40', '#ffffff')).toBe('#000000');
    expect(getContrastingTextColor('#0a84ff40', '#000000')).toBe('#ffffff');
  });
});

describe('marker chart colors', function () {
  const colors: Array<GraphColor | null> = [
    null,
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

  afterEach(function () {
    setThemePreference('system');
    resetForTest();
  });

  for (const theme of ['light', 'dark'] as const) {
    it(`has text with enough contrast in ${theme} mode`, function () {
      resetForTest();
      setThemePreference(theme);
      expect(isDarkMode()).toBe(theme === 'dark');
      const rowBackgrounds = [
        getBackgroundColor(),
        blendColors(getHighlightRowBackgroundColor(), getBackgroundColor()),
      ];
      const failures = [];
      for (const color of colors) {
        for (const isHighlighted of [false, true]) {
          const { fillColor, textColor } = getMarkerColors(
            color,
            isHighlighted
          );
          for (const rowBackground of rowBackgrounds) {
            const contrast = getContrastRatio(
              textColor,
              blendColors(fillColor, rowBackground)
            );
            // WCAG level AA requires 4.5 for small text.
            if (contrast < 4.5) {
              failures.push({ color, isHighlighted, rowBackground, contrast });
            }
          }
        }
      }
      expect(failures).toEqual([]);
    });
  }
});
