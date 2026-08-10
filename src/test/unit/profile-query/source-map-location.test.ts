/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { toSourceMapLocation } from '../../../profile-query/source-map';

describe('toSourceMapLocation', function () {
  it('passes through a regular URL', function () {
    expect(toSourceMapLocation('https://example.com/a.js.map')).toEqual({
      kind: 'url',
      url: 'https://example.com/a.js.map',
    });
  });

  it('describes a well-formed inline map by media type and size', function () {
    const url = 'data:application/json;base64,' + 'A'.repeat(1000);
    expect(toSourceMapLocation(url)).toEqual({
      kind: 'inline',
      mediaType: 'application/json;base64',
      byteLength: url.length,
    });
  });

  it('handles an inline map with an empty media type', function () {
    expect(toSourceMapLocation('data:,{}')).toEqual({
      kind: 'inline',
      mediaType: '',
      byteLength: 8,
    });
  });

  it('does not echo the payload when the data: URL has no comma', function () {
    const url = 'data:application/json;base64' + 'A'.repeat(100000);
    expect(toSourceMapLocation(url)).toEqual({
      kind: 'inline',
      mediaType: null,
      byteLength: url.length,
    });
  });

  it('does not echo the payload when the first comma is implausibly far in', function () {
    const url = 'data:' + 'A'.repeat(100000) + ',rest';
    expect(toSourceMapLocation(url)).toEqual({
      kind: 'inline',
      mediaType: null,
      byteLength: url.length,
    });
  });

  it('treats a bare "data:" as an inline map with no media type', function () {
    expect(toSourceMapLocation('data:')).toEqual({
      kind: 'inline',
      mediaType: null,
      byteLength: 5,
    });
  });
});
