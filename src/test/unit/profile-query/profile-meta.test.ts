/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { collectProfileMeta } from 'firefox-profiler/profile-query/formatters/profile-meta';
import {
  formatProductAndVersion,
  formatPlatform,
} from 'firefox-profiler/profile-logic/profile-metainfo';
import { getProfile } from 'firefox-profiler/selectors/profile';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import type { Profile } from 'firefox-profiler/types';

// Build a store from a profile whose `meta` has been enriched in-place.
function storeFromMeta(mutate: (profile: Profile) => void) {
  const { profile } = getProfileFromTextSamples(`
    A  A  A
    B  B  B
  `);
  mutate(profile);
  return storeWithProfile(profile);
}

describe('collectProfileMeta', function () {
  it('collects a full Firefox recording meta', function () {
    const store = storeFromMeta((profile) => {
      Object.assign(profile.meta, {
        interval: 1,
        startTime: 1_000_000,
        endTime: 1_000_000 + 5000,
        profilingStartTime: 34_000,
        profilingEndTime: 39_200,
        processType: 0,
        product: 'Firefox',
        misc: 'rv:130.0',
        oscpu: 'Intel Mac OS X 14.6',
        toolkit: 'cocoa',
        platform: 'Macintosh',
        abi: 'aarch64-gcc3',
        CPUName: 'Apple M1 Max',
        physicalCPUs: 10,
        logicalCPUs: 10,
        mainMemory: 34_359_738_368,
        symbolicated: true,
        updateChannel: 'nightly',
        appBuildID: '20240902143034',
        sourceURL: 'https://hg.mozilla.org/mozilla-central/rev/abc',
        debug: false,
        extensions: {
          length: 2,
          baseURL: [
            'moz-extension://uuid-ublock/',
            'moz-extension://uuid-1password/',
          ],
          id: ['uBlock0@raymondhill.net', '1password@agilebits.com'],
          name: ['uBlock Origin', '1Password'],
        },
        configuration: {
          threads: ['GeckoMain', 'Compositor'],
          features: ['js', 'stackwalk'],
          capacity: 1_000_000,
          duration: 20,
        },
        extra: [
          {
            label: 'Environment',
            entries: [
              { label: 'Hostname', format: 'string', value: 'my-host' },
              { label: 'CPU count', format: 'integer', value: 8 },
            ],
          },
        ],
      });
    });

    const result = collectProfileMeta(store);

    expect(result.type).toBe('profile-meta');

    // Recording.
    expect(result.interval).toBe(1);
    // startTime is adjusted by profilingStartTime.
    expect(result.startTime).toBe(1_000_000 + 34_000);
    expect(result.startTimeFormatted).toBe(
      new Date(1_000_000 + 34_000).toISOString()
    );
    expect(result.endTime).toBe(1_005_000);
    expect(result.endTimeFormatted).toBe(new Date(1_005_000).toISOString());
    // durationMs = profilingEndTime - profilingStartTime.
    expect(result.durationMs).toBe(5200);
    expect(result.symbolicated).toBe(true);
    // capacity is in entries of 8 bytes each.
    expect(result.bufferCapacityBytes).toBe(8_000_000);
    expect(result.bufferDuration).toBe(20);
    expect(result.features).toEqual(['js', 'stackwalk']);
    expect(result.threadsFilter).toEqual(['GeckoMain', 'Compositor']);

    // Application.
    expect(result.product).toBe('Firefox');
    expect(result.productAndVersion).toBe(
      formatProductAndVersion(getProfile(store.getState()).meta)
    );
    expect(result.productAndVersion).toBe('Firefox 130');
    expect(result.uptimeMs).toBe(34_000);
    expect(result.appBuildID).toBe('20240902143034');
    expect(result.sourceURL).toBe(
      'https://hg.mozilla.org/mozilla-central/rev/abc'
    );
    expect(result.updateChannel).toBe('nightly');
    expect(result.debug).toBe(false);
    // Extensions come out sorted by name as {name, id, baseURL}.
    expect(result.extensions).toEqual([
      {
        name: '1Password',
        id: '1password@agilebits.com',
        baseURL: 'moz-extension://uuid-1password/',
      },
      {
        name: 'uBlock Origin',
        id: 'uBlock0@raymondhill.net',
        baseURL: 'moz-extension://uuid-ublock/',
      },
    ]);

    // Platform.
    expect(result.platform).toBe(
      formatPlatform(getProfile(store.getState()).meta)
    );
    expect(result.platform).toBe('macOS 14.6');
    expect(result.oscpu).toBe('Intel Mac OS X 14.6');
    expect(result.abi).toBe('aarch64-gcc3');
    expect(result.cpuName).toBe('Apple M1 Max');
    expect(result.physicalCPUs).toBe(10);
    expect(result.logicalCPUs).toBe(10);
    expect(result.mainMemoryBytes).toBe(34_359_738_368);

    // Extra sections carry raw value and formatted string.
    expect(result.extra).toEqual([
      {
        label: 'Environment',
        entries: [
          { label: 'Hostname', value: 'my-host', formatted: 'my-host' },
          { label: 'CPU count', value: 8, formatted: '8' },
        ],
      },
    ]);
  });

  it('omits absent fields for a sparse (imported) profile', function () {
    const store = storeFromMeta((profile) => {
      const { meta } = profile;
      // Simulate an imported-profile shape.
      delete meta.extensions;
      delete meta.configuration;
      delete meta.oscpu;
      delete meta.profilingStartTime;
      delete meta.profilingEndTime;
      delete meta.extra;
      delete meta.endTime;
      delete meta.symbolicated;
      Object.assign(meta, {
        interval: 1,
        startTime: 1_700_000_000_000,
        product: 'Google Chrome',
        importedFrom: 'Chrome Trace',
      });
    });

    const result = collectProfileMeta(store);

    expect(result.product).toBe('Google Chrome');
    expect(result.importedFrom).toBe('Chrome Trace');
    // Raw startTime is used when profilingStartTime is absent.
    expect(result.startTime).toBe(1_700_000_000_000);

    // Absent fields are omitted entirely (not undefined/NaN).
    expect('durationMs' in result).toBe(false);
    expect('endTime' in result).toBe(false);
    expect('bufferCapacityBytes' in result).toBe(false);
    expect('features' in result).toBe(false);
    expect('threadsFilter' in result).toBe(false);
    expect('extensions' in result).toBe(false);
    expect('uptimeMs' in result).toBe(false);
    expect('oscpu' in result).toBe(false);
    expect('symbolicated' in result).toBe(false);
    expect('extra' in result).toBe(false);
  });
});
