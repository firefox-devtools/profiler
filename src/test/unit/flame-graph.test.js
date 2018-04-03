/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  BLUE_50,
  BLUE_60,
  BLUE_90,
  ORANGE_50,
  ORANGE_60,
  ORANGE_90,
  GREY_30,
  GREY_50,
  GREY_60,
  GREY_90,
} from 'photon-colors';

import {
  getBackgroundColor,
  getForegroundColor,
  getHoverBackgroundColor,
} from '../../components/flame-graph/Canvas';

describe('colors for native stack type', function() {
  it('has the correct starting colors', function() {
    expect(getBackgroundColor('native', 0)).toEqual('#c1e0ff');
    expect(getForegroundColor('native', 0)).toEqual(BLUE_90);
  });

  it('has the correct ending colors', function() {
    expect(getBackgroundColor('native', 1)).toEqual(BLUE_50);
    expect(getForegroundColor('native', 1)).toEqual('#ffffff');
  });
});

describe('colors for js stack type', function() {
  it('has the correct starting colors', function() {
    expect(getBackgroundColor('js', 0)).toEqual('#ffd79f');
    expect(getForegroundColor('js', 0)).toEqual(ORANGE_90);
  });

  it('has the correct ending colors', function() {
    expect(getBackgroundColor('js', 1)).toEqual(ORANGE_50);
    expect(getForegroundColor('js', 1)).toEqual(ORANGE_90);
  });
});

describe('colors for unsymbolicated stack type', function() {
  it('has the correct starting colors', function() {
    expect(getBackgroundColor('unsymbolicated', 0)).toEqual(GREY_30);
    expect(getForegroundColor('unsymbolicated', 0)).toEqual(GREY_90);
  });

  it('has the correct ending colors', function() {
    expect(getBackgroundColor('unsymbolicated', 1)).toEqual(GREY_50);
    expect(getForegroundColor('unsymbolicated', 1)).toEqual('#ffffff');
  });
});

describe('colors when hovering', function() {
  it('has the correct hover colors for the different stack types', function() {
    expect(getHoverBackgroundColor('native')).toEqual(BLUE_60);
    expect(getHoverBackgroundColor('js')).toEqual(ORANGE_60);
    expect(getHoverBackgroundColor('unsymbolicated')).toEqual(GREY_60);
  });
});
