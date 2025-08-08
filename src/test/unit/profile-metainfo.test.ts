/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import {
  formatProductAndVersion,
  formatPlatform,
} from 'firefox-profiler/profile-logic/profile-metainfo';

import { getEmptyProfile } from '../../profile-logic/data-structures';
import type { ProfileMeta } from 'firefox-profiler/types';

describe('profile-metainfo', () => {
  function setup(metaOverride: Partial<ProfileMeta>) {
    const profile = getEmptyProfile();
    Object.assign(profile.meta, metaOverride);
    return profile;
  }

  describe('formatProductAndVersion', () => {
    it('can format Firefox releases', () => {
      const profile = setup({
        product: 'Firefox',
        misc: 'rv:61.0',
      });

      expect(formatProductAndVersion(profile.meta)).toBe('Firefox 61');
    });

    it('can format Firefox ESR releases', () => {
      const profile = setup({
        product: 'Firefox',
        misc: 'rv:61.15',
      });

      expect(formatProductAndVersion(profile.meta)).toBe('Firefox 61.15');
    });

    it('can format Firefox chemspill versions', () => {
      const profile = setup({
        product: 'Firefox',
        misc: 'rv:61.0.5',
      });

      expect(formatProductAndVersion(profile.meta)).toBe('Firefox 61.0.5');
    });

    it('can format Fenix versions', () => {
      const profile = setup({
        product: 'Firefox Preview',
        misc: 'rv:77.0',
      });
      expect(formatProductAndVersion(profile.meta)).toBe('Firefox Preview 77');
    });
  });

  describe('formatPlatform', () => {
    it('can format MacOS information', () => {
      const profile = setup({
        oscpu: 'Intel Mac OS X 10.14',
        platform: 'Macintosh',
        toolkit: 'cocoa',
      });
      expect(formatPlatform(profile.meta)).toBe('macOS 10.14');
    });

    it('can format Windows information', () => {
      const profile = setup({
        oscpu: 'Windows NT 10.0; Win64; x64',
        platform: 'Windows',
        toolkit: 'windows',
      });
      expect(formatPlatform(profile.meta)).toBe('Windows 10');
    });

    it('can format Linux information', () => {
      const profile = setup({
        oscpu: 'Linux x86_64',
        platform: 'X11',
        toolkit: 'gtk',
      });
      expect(formatPlatform(profile.meta)).toBe('Linux');
    });

    it('can format Android information', () => {
      const profile = setup({
        oscpu: 'Linux armv7l',
        platform: 'Android 7.0',
        toolkit: 'android',
      });
      expect(formatPlatform(profile.meta)).toBe('Android 7');
    });
  });
});
