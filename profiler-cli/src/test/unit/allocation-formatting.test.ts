/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  collectThreadSamples,
  collectThreadSamplesBottomUp,
  collectThreadSamplesTopDown,
  collectThreadFunctions,
  collectThreadInfo,
} from 'firefox-profiler/profile-query/formatters/thread-info';
import { getAvailableStrategies } from 'firefox-profiler/profile-query/call-tree-strategy';
import { ThreadMap } from 'firefox-profiler/profile-query/thread-map';
import { MarkerMap } from 'firefox-profiler/profile-query/marker-map';
import { TimestampManager } from 'firefox-profiler/profile-query/timestamps';
import type {
  CallTreeSummaryStrategy,
  FunctionFilterOptions,
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
import { ensureExists } from 'firefox-profiler/utils/types';
import type { CallTreeCollectionOptions } from 'firefox-profiler/profile-query/formatters/call-tree';
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

function functionsResult(
  profile: Profile,
  strategy: CallTreeSummaryStrategy,
  filterOptions?: FunctionFilterOptions
) {
  const store = createStore(profile, strategy);
  return withMockContext(
    {
      ...collectThreadFunctions(store, threadMap(), 't-0', filterOptions),
      activeOnly: true,
    },
    strategy
  );
}

function topDownResult(
  profile: Profile,
  strategy: CallTreeSummaryStrategy,
  callTreeOptions?: CallTreeCollectionOptions
) {
  const store = createStore(profile, strategy);
  return collectThreadSamplesTopDown(
    store,
    threadMap(),
    't-0',
    callTreeOptions
  );
}

function bottomUpResult(profile: Profile, strategy: CallTreeSummaryStrategy) {
  const store = createStore(profile, strategy);
  return collectThreadSamplesBottomUp(store, threadMap(), 't-0');
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

describe('negative weights from a deallocation strategy', function () {
  // The balanced fixture deallocates 3B at E, 5B at Gjs and 7B at I, for 15B.
  function deallocationProfile() {
    return getProfileWithBalancedNativeAllocations().profile;
  }

  it('orders the top functions by magnitude rather than by signed value', function () {
    const result = samplesResult(
      deallocationProfile(),
      'native-deallocations-memory'
    );

    expect(
      result.topFunctionsByTotal.slice(0, 4).map((f) => f.totalSamples)
    ).toEqual([-15, -15, -12, -12]);
    expect(
      result.topFunctionsBySelf.slice(0, 3).map((f) => f.selfSamples)
    ).toEqual([-7, -5, -3]);
  });

  it('picks the heaviest stack by magnitude', function () {
    const result = samplesResult(
      deallocationProfile(),
      'native-deallocations-memory'
    );

    expect(result.heaviestStack.selfSamples).toBe(-7);
    expect(result.heaviestStack.frames.map((f) => f.name)).toEqual([
      'A',
      'B',
      'Fjs',
      'Gjs',
      'jQuery.js!Hjs',
      'libI.so!I',
    ]);
  });

  it('applies --min-self to the magnitude', function () {
    const result = functionsResult(
      deallocationProfile(),
      'native-deallocations-memory',
      { minSelf: 30 }
    );

    expect(result.functions.map((f) => f.selfSamples)).toEqual([-7, -5]);
  });

  it('spends the call tree node budget on the heaviest magnitudes', function () {
    const result = topDownResult(
      deallocationProfile(),
      'native-deallocations-memory',
      { maxNodes: 4 }
    );

    const names = [];
    for (
      let node = result.regularCallTree.children[0];
      node !== undefined;
      node = node.children[0]
    ) {
      names.push(node.name);
    }
    // The -12B branch through Fjs, not the -3B one through C.
    expect(names).toEqual(['A', 'B', 'Fjs', 'Gjs']);

    const truncated = ensureExists(
      result.regularCallTree.children[0].children[0].childrenTruncated
    );
    expect(truncated.maxSamples).toBe(-3);
  });

  it('formats negative byte counts by magnitude so the unit survives', function () {
    const result = functionsResult(
      deallocationProfile(),
      'native-deallocations-memory'
    );
    const megabytes = {
      ...result,
      functions: result.functions.map((f) => ({
        ...f,
        selfSamples: f.selfSamples * 1e6,
        totalSamples: f.totalSamples * 1e6,
      })),
    };

    expect(formatThreadFunctionsResult(megabytes)).toContain('self: -7.00MB');
  });
});

describe('bottom-up with an allocation strategy', function () {
  it('weighs the inverted tree by the allocation table, not the timing samples', function () {
    const { profile } = getProfileWithBalancedNativeAllocations();
    const result = bottomUpResult(profile, 'native-deallocations-memory');

    const root = ensureExists(result.invertedCallTree);
    // The three matched deallocations, attributed to their allocation sites.
    expect(root.totalSamples).toBe(3 + 5 + 7);
    expect(
      root.children.map((child) => [child.name, child.selfSamples])
    ).toEqual([
      ['I', -7],
      ['Gjs', -5],
      ['E', -3],
    ]);
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
