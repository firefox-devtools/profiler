/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for the call tree summary strategy, i.e. which data source a call
 * tree summarizes: sample timing, or one of the allocation-based views.
 */

import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getLastSelectedCallTreeSummaryStrategy } from 'firefox-profiler/selectors/url-state';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { changeCallTreeSummaryStrategy } from '../actions/profile-view';
import type { State, ThreadIndex } from 'firefox-profiler/types';
import type { Store } from '../types/store';
import type { CallTreeSummaryStrategy } from './types';

export const CALL_TREE_SUMMARY_STRATEGIES: CallTreeSummaryStrategy[] = [
  'timing',
  'js-allocations',
  'native-retained-allocations',
  'native-allocations',
  'native-deallocations-memory',
  'native-deallocations-sites',
];

/**
 * Set the call tree summary strategy around a computation, then restore the
 * previous value. `fn` must be synchronous: the store is shared across a
 * daemon's connections, so the mutated window has to close before any other
 * command can observe it.
 */
export function withCallTreeSummaryStrategy<T>(
  store: Store,
  strategy: CallTreeSummaryStrategy | undefined,
  fn: () => T
): T {
  const previous = getLastSelectedCallTreeSummaryStrategy(store.getState());
  if (strategy === undefined || strategy === previous) {
    return fn();
  }
  store.dispatch(changeCallTreeSummaryStrategy(strategy));
  try {
    return fn();
  } finally {
    store.dispatch(changeCallTreeSummaryStrategy(previous));
  }
}

/**
 * Retained memory and deallocated memory need to pair each deallocation with its
 * allocation, which is only possible when the allocations carry memory addresses.
 */
export function getAvailableStrategies(
  state: State,
  threadIndexes: Set<ThreadIndex>
): CallTreeSummaryStrategy[] {
  const threadSelectors = getThreadSelectors(threadIndexes);
  const hasTiming = threadSelectors.getHasUsefulTimingSamples(state);
  const hasJsAllocations = threadSelectors.getHasUsefulJsAllocations(state);
  const hasNativeAllocations =
    threadSelectors.getHasUsefulNativeAllocations(state);
  const canShowRetainedMemory = threadSelectors.getCanShowRetainedMemory(state);

  return CALL_TREE_SUMMARY_STRATEGIES.filter((strategy) => {
    switch (strategy) {
      case 'timing':
        return hasTiming;
      case 'js-allocations':
        return hasJsAllocations;
      case 'native-allocations':
      case 'native-deallocations-sites':
        return hasNativeAllocations;
      case 'native-retained-allocations':
      case 'native-deallocations-memory':
        return canShowRetainedMemory;
      default:
        throw assertExhaustiveCheck(
          strategy,
          'Unhandled call tree summary strategy.'
        );
    }
  });
}
