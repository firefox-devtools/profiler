/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  isPublicProfileUrl,
  publicUrlFor,
} from '../../profile-logic/benchmark/upload-compared-profiles';

const ARTIFACT =
  'https://firefox-ci-tc.services.mozilla.com/api/queue/v1/task/OwhDt4nhQBihUuEDCDFPAA/runs/0/artifacts/public/test_info/profile_speedometer3_compact.jslb.gz';
const FROM_URL = `https://profiler.firefox.com/from-url/${encodeURIComponent(ARTIFACT)}`;

describe('isPublicProfileUrl', () => {
  it('tells uploaded profiles from everything else', () => {
    expect(isPublicProfileUrl('https://profiler.firefox.com/public/abc/')).toBe(
      true
    );
    expect(isPublicProfileUrl(`${FROM_URL}/`)).toBe(false);
    expect(isPublicProfileUrl('https://share.firefox.dev/abc')).toBe(false);
    expect(isPublicProfileUrl('not a url')).toBe(false);
  });
});

describe('publicUrlFor', () => {
  it('replaces a from-url data source with the uploaded hash', () => {
    expect(publicUrlFor(`${FROM_URL}/`, 'abc')).toBe(
      'https://profiler.firefox.com/public/abc/'
    );
    expect(publicUrlFor(FROM_URL, 'abc')).toBe(
      'https://profiler.firefox.com/public/abc/'
    );
  });

  it('keeps the rest of the view', () => {
    expect(publicUrlFor(`${FROM_URL}/calltree/?thread=3&v=12`, 'abc')).toBe(
      'https://profiler.firefox.com/public/abc/calltree/?thread=3&v=12'
    );
  });

  it('keeps the origin it was given', () => {
    expect(
      publicUrlFor(
        `https://localhost:4242/from-url/${encodeURIComponent(ARTIFACT)}/`,
        'abc'
      )
    ).toBe('https://localhost:4242/public/abc/');
  });
});
