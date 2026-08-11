/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  collectFunctionCategoryBreakdowns,
  collectThreadCategoryBreakdown,
} from '../../../profile-query/formatters/category-breakdown';
import { ThreadMap } from '../../../profile-query/thread-map';
import { getProfileFromTextSamples } from '../../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../../fixtures/stores';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { commitRange } from 'firefox-profiler/actions/profile-view';

function setup() {
  const { profile, funcNamesDictPerThread } = getProfileFromTextSamples(`
    A[cat:Layout]  A[cat:Layout]  A[cat:Layout]  A[cat:Graphics]
    B[cat:Layout]  B[cat:GC / CC]                B[cat:Graphics]
                   C[cat:GC / CC]
  `);
  const store = storeWithProfile(profile);
  return {
    store,
    threadMap: new ThreadMap(),
    threadIndexes: new Set([0]),
    funcNames: funcNamesDictPerThread[0],
  };
}

describe('collectThreadCategoryBreakdown', function () {
  it('breaks the samples in view down by category', function () {
    const { store, threadIndexes } = setup();

    const breakdown = collectThreadCategoryBreakdown(store, threadIndexes);

    expect(breakdown.totalSamples).toBe(4);
    expect(
      breakdown.categories.map(({ name, samples, percentage }) => ({
        name,
        samples,
        percentage,
      }))
    ).toEqual([
      { name: 'Layout', samples: 2, percentage: 50 },
      { name: 'GC / CC', samples: 1, percentage: 25 },
      { name: 'Graphics', samples: 1, percentage: 25 },
    ]);
  });

  it('only counts the samples inside a committed range', function () {
    const { store, threadIndexes } = setup();

    // The samples are one millisecond apart, so this keeps the first two.
    store.dispatch(commitRange(0, 1.5));

    const breakdown = collectThreadCategoryBreakdown(store, threadIndexes);

    expect(breakdown.totalSamples).toBe(2);
    expect(breakdown.categories.map(({ name }) => name)).toEqual([
      'Layout',
      'GC / CC',
    ]);
  });
});

describe('collectFunctionCategoryBreakdowns', function () {
  it('reports running and self timings matching the function list', function () {
    const { store, threadMap, threadIndexes, funcNames } = setup();

    const breakdowns = collectFunctionCategoryBreakdowns(
      store,
      threadMap,
      threadIndexes,
      funcNames.B
    );
    const nodeData = getThreadSelectors(threadIndexes)
      .getFunctionListTree(store.getState())
      .getNodeData(funcNames.B);

    expect(breakdowns.threadHandle).toBe('t-0');
    expect(breakdowns.threadSamples).toBe(4);
    expect(breakdowns.running.samples).toBe(nodeData.total);
    expect(breakdowns.self.samples).toBe(nodeData.self);
    expect(breakdowns.running.percentageOfThread).toBe(75);
    expect(breakdowns.self.percentageOfThread).toBe(50);

    expect(
      breakdowns.running.categories.map(({ name, samples }) => ({
        name,
        samples,
      }))
    ).toEqual([
      { name: 'Layout', samples: 1 },
      { name: 'GC / CC', samples: 1 },
      { name: 'Graphics', samples: 1 },
    ]);
    expect(
      breakdowns.self.categories.map(({ name, samples }) => ({
        name,
        samples,
      }))
    ).toEqual([
      { name: 'Layout', samples: 1 },
      { name: 'Graphics', samples: 1 },
    ]);
  });

  it('returns empty breakdowns for a function without samples in view', function () {
    const { store, threadMap, threadIndexes, funcNames } = setup();

    // C only appears in the second sample, which this range leaves out.
    store.dispatch(commitRange(1.5, 4));

    const breakdowns = collectFunctionCategoryBreakdowns(
      store,
      threadMap,
      threadIndexes,
      funcNames.C
    );

    const empty = {
      totalSamples: 0,
      categories: [],
      samples: 0,
      percentageOfThread: 0,
    };
    expect(breakdowns.running).toEqual(empty);
    expect(breakdowns.self).toEqual(empty);
  });
});
