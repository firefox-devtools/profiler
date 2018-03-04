/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  BLUE_40,
  BLUE_70,
  BLUE_90,
  ORANGE_50,
  ORANGE_70,
  ORANGE_90,
  GREY_30,
  GREY_50,
  GREY_90,
} from 'photon-colors';

import { getColors } from '../../components/flame-graph/Canvas';

function toRgb(hex: string) {
  const match = hex.match(/#(.{2})(.{2})(.{2})/);
  if (!match) {
    throw new Error(`Invalid string: ${hex}`);
  }
  const [, r, g, b] = match;
  return `rgb(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)})`;
}

describe('getColors for native stack type', function() {
  it('starts with BLUE_40 as background, BLUE_90 for text', function() {
    const result = getColors('native', 0);
    expect(result).toEqual({ background: toRgb(BLUE_40), foreground: BLUE_90 });
  });

  it('ends with BLUE_70 as background, white for text', function() {
    const result = getColors('native', 1);
    expect(result).toEqual({
      background: toRgb(BLUE_70),
      foreground: '#ffffff',
    });
  });
});

describe('getColors for js stack type', function() {
  it('starts with ORANGE_50 as background, ORANGE_90 for text', function() {
    const result = getColors('js', 0);
    expect(result).toEqual({
      background: toRgb(ORANGE_50),
      foreground: ORANGE_90,
    });
  });

  it('ends with ORANGE_70 as background, white for text', function() {
    const result = getColors('js', 1);
    expect(result).toEqual({
      background: toRgb(ORANGE_70),
      foreground: '#ffffff',
    });
  });
});

describe('getColors for unsymbolicated stack type', function() {
  it('starts with GREY_30 as background, GREY_90 for text', function() {
    const result = getColors('unsymbolicated', 0);
    expect(result).toEqual({ background: toRgb(GREY_30), foreground: GREY_90 });
  });

  it('ends with GREY_50 as background, white for text', function() {
    const result = getColors('unsymbolicated', 1);
    expect(result).toEqual({
      background: toRgb(GREY_50),
      foreground: '#ffffff',
    });
  });
});
