/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getMarkerStyle } from '../../profile-logic/marker-styles';
import type { MarkerSchema, MarkerSchemaStyle } from 'firefox-profiler/types';

describe('getMarkerStyle', function () {
  const schemaStyle: MarkerSchemaStyle = {
    top: 3,
    height: 9,
    background: 'pink',
    squareCorners: true,
    borderLeft: null,
    borderRight: 'purple',
  };
  const markerSchema: MarkerSchema = {
    name: 'CustomMarker',
    display: ['timeline-overview'],
    fields: [],
    style: schemaStyle,
  };

  it('uses the schema style for markers without a name override', function () {
    expect(getMarkerStyle('Dynamic marker name', markerSchema)).toBe(
      schemaStyle
    );
  });

  it('keeps marker name overrides ahead of the schema style', function () {
    expect(getMarkerStyle('Reflow', markerSchema)).toMatchObject({
      top: 7,
      height: 6,
      squareCorners: false,
    });
  });
});
