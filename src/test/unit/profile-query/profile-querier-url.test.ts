/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ProfileQuerier } from 'firefox-profiler/profile-query';
import { INTERVAL } from 'firefox-profiler/app-logic/constants';
import { serializeProfileToJsonString } from 'firefox-profiler/profile-logic/process-profile';
import {
  addRawMarkersToThread,
  getProfileFromTextSamples,
} from '../../fixtures/profiles/processed-profile';

const PROFILE_URL = 'https://example.com/profile.json';
const PROFILER_URL = `https://profiler.firefox.com/from-url/${encodeURIComponent(PROFILE_URL)}`;

describe('ProfileQuerier URL view state', function () {
  beforeEach(function () {
    // The loader logs its progress for the CLI, silence it here.
    jest.spyOn(console, 'log').mockImplementation(() => {});

    const samples = `
      1000  1010  1020
      A     A     A
      B     B     C
    `;
    const { profile } = getProfileFromTextSamples(samples, samples);
    profile.meta.symbolicated = true;
    addRawMarkersToThread(profile.threads[0], profile.shared, [
      {
        name: 'Test marker',
        startTime: 1010,
        endTime: 1015,
        phase: INTERVAL,
      },
    ]);
    window.fetchMock.get(PROFILE_URL, serializeProfileToJsonString(profile));
  });

  async function loadWithSearch() {
    return ProfileQuerier.load(
      `${PROFILER_URL}/calltree/?search=B&range=0m21&thread=0&v=17`
    );
  }

  it('reports imported search in status, filters, and sample queries', async function () {
    const querier = await loadWithSearch();
    expect((await querier.getStatus()).callTreeSearch).toBe('B');
    expect(querier.filterList().callTreeSearch).toBe('B');
    const samples = await querier.threadSamples('t-0', true);
    expect(samples.search).toBe('B');
    expect(samples.context.callTreeSearch).toBe('B');
    expect(samples.categoryBreakdown.totalSamples).toBe(2);
    expect(
      (await querier.threadFunctions('t-0', undefined, true)).context
        .callTreeSearch
    ).toBe('B');
    expect(
      new URL((await querier.permalink()).url).searchParams.get('search')
    ).toBe('B');
  });

  it('clears imported search even when the transform stack is empty', async function () {
    const querier = await loadWithSearch();
    expect(querier.filterList().filters).toEqual([]);
    expect(querier.filterClear().message).toBe('Cleared 1 filter(s)');
    expect((await querier.getStatus()).callTreeSearch).toBeUndefined();
    expect(querier.filterList().callTreeSearch).toBeUndefined();
    const samples = await querier.threadSamples('t-0', true);
    expect(samples.search).toBeUndefined();
    expect(samples.context.callTreeSearch).toBeUndefined();
    expect(samples.categoryBreakdown.totalSamples).toBe(3);
    expect(
      (await querier.threadSamplesTopDown('t-0', undefined, true))
        .regularCallTree.totalSamples
    ).toBe(3);
    expect(
      (await querier.threadSamplesBottomUp('t-0', undefined, true))
        .invertedCallTree?.totalSamples
    ).toBe(3);
    expect(
      (await querier.threadFunctions('t-0', undefined, true)).functions.map(
        (f) => f.name
      )
    ).toContain('C');
    expect(
      new URL((await querier.permalink()).url).searchParams.has('search')
    ).toBe(false);
  });

  it('temporarily overrides imported search without changing the session', async function () {
    const querier = await loadWithSearch();
    const samples = await querier.threadSamples('t-0', true, 'C');
    expect(samples.categoryBreakdown.totalSamples).toBe(1);
    expect(samples.search).toBe('C');
    expect(samples.context.callTreeSearch).toBe('C');
    expect((await querier.getStatus()).callTreeSearch).toBe('B');
    expect(
      (await querier.threadSamples('t-0', true)).categoryBreakdown.totalSamples
    ).toBe(2);
  });

  it('pops thread transforms while retaining the session search', async function () {
    const querier = await loadWithSearch();
    const pushed = querier.filterPush({ type: 'merge', funcIndexes: [0] });
    expect(pushed.callTreeSearch).toBe('B');
    expect(pushed.filters).toHaveLength(1);
    const popped = querier.filterPop();
    expect(popped.callTreeSearch).toBe('B');
    expect(popped.filters).toEqual([]);
    expect(
      (await querier.threadSamples('t-0', true)).categoryBreakdown.totalSamples
    ).toBe(2);
  });

  it('clears global search and only the specified thread transforms', async function () {
    const querier = await loadWithSearch();
    querier.filterPush({ type: 'merge', funcIndexes: [0] }, 't-0');
    querier.filterPush({ type: 'merge', funcIndexes: [0] }, 't-1');
    expect(
      (await querier.threadSamples('t-1', true)).categoryBreakdown.totalSamples
    ).toBe(2);
    expect(querier.filterClear('t-1').message).toBe('Cleared 2 filter(s)');
    expect(querier.filterList('t-1').filters).toEqual([]);
    expect(querier.filterList('t-0').filters).toHaveLength(1);
    expect(
      (await querier.threadSamples('t-0', true)).categoryBreakdown.totalSamples
    ).toBe(3);
    expect(
      (await querier.threadSamples('t-1', true)).categoryBreakdown.totalSamples
    ).toBe(3);
  });

  it('gives the same sample queries for raw URLs and marker-selection links', async function () {
    const raw = await ProfileQuerier.load(PROFILE_URL);
    const linked = await ProfileQuerier.load(
      `${PROFILER_URL}/marker-table/?marker=0&thread=0&v=17`
    );
    for (const querier of [raw, linked]) {
      await querier.threadSelect('t-0');
      await querier.pushViewRange('5ms,21ms');
    }
    const samples = await raw.threadSamples('t-0', true);
    expect(samples.categoryBreakdown.totalSamples).toBe(2);
    expect(samples.context.currentViewRange).toEqual(
      expect.objectContaining({ start: 1005, end: 1021 })
    );
    expect(await linked.threadSamples('t-0', true)).toEqual(samples);
    expect(await linked.threadSamplesTopDown('t-0', undefined, true)).toEqual(
      await raw.threadSamplesTopDown('t-0', undefined, true)
    );
    expect(await linked.threadSamplesBottomUp('t-0', undefined, true)).toEqual(
      await raw.threadSamplesBottomUp('t-0', undefined, true)
    );
    expect(await linked.threadFunctions('t-0', undefined, true)).toEqual(
      await raw.threadFunctions('t-0', undefined, true)
    );
  });
});
