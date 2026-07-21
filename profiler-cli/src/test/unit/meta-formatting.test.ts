/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { formatProfileMetaResult } from '../../formatters';
import type {
  ProfileMetaResult,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';

function createContext(): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'GeckoMain' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 3000 },
  };
}

function withContext(meta: ProfileMetaResult): WithContext<ProfileMetaResult> {
  return { ...meta, context: createContext() };
}

describe('formatProfileMetaResult', function () {
  it('renders a full Firefox recording grouped into sections', function () {
    const result = withContext({
      type: 'profile-meta',
      startTime: 1_725_287_700_000,
      startTimeFormatted: '2024-09-02T14:35:00.000Z',
      durationMs: 5200,
      endTime: 1_725_287_710_000,
      endTimeFormatted: '2024-09-02T14:35:10.000Z',
      interval: 1,
      symbolicated: true,
      bufferCapacityBytes: 8_000_000,
      bufferDuration: 20,
      features: ['js', 'stackwalk'],
      threadsFilter: ['GeckoMain'],
      product: 'Firefox',
      productAndVersion: 'Firefox 130',
      uptimeMs: 34_000,
      appBuildID: '20240902143034',
      updateChannel: 'nightly',
      debug: false,
      extensions: [
        { name: 'uBlock Origin', id: 'uBlock0@raymondhill.net' },
        { name: '1Password', id: '1password@agilebits.com' },
      ],
      platform: 'macOS 14.6',
      abi: 'aarch64-gcc3',
      cpuName: 'Apple M1 Max',
      physicalCPUs: 10,
      logicalCPUs: 10,
      mainMemoryBytes: 34_359_738_368,
    });

    const output = formatProfileMetaResult(result);

    expect(output).toContain('Recording:');
    expect(output).toContain('Started: 2024-09-02T14:35:00.000Z');
    expect(output).toContain('Main process ended: 2024-09-02T14:35:10.000Z');
    expect(output).toContain('Sampling interval: 1ms');
    expect(output).toContain('Buffer capacity: 8MB');
    expect(output).toContain('Symbolicated: yes');
    expect(output).toContain('Features: js, stackwalk');

    expect(output).toContain('Application:');
    expect(output).toContain('Name: Firefox 130 (build 20240902143034)');
    expect(output).toContain('Update channel: nightly');
    expect(output).toContain('Build type: opt');
    expect(output).toContain('Extensions (2): uBlock Origin, 1Password');

    expect(output).toContain('Platform:');
    expect(output).toContain('OS: macOS 14.6 (aarch64-gcc3)');
    expect(output).toContain(
      'CPU: Apple M1 Max (10 physical, 10 logical cores)'
    );
    expect(output).toContain('Memory: 34.4GB');

    expect(output).toMatchSnapshot();
  });

  it('renders a sparse imported profile, skipping absent sections', function () {
    const result = withContext({
      type: 'profile-meta',
      interval: 1,
      product: 'Google Chrome',
      productAndVersion: 'Google Chrome',
      importedFrom: 'Chrome Trace',
      fileName: 'trace.json',
      fileSize: 2_500_000,
    });

    const output = formatProfileMetaResult(result);

    expect(output).toContain('Recording:');
    expect(output).toContain('Sampling interval: 1ms');
    expect(output).toContain('Application:');
    expect(output).toContain('Name: Google Chrome');
    expect(output).toContain('Import:');
    expect(output).toContain('Imported from: Chrome Trace');
    expect(output).toContain('File name: trace.json');
    expect(output).toContain('File size: 2.50MB');

    // No platform data, so the Platform section is omitted.
    expect(output).not.toContain('Platform:');

    expect(output).toMatchSnapshot();
  });

  it('formats the interval in bytes for size profiles', function () {
    const result = withContext({
      type: 'profile-meta',
      interval: 65536,
      product: 'Firefox',
      sampleUnits: {
        time: 'bytes',
        eventDelay: 'ms',
        threadCPUDelta: 'variable CPU cycles',
      },
    });

    const output = formatProfileMetaResult(result);
    expect(output).toContain('Sampling interval: 65.5KB');
  });

  it('renders extra importer sections as their own heading blocks', function () {
    const result = withContext({
      type: 'profile-meta',
      interval: 1,
      product: 'perf',
      extra: [
        {
          label: 'System',
          entries: [
            { label: 'Kernel', value: '6.1.0', formatted: '6.1.0' },
            { label: 'CPUs', value: 16, formatted: '16' },
          ],
        },
      ],
    });

    const output = formatProfileMetaResult(result);
    expect(output).toContain('System:');
    expect(output).toContain('Kernel: 6.1.0');
    expect(output).toContain('CPUs: 16');

    expect(output).toMatchSnapshot();
  });
});
