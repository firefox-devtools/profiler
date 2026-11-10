/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Helpers for the call tree summary strategy, i.e. which data source a call
 * tree summarizes: sample timing, or one of the allocation-based views.
 */

import { getLastSelectedCallTreeSummaryStrategy } from 'firefox-profiler/selectors/url-state';
import { changeCallTreeSummaryStrategy } from '../actions/profile-view';
import type { Store } from '../types/store';
import type { CallTreeSummaryStrategy } from './types';

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
