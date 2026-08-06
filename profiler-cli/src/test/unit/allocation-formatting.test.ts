/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  collectThreadSamples,
  collectThreadFunctions,
  collectThreadInfo,
} from 'firefox-profiler/profile-query/formatters/thread-info';
import { getAvailableStrategies } from 'firefox-profiler/profile-query/call-tree-strategy';
import { ThreadMap } from 'firefox-profiler/profile-query/thread-map';
import { MarkerMap } from 'firefox-profiler/profile-query/marker-map';
import { TimestampManager } from 'firefox-profiler/profile-query/timestamps';
import type {
  CallTreeSummaryStrategy,
  SessionContext,
  WithContext,
} from 'firefox-profiler/profile-query/types';
import {
  getProfileFromTextSamples,
  getProfileWithJsAllocations,
  getProfileWithUnbalancedNativeAllocations,
  getProfileWithBalancedNativeAllocations,
} from 'firefox-profiler/test/fixtures/profiles/processed-profile';
import { storeWithProfile } from 'firefox-profiler/test/fixtures/stores';
import { changeCallTreeSummaryStrategy } from 'firefox-profiler/actions/profile-view';
import type { Profile } from 'firefox-profiler/types';
import type { Store } from 'firefox-profiler/types/store';
import {
  formatThreadSamplesResult,
  formatThreadFunctionsResult,
  formatThreadInfoResult,
} from '../../formatters';

function createStore(
  profile: Profile,
  strategy: CallTreeSummaryStrategy
): Store {
  const store = storeWithProfile(profile);
  store.dispatch(changeCallTreeSummaryStrategy(strategy));
  return store;
}

function threadMap(): ThreadMap {
  const map = new ThreadMap();
  map.handleForThreadIndex(0);
  return map;
}

function mockContext(strategy: CallTreeSummaryStrategy): SessionContext {
  return {
    selectedThreadHandle: 't-0',
    selectedThreads: [{ threadIndex: 0, name: 'Test Thread' }],
    currentViewRange: null,
    rootRange: { start: 0, end: 1000 },
    callTreeSummaryStrategy: strategy,
  };
}

function withMockContext<T>(
  result: T,
  strategy: CallTreeSummaryStrategy
): WithContext<T> {
  return { ...result, context: mockContext(strategy) };
}

function samplesResult(profile: Profile, strategy: CallTreeSummaryStrategy) {
  const store = createStore(profile, strategy);
  return withMockContext(
    { ...collectThreadSamples(store, threadMap(), 't-0'), activeOnly: true },
    strategy
  );
}

function functionsResult(profile: Profile, strategy: CallTreeSummaryStrategy) {
  const store = createStore(profile, strategy);
  return withMockContext(
    { ...collectThreadFunctions(store, threadMap(), 't-0'), activeOnly: true },
    strategy
  );
}

function availableStrategiesFor(profile: Profile): CallTreeSummaryStrategy[] {
  const store = storeWithProfile(profile);
  return getAvailableStrategies(store.getState(), new Set([0]));
}

describe('available strategies', function () {
  it('lists only timing for a profile without allocations', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      B
    `);
    expect(availableStrategiesFor(profile)).toEqual(['timing']);
  });

  it('lists js-allocations for a profile with JS allocations', function () {
    const { profile } = getProfileWithJsAllocations();
    expect(availableStrategiesFor(profile)).toEqual([
      'timing',
      'js-allocations',
    ]);
  });

  it('omits the memory-address strategies for unbalanced native allocations', function () {
    const { profile } = getProfileWithUnbalancedNativeAllocations();
    expect(availableStrategiesFor(profile)).toEqual([
      'timing',
      'native-allocations',
      'native-deallocations-sites',
    ]);
  });

  it('lists every native strategy for balanced native allocations', function () {
    const { profile } = getProfileWithBalancedNativeAllocations();
    expect(availableStrategiesFor(profile)).toEqual([
      'timing',
      'native-retained-allocations',
      'native-allocations',
      'native-deallocations-memory',
      'native-deallocations-sites',
    ]);
  });

  it('reports the available strategies in thread info output', function () {
    const { profile } = getProfileWithJsAllocations();
    const store = storeWithProfile(profile);
    const result = withMockContext(
      collectThreadInfo(
        store,
        new TimestampManager({ start: 0, end: 1000 }),
        threadMap(),
        new MarkerMap(),
        't-0'
      ),
      'timing'
    );
    expect(result.availableStrategies).toEqual(['timing', 'js-allocations']);
    expect(formatThreadInfoResult(result)).toContain(
      'Data sources: timing, js-allocations'
    );
  });
});

describe('samples formatting with an allocation strategy', function () {
  it('reports bytes rather than sample counts', function () {
    const { profile } = getProfileWithJsAllocations();
    const result = samplesResult(profile, 'js-allocations');

    expect(result.weightType).toBe('bytes');

    const formatted = formatThreadSamplesResult(result);
    expect(formatted).toContain('Data source: js-allocations');
    expect(formatted).toContain('Top Functions (by total bytes)');
    expect(formatted).toContain('Top Functions (by self bytes)');
    // The fixture allocates 3B at E, 5B at Gjs and 7B at I, for 15B total.
    expect(formatted).toContain('A - total: 15B (100.0%)');
    expect(formatted).toContain('I - self: 7B (46.7%)');
    expect(formatted).toMatchSnapshot();
  });

  it('drops the idle-samples note, which has no meaning for allocations', function () {
    const { profile } = getProfileWithJsAllocations();
    const timing = formatThreadSamplesResult(samplesResult(profile, 'timing'));
    const allocations = formatThreadSamplesResult(
      samplesResult(profile, 'js-allocations')
    );

    expect(timing).toContain('active samples only (idle excluded)');
    expect(allocations).not.toContain('active samples only');
  });

  it('reports negative byte totals for a deallocation strategy', function () {
    const { profile } = getProfileWithBalancedNativeAllocations();
    const result = samplesResult(profile, 'native-deallocations-sites');

    expect(result.weightType).toBe('bytes');
    expect(result.topFunctionsByTotal[0].totalSamples).toBeLessThan(0);
    expect(formatThreadSamplesResult(result)).toContain(
      'Data source: native-deallocations-sites'
    );
  });

  it('attributes retained memory only to allocations that were never freed', function () {
    const { profile } = getProfileWithBalancedNativeAllocations();
    const retained = samplesResult(profile, 'native-retained-allocations');
    const allocated = samplesResult(profile, 'native-allocations');

    expect(retained.topFunctionsByTotal[0].totalSamples).toBeLessThan(
      allocated.topFunctionsByTotal[0].totalSamples
    );
  });
});

describe('functions formatting with an allocation strategy', function () {
  it('reports bytes rather than sample counts', function () {
    const { profile } = getProfileWithJsAllocations();
    const result = functionsResult(profile, 'js-allocations');

    expect(result.weightType).toBe('bytes');

    const formatted = formatThreadFunctionsResult(result);
    expect(formatted).toContain('Data source: js-allocations');
    expect(formatted).toContain('Functions (by self bytes)');
    expect(formatted).toContain('self: 7B');
    expect(formatted).toMatchSnapshot();
  });

  it('keeps sample counts under the timing strategy', function () {
    const { profile } = getProfileWithJsAllocations();
    const result = functionsResult(profile, 'timing');

    expect(result.weightType).toBe('samples');

    const formatted = formatThreadFunctionsResult(result);
    expect(formatted).toContain('Functions (by self time)');
    expect(formatted).not.toContain('Data source:');
  });
});
