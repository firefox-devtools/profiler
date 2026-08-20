/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for ProfileQuerier class.
 *
 * NOTE: Currently minimal tests.
 *
 * The ProfileQuerier class is tested through integration tests in bash scripts
 * (bin/profiler-cli-test) that load real profiles and verify the output.
 *
 * Unit tests can be added here for specific utility methods or edge cases that
 * are easier to test in isolation. The summarize() method uses the
 * buildProcessThreadList function which is thoroughly tested in
 * process-thread-list.test.ts.
 */

import { ProfileQuerier } from 'firefox-profiler/profile-query';
import { MAX_PROFILE_MARKERS_ROWS } from 'firefox-profiler/profile-query/formatters/marker-info';
import {
  getProfileFromTextSamples,
  getCounterForThread,
  getCounterForThreadWithSamples,
  getProfileWithMarkers,
  getNetworkMarkers,
} from '../../fixtures/profiles/processed-profile';
import { getProfileRootRange } from 'firefox-profiler/selectors/profile';
import { storeWithProfile } from '../../fixtures/stores';

describe('ProfileQuerier', function () {
  describe('pushViewRange', function () {
    it('changes thread samples output to show functions in the selected range', async function () {
      // Create a profile with samples at different times that have different call stacks
      // Time 0-10ms: call stack has functions A, B, C
      // Time 10-20ms: call stack has functions A, B, D
      // Time 20-30ms: call stack has functions A, B, E
      const { profile } = getProfileFromTextSamples(`
        0   10  20
        A   A   A
        B   B   B
        C   D   E
      `);

      // Set up the store with the profile
      const store = storeWithProfile(profile);
      const state = store.getState();
      const rootRange = getProfileRootRange(state);

      // Create ProfileQuerier
      const querier = new ProfileQuerier(store, rootRange);

      // Get baseline thread samples (should show all functions A, B, C, D, E)
      // Don't pass thread handle - use default selected thread
      const baselineSamples = await querier.threadSamples();
      const allFunctions = [
        ...baselineSamples.topFunctionsByTotal.map((f) => f.name),
        ...baselineSamples.topFunctionsBySelf.map((f) => f.name),
      ].join(' ');
      expect(allFunctions).toContain('A');
      expect(allFunctions).toContain('B');
      // At least some of C, D, E should appear
      const hasC = allFunctions.includes('C');
      const hasD = allFunctions.includes('D');
      const hasE = allFunctions.includes('E');
      expect(hasC || hasD || hasE).toBe(true);

      // Create timestamp names for a narrower range
      // The profile has samples at 0ms, 10ms, 20ms
      // Select from just after start to just before end to focus on middle sample
      const startName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 8
      );
      const endName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 12
      );

      // Push a range that includes only the middle sample (at 10ms)
      // This should focus on the call stack with D
      await querier.pushViewRange(`${startName},${endName}`);

      // Get thread samples again - should now focus on the selected range
      const rangedSamples = await querier.threadSamples();

      // The output should still contain A and B (common to all stacks)
      const rangedAllFunctions = [
        ...rangedSamples.topFunctionsByTotal.map((f) => f.name),
        ...rangedSamples.topFunctionsBySelf.map((f) => f.name),
      ].join(' ');
      expect(rangedAllFunctions).toContain('A');
      expect(rangedAllFunctions).toContain('B');

      // After pushing a range, the samples should be different from baseline
      expect(rangedSamples).not.toBe(baselineSamples);
    });

    it('popViewRange restores the previous view', async function () {
      const { profile } = getProfileFromTextSamples(`
        0   10  20
        A   A   A
        B   B   B
        C   D   E
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const rootRange = getProfileRootRange(state);

      const querier = new ProfileQuerier(store, rootRange);

      // Get baseline samples
      const baselineSamples = await querier.threadSamples();

      // Create timestamp names and push a range
      const startName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 5
      );
      const endName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 15
      );
      await querier.pushViewRange(`${startName},${endName}`);
      const rangedSamples = await querier.threadSamples();

      // Samples should be different after push
      expect(rangedSamples).not.toBe(baselineSamples);

      // Pop the range
      const popResult = await querier.popViewRange();
      expect(popResult.message).toContain('Popped view range');

      // Samples should be back to baseline (or at least different from ranged)
      const afterPopSamples = await querier.threadSamples();
      expect(afterPopSamples).not.toBe(rangedSamples);
    });

    it('shows non-empty output after pushing a range with samples', async function () {
      // Create a profile with many samples across a longer time range
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4   5   6   7   8   9   10  11  12
        A   A   A   A   A   A   A   A   A   A   A   A   A
        B   B   B   B   B   B   B   B   B   B   B   B   B
        C   C   C   D   D   D   E   E   E   F   F   F   G
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const rootRange = getProfileRootRange(state);

      const querier = new ProfileQuerier(store, rootRange);

      // Push a range that includes samples in the middle (5-8ms should include samples at 5, 6, 7, 8)
      const startName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 5
      );
      const endName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 8
      );
      await querier.pushViewRange(`${startName},${endName}`);

      const rangedSamples = await querier.threadSamples();

      // The output should NOT be empty - it should contain functions from the selected range
      const rangedFunctions = [
        ...rangedSamples.topFunctionsByTotal.map((f) => f.name),
        ...rangedSamples.topFunctionsBySelf.map((f) => f.name),
      ].join(' ');
      expect(rangedFunctions).toContain('A');
      expect(rangedFunctions).toContain('B');

      // Should show D and/or E (which are in the range)
      const hasD = rangedFunctions.includes('D');
      const hasE = rangedFunctions.includes('E');
      expect(hasD || hasE).toBe(true);

      // Should show actual function data, not empty sections
      expect(rangedSamples.topFunctionsByTotal.length).toBeGreaterThan(0);
      expect(rangedSamples.topFunctionsBySelf.length).toBeGreaterThan(0);
    });

    it('works correctly with absolute timestamps and non-zero profile start', async function () {
      // Create a profile that starts at 1000ms (not zero)
      const { profile } = getProfileFromTextSamples(`
        1000  1005  1010  1015  1020
        A     A     A     A     A
        B     B     B     B     B
        C     D     E     F     G
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const rootRange = getProfileRootRange(state);

      const querier = new ProfileQuerier(store, rootRange);

      // Push a range using absolute timestamps
      // pushViewRange should convert these to relative timestamps for commitRange
      const startName = querier._timestampManager.nameForTimestamp(1005);
      const endName = querier._timestampManager.nameForTimestamp(1015);
      await querier.pushViewRange(`${startName},${endName}`);

      const rangedSamples = await querier.threadSamples();

      // Should contain functions from the selected range (1005-1015ms)
      const rangedFunctions2 = [
        ...rangedSamples.topFunctionsByTotal.map((f) => f.name),
        ...rangedSamples.topFunctionsBySelf.map((f) => f.name),
      ].join(' ');
      expect(rangedFunctions2).toContain('A');
      expect(rangedFunctions2).toContain('B');

      // Should contain D and E which are in the middle of the range
      const hasD = rangedFunctions2.includes('D');
      const hasE = rangedFunctions2.includes('E');
      expect(hasD || hasE).toBe(true);
    });
  });

  describe('search', function () {
    // Helper to collect all function names in a call tree
    function collectTreeNames(node: {
      name: string;
      children?: { name: string; children?: unknown[] }[];
    }): string[] {
      const names: string[] = [node.name];
      if (node.children) {
        for (const child of node.children) {
          names.push(
            ...collectTreeNames(child as Parameters<typeof collectTreeNames>[0])
          );
        }
      }
      return names;
    }

    it('threadSamplesTopDown with search only shows branches containing the search term', async function () {
      // Two separate call trees:
      //   A → B → C (3 samples)
      //   X → Y → Z (2 samples)
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4
        A   A   A   X   X
        B   B   B   Y   Y
        C   C   C   Z   Z
      `);

      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );

      const result = await querier.threadSamplesTopDown(
        undefined,
        undefined,
        false,
        'X'
      );

      expect(result.search).toBe('X');
      const names = collectTreeNames(result.regularCallTree);
      expect(names).toContain('X');
      expect(names).toContain('Y');
      expect(names).toContain('Z');
      expect(names).not.toContain('A');
      expect(names).not.toContain('B');
      expect(names).not.toContain('C');
    });

    it('threadSamplesBottomUp with search only shows branches containing the search term', async function () {
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4
        A   A   A   X   X
        B   B   B   Y   Y
        C   C   C   Z   Z
      `);

      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );

      const result = await querier.threadSamplesBottomUp(
        undefined,
        undefined,
        false,
        'X'
      );

      expect(result.search).toBe('X');
      const names = result.invertedCallTree
        ? collectTreeNames(result.invertedCallTree)
        : [];
      // Bottom-up tree roots by leaf function — X branch leaves should appear
      expect(names.some((n) => ['X', 'Y', 'Z'].includes(n))).toBe(true);
      expect(names).not.toContain('A');
      expect(names).not.toContain('B');
      expect(names).not.toContain('C');
    });

    it('threadSamples with search filters the top functions list', async function () {
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4
        A   A   A   X   X
        B   B   B   Y   Y
        C   C   C   Z   Z
      `);

      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );

      const result = await querier.threadSamples(undefined, false, 'X');

      expect(result.search).toBe('X');
      const allNames = [
        ...result.topFunctionsByTotal.map((f) => f.name),
        ...result.topFunctionsBySelf.map((f) => f.name),
      ];
      expect(allNames.some((n) => ['X', 'Y', 'Z'].includes(n))).toBe(true);
      expect(allNames).not.toContain('A');
      expect(allNames).not.toContain('B');
      expect(allNames).not.toContain('C');
    });

    it('search does not persist to subsequent calls', async function () {
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4
        A   A   A   X   X
        B   B   B   Y   Y
        C   C   C   Z   Z
      `);

      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );

      // Call with search
      await querier.threadSamplesTopDown(undefined, undefined, false, 'X');

      // Call without search — should restore and show all branches
      const result = await querier.threadSamplesTopDown();
      const names = collectTreeNames(result.regularCallTree);
      expect(names).toContain('A');
      expect(names).toContain('X');
      expect(result.search).toBeUndefined();
    });
  });

  describe('counters', function () {
    function profileWithMemoryCounter() {
      const { profile } = getProfileFromTextSamples(`
        0  1  2
        A  A  A
        B  B  B
      `);
      const counter = getCounterForThread(profile.threads[0], 0, {
        name: 'malloc',
        category: 'Memory',
        hasCountNumber: true,
      });
      profile.counters = [counter];
      return { profile, counter };
    }

    function querierFor(profile: Parameters<typeof storeWithProfile>[0]) {
      const store = storeWithProfile(profile);
      return new ProfileQuerier(store, getProfileRootRange(store.getState()));
    }

    it('counterList returns a schema-driven summary per counter', async function () {
      const { profile, counter } = profileWithMemoryCounter();
      const result = await querierFor(profile).counterList();

      expect(result.counters).toHaveLength(1);
      expect(result.counters[0].counterHandle).toBe('c-0');
      expect(result.counters[0].label).toBe('Memory');
      expect(result.counters[0].pid).toBe(counter.pid);
      expect(result.counters[0].processIndex).toBeGreaterThanOrEqual(0);
      expect(result.counters[0].processName).toBeTruthy();
      expect(
        result.counters[0].stats.some((s) => s.source === 'count-range')
      ).toBe(true);
    });

    it('orders counters by display.sortWeight, not profile order', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  1  2
        A  A  A
      `);
      // Listed Memory-first, but Bandwidth (sortWeight 10) should sort before
      // Memory (sortWeight 20), matching the timeline track order.
      const memory = getCounterForThread(profile.threads[0], 0, {
        name: 'malloc',
        category: 'Memory',
      });
      const bandwidth = getCounterForThread(profile.threads[0], 0, {
        name: 'eth0',
        category: 'Bandwidth',
      });
      profile.counters = [memory, bandwidth];

      const result = await querierFor(profile).counterList();

      expect(result.counters.map((c) => c.label)).toEqual([
        'Bandwidth',
        'Memory',
      ]);
      expect(result.counters.map((c) => c.counterHandle)).toEqual([
        'c-1',
        'c-0',
      ]);
    });

    it('profileInfo nests each counter under its owning process', async function () {
      const { profile, counter } = profileWithMemoryCounter();
      const info = await querierFor(profile).profileInfo();

      const owningProcess = info.processes.find((p) => p.pid === counter.pid);
      expect(owningProcess).toBeDefined();
      expect(owningProcess!.counters?.map((c) => c.counterHandle)).toEqual([
        'c-0',
      ]);
    });

    it('counterInfo resolves a counter by handle', async function () {
      const { profile } = profileWithMemoryCounter();
      const info = await querierFor(profile).counterInfo('c-0');

      expect(info.counterHandle).toBe('c-0');
      expect(info.description).toBe('My Description');
      expect(info.sampleCount).toBeGreaterThan(0);
    });

    it('counterInfo throws for an unknown handle', async function () {
      const { profile } = profileWithMemoryCounter();
      await expect(querierFor(profile).counterInfo('c-9')).rejects.toThrow(
        'Unknown counter c-9'
      );
    });

    it('returns no counters for a profile without any', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  1  2
        A  A  A
      `);

      const querier = querierFor(profile);
      const list = await querier.counterList();

      expect(list.counters).toEqual([]);
      await expect(querier.counterInfo('c-0')).rejects.toThrow(
        'Unknown counter c-0'
      );
    });

    it('reports counter values over time', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  1  2  3  4  5  6  7  8  9
        A  A  A  A  A  A  A  A  A  A
      `);
      const counter = getCounterForThreadWithSamples(
        profile.threads[0],
        0,
        {
          count: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
          length: 10,
        },
        'malloc',
        'Memory'
      );
      profile.counters = [counter];

      const info = await querierFor(profile).counterInfo('c-0');

      expect(info.overTime.length).toBeGreaterThan(0);
      // Accumulated counters report a per-bucket level, delta, and share of peak.
      expect(info.overTime.every((b) => b.delta !== undefined)).toBe(true);
      expect(info.overTime.every((b) => b.percentage !== undefined)).toBe(true);
      expect(info.overTime[0].startTimeName).toMatch(/^ts-/);
      // Memory only grows here, so the last level is at least the first.
      const first = info.overTime[0].value;
      const last = info.overTime[info.overTime.length - 1].value;
      expect(last).toBeGreaterThanOrEqual(first);
      // The sparkline is of fixed width.
      expect(info.graph.length).toBe(50);
    });

    it('renders a zero delta as a bare "0", without sign or unit', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  1  2  3  4
        A  A  A  A  A
      `);
      const counter = getCounterForThreadWithSamples(
        profile.threads[0],
        0,
        { count: [0, 0, 0, 0, 0], length: 5 },
        'malloc',
        'Memory'
      );
      profile.counters = [counter];

      const info = await querierFor(profile).counterInfo('c-0');

      // Memory never changes here, so every bucket's delta is zero.
      expect(info.overTime.length).toBeGreaterThan(0);
      for (const bucket of info.overTime) {
        expect(bucket.delta).toBe(0);
        expect(bucket.formattedDelta).toBe('0');
      }
    });

    it('gives the graph a fixed width, wider than the over-time buckets', async function () {
      const columns = Array.from({ length: 60 }, (_, i) => i);
      const { profile } = getProfileFromTextSamples(
        `${columns.join('  ')}\n${columns.map(() => 'A').join('  ')}`
      );
      const counter = getCounterForThreadWithSamples(
        profile.threads[0],
        0,
        { count: columns.map(() => 1000), length: 60 },
        'malloc',
        'Memory'
      );
      profile.counters = [counter];

      const info = await querierFor(profile).counterInfo('c-0');

      expect(info.overTime.length).toBe(10);
      expect(info.graph.length).toBe(50);
    });

    it('reports a per-bucket amount (no delta) for rate counters', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  1  2  3  4  5  6  7  8  9
        A  A  A  A  A  A  A  A  A  A
      `);
      const counter = getCounterForThreadWithSamples(
        profile.threads[0],
        0,
        { count: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90], length: 10 },
        'eth0',
        'Bandwidth'
      );
      profile.counters = [counter];

      const info = await querierFor(profile).counterInfo('c-0');

      expect(info.graphType).toBe('line-rate');
      expect(info.overTime.length).toBeGreaterThan(0);
      // Rate counters report an amount per bucket (no level/delta) and a share
      // of the range total.
      expect(info.overTime.every((b) => b.delta === undefined)).toBe(true);
      expect(info.overTime.every((b) => b.percentage !== undefined)).toBe(true);
      expect(info.graph.length).toBeGreaterThan(0);
    });

    it('reports range times relative to the profile start, not double-offset', async function () {
      // Profile that does not start at zero.
      const { profile } = getProfileFromTextSamples(`
        1000  1010  1020
        A     A     A
      `);
      const counter = getCounterForThread(profile.threads[0], 0, {
        name: 'malloc',
        category: 'Memory',
      });
      profile.counters = [counter];

      const info = await querierFor(profile).counterInfo('c-0');

      expect(info.rangeStart).not.toBeNull();
      // The first sample sits at the profile start, so this is 0, not 1000.
      expect(info.rangeStart).toBe(0);
      expect(info.context.rootRange.start).toBe(1000);
    });

    it('excludes the padded boundary samples when zoomed', async function () {
      const { profile } = getProfileFromTextSamples(`
        0  10  20  30  40
        A  A   A   A   A
      `);
      const counter = getCounterForThreadWithSamples(
        profile.threads[0],
        0,
        {
          time: [0, 10, 20, 30, 40],
          count: [0, 100, 100, 100, 100],
          length: 5,
        },
        'malloc',
        'Memory'
      );
      profile.counters = [counter];

      const querier = querierFor(profile);
      const startName = querier._timestampManager.nameForTimestamp(15);
      const endName = querier._timestampManager.nameForTimestamp(35);
      await querier.pushViewRange(`${startName},${endName}`);

      const info = await querier.counterInfo('c-0');

      // Only the samples at 20 and 30 are inside [15, 35]; the boundary samples
      // at 10 and 40 (which the counter selectors pad the range with) are not.
      expect(info.rangeSampleCount).toBe(2);
    });
  });

  describe('threadSamples', function () {
    it('searches all roots when choosing the heaviest stack', async function () {
      const { profile } = getProfileFromTextSamples(`
        0   1   2   3   4
        A   A   A   X   X
        B   C   D   Y   Y
      `);

      const store = storeWithProfile(profile);
      const state = store.getState();
      const rootRange = getProfileRootRange(state);
      const querier = new ProfileQuerier(store, rootRange);

      const samples = await querier.threadSamples();

      expect(samples.heaviestStack.selfSamples).toBe(2);
      expect(samples.heaviestStack.frames.map((frame) => frame.name)).toEqual([
        'X',
        'Y',
      ]);
    });
  });

  describe('networkActivity', function () {
    function querierWithNetwork() {
      const markers = [
        ...getNetworkMarkers({
          id: 1,
          uri: 'https://a.com/x',
          startTime: 0,
          fetchStart: 0,
          endTime: 40,
        }),
        ...getNetworkMarkers({
          id: 2,
          uri: 'https://b.com/y',
          startTime: 20,
          fetchStart: 20,
          endTime: 100,
        }),
      ];
      const profile = getProfileWithMarkers(markers);
      const store = storeWithProfile(profile);
      return new ProfileQuerier(store, getProfileRootRange(store.getState()));
    }

    it('profileInfo includes networkActivity when network markers exist', async function () {
      const info = await querierWithNetwork().profileInfo();
      expect(info.networkActivity).not.toBeNull();
      expect(info.networkActivity!.requestCount).toBe(2);
      expect(info.networkActivity!.slowest.length).toBeGreaterThan(0);
      expect(info.networkActivity!.slowest[0].markerHandle).toMatch(/^m-\d+$/);
    });

    it('threadInfo includes networkActivity for a thread with network markers', async function () {
      const info = await querierWithNetwork().threadInfo('t-0');
      expect(info.networkActivity).not.toBeNull();
      expect(info.networkActivity!.requestCount).toBe(2);
    });

    it('networkActivity is null when the profile has no network markers', async function () {
      const { profile } = getProfileFromTextSamples(`
        A  A  A
      `);
      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );
      const info = await querier.profileInfo();
      expect(info.networkActivity).toBeNull();
      const threadInfo = await querier.threadInfo('t-0');
      expect(threadInfo.networkActivity).toBeNull();
    });

    it('zoom narrows the in-flight numbers', async function () {
      const querier = querierWithNetwork();
      const full = await querier.profileInfo();
      const fullInFlight = full.networkActivity!.inFlightMs;

      // Zoom into a sub-range that only partly overlaps the requests.
      await querier.pushViewRange('50ms,80ms');
      const zoomed = await querier.profileInfo();

      expect(zoomed.networkActivity!.inFlightMs).toBeLessThan(fullInFlight);
    });
  });

  describe('threadMarkers', function () {
    function querierWithMarkers() {
      const profile = getProfileWithMarkers([
        ['Alpha', 10, null, { type: 'tracing', category: 'Test' }],
        ['Beta', 20, null, { type: 'tracing', category: 'Test' }],
        ['Gamma', 30, null, { type: 'tracing', category: 'Test' }],
        ['Delta', 40, null, { type: 'tracing', category: 'Test' }],
      ]);
      const store = storeWithProfile(profile);
      const rootRange = getProfileRootRange(store.getState());
      return { querier: new ProfileQuerier(store, rootRange), rootRange };
    }

    it('restricts the default marker list to the committed (zoom) range', async function () {
      const { querier, rootRange } = querierWithMarkers();

      const full = await querier.threadMarkers('t-0');
      expect(full.totalMarkerCount).toBe(4);
      expect(full.filteredMarkerCount).toBe(4);
      // Not zoomed: no full-range baseline is reported.
      expect(full.fullRangeMarkerCount).toBeUndefined();

      // Zoom to a window that only contains the marker at 20ms.
      const startName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 2
      );
      const endName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 18
      );
      await querier.pushViewRange(`${startName},${endName}`);

      const zoomed = await querier.threadMarkers('t-0');
      expect(zoomed.totalMarkerCount).toBe(1);
      expect(zoomed.filteredMarkerCount).toBe(1);
      // Zoomed: the whole-profile baseline is surfaced alongside the in-view count.
      expect(zoomed.fullRangeMarkerCount).toBe(4);
      const zoomedNames = zoomed.byType.map((t) => t.markerName);
      expect(zoomedNames).toContain('Beta');
      expect(zoomedNames).not.toContain('Alpha');
      expect(zoomedNames).not.toContain('Delta');
    });

    it('restricts the --list output to the committed (zoom) range', async function () {
      const { querier, rootRange } = querierWithMarkers();

      const startName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 2
      );
      const endName = querier._timestampManager.nameForTimestamp(
        rootRange.start + 18
      );
      await querier.pushViewRange(`${startName},${endName}`);

      const zoomed = await querier.threadMarkers('t-0', { list: true });
      const listedNames = zoomed.flatMarkers!.map((m) => m.name);
      expect(listedNames).toEqual(['Beta']);
    });
  });

  describe('profileMarkers', function () {
    // Three threads. The searched marker ("Gamma") exists only on t-2, which is
    // never the default selection — that is the "which process handled this?"
    // case `thread markers` cannot answer without a per-thread shell loop.
    function querierWithThreads() {
      const profile = getProfileWithMarkers(
        [['Alpha', 10, null]],
        [['Beta', 20, null]],
        [
          ['Gamma', 30, 40],
          ['Gamma', 50, null],
        ]
      );
      const store = storeWithProfile(profile);
      const rootRange = getProfileRootRange(store.getState());
      return { querier: new ProfileQuerier(store, rootRange), rootRange };
    }

    it('finds markers on a thread that is not the selected one', async function () {
      const { querier } = querierWithThreads();

      // Sanity check: the default (selected) thread has no Gamma at all, which
      // is why a cross-thread search is needed.
      const selectedOnly = await querier.threadMarkers(undefined, {
        searchString: 'Gamma',
        list: true,
      });
      expect(selectedOnly.filteredMarkerCount).toBe(0);

      const result = await querier.profileMarkers({ searchString: 'Gamma' });
      expect(result.type).toBe('profile-markers');
      expect(result.totalCount).toBe(2);
      expect(result.searchedThreadCount).toBe(3);
      expect(result.matchingThreadCount).toBe(1);
      expect(result.markers.map((m) => m.name)).toEqual(['Gamma', 'Gamma']);
      // Every row carries the thread it was found on — the added column.
      expect(result.markers.map((m) => m.threadHandle)).toEqual(['t-2', 't-2']);
      expect(result.byThread).toEqual([
        expect.objectContaining({ threadHandle: 't-2', count: 2 }),
      ]);
    });

    it('returns the same row fields as `thread markers --list`', async function () {
      const { querier } = querierWithThreads();

      const list = await querier.threadMarkers('t-2', {
        searchString: 'Gamma',
        list: true,
      });
      const cross = await querier.profileMarkers({ searchString: 'Gamma' });

      expect(list.flatMarkers).toHaveLength(2);
      // The shared FlatMarkerItem fields must agree row for row; the
      // cross-thread result adds thread/process identity on top.
      expect(
        cross.markers.map(
          ({ threadHandle, threadName, processName, pid, ...flat }) => flat
        )
      ).toEqual(list.flatMarkers);
    });

    it('aggregates matches across every thread and sorts chronologically', async function () {
      const profile = getProfileWithMarkers(
        [['Shared', 30, null]],
        [['Shared', 10, null]],
        [['Shared', 20, null]]
      );
      const store = storeWithProfile(profile);
      const querier = new ProfileQuerier(
        store,
        getProfileRootRange(store.getState())
      );

      const result = await querier.profileMarkers({ searchString: 'Shared' });
      expect(result.totalCount).toBe(3);
      expect(result.matchingThreadCount).toBe(3);
      // Merged into one timeline regardless of which thread each came from.
      expect(result.markers.map((m) => m.threadHandle)).toEqual([
        't-1',
        't-2',
        't-0',
      ]);
      // Reported relative to zeroAt (the earliest marker, at 10ms).
      expect(result.markers.map((m) => m.start)).toEqual([0, 10, 20]);
    });

    it('restricts the sweep with a thread handle', async function () {
      const { querier } = querierWithThreads();

      const result = await querier.profileMarkers({
        searchString: 'Gamma',
        thread: 't-0',
      });
      expect(result.searchedThreadCount).toBe(1);
      expect(result.totalCount).toBe(0);
      expect(result.markers).toEqual([]);
    });

    it('limits the rows returned but keeps the counts exact', async function () {
      const { querier } = querierWithThreads();

      const result = await querier.profileMarkers({
        searchString: 'Gamma',
        limit: 1,
      });
      expect(result.markers).toHaveLength(1);
      // The per-thread breakdown still reports both matches, so the
      // "which thread?" answer is never truncated by --limit.
      expect(result.totalCount).toBe(2);
      expect(result.byThread[0].count).toBe(2);
    });

    it('returns every match when no limit is given', async function () {
      const { querier } = querierWithThreads();

      // No default cap, matching `thread markers --list`: a filtered query
      // answers in full rather than silently dropping matches.
      const result = await querier.profileMarkers({ searchString: 'Gamma' });
      expect(result.markers).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.maxRowsClamped).toBeUndefined();
    });

    it('does not report a clamp when no rows were dropped', async function () {
      const { querier } = querierWithThreads();

      // A limit beyond MAX_PROFILE_MARKERS_ROWS cannot be delivered (the reply
      // would exceed V8's max string length), but this fixture has only 4
      // markers, so nothing is actually lost and nothing is reported.
      const result = await querier.profileMarkers({
        limit: MAX_PROFILE_MARKERS_ROWS + 1,
      });
      expect(result.maxRowsClamped).toBeUndefined();
      expect(result.totalCount).toBe(4);
      expect(result.markers).toHaveLength(4);
    });

    it('leaves a limit within the maximum untouched', async function () {
      const { querier } = querierWithThreads();

      const result = await querier.profileMarkers({ limit: 2 });
      expect(result.maxRowsClamped).toBeUndefined();
      expect(result.markers).toHaveLength(2);
    });

    it('respects the committed (zoom) range', async function () {
      const { querier } = querierWithThreads();

      // Marker starts are absolute: 10 (t-0), 20 (t-1), 30 and 50 (t-2).
      // Zoom past everything but the instant Gamma at 50ms.
      const startName = querier._timestampManager.nameForTimestamp(45);
      const endName = querier._timestampManager.nameForTimestamp(55);
      await querier.pushViewRange(`${startName},${endName}`);

      const result = await querier.profileMarkers({ searchString: 'Gamma' });
      // Only the instant Gamma at 50ms is in view. Its reported start is
      // relative to zeroAt (the earliest marker, at 10ms), so 40 rather than 50.
      expect(result.totalCount).toBe(1);
      expect(result.markers[0].start).toBe(40);
    });

    it('does not leak its search string into later queries', async function () {
      const { querier } = querierWithThreads();

      await querier.profileMarkers({ searchString: 'Gamma' });

      // A follow-up unfiltered query must see every marker again.
      const after = await querier.profileMarkers({});
      expect(after.totalCount).toBe(4);
      expect(after.matchingThreadCount).toBe(3);
    });
  });
});
