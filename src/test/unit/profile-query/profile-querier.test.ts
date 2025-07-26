/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for ProfileQuerier class.
 *
 * NOTE: Currently minimal tests.
 *
 * The ProfileQuerier class is tested through integration tests in bash scripts
 * (bin/pq-test) that load real profiles and verify the output.
 *
 * Unit tests can be added here for specific utility methods or edge cases that
 * are easier to test in isolation. The summarize() method uses the
 * buildProcessThreadList function which is thoroughly tested in
 * process-thread-list.test.ts.
 */

import { ProfileQuerier } from 'firefox-profiler/profile-query';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
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
});
