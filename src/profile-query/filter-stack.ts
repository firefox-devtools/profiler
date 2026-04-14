/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * FilterStack manages the per-thread sample filter stacks for the profiler-cli CLI.
 *
 * Each thread (identified by its ThreadsKey) has an independent stack of filter
 * entries. Each entry corresponds to one `profiler-cli filter push` invocation and may
 * have dispatched one or more Redux transforms to the store.
 *
 * Popping entries removes both the in-memory records and the corresponding Redux
 * transforms, using the POP_TRANSFORMS_FROM_STACK action.
 */

import { getTransformStack } from '../selectors/url-state';
import { addTransformToStack } from '../actions/profile-view';
import type { SampleFilterSpec, FilterEntry } from './types';
import type { Store } from '../types/store';
import type { ThreadsKey } from 'firefox-profiler/types';

/**
 * Build a human-readable description for a filter spec.
 */
export function describeSpec(spec: SampleFilterSpec): string {
  switch (spec.type) {
    case 'excludes-function':
      return `excludes function: f-${spec.funcIndexes.join(', f-')}`;
    case 'merge':
      return `merge: f-${spec.funcIndexes.join(', f-')}`;
    case 'root-at':
      return `root-at: f-${spec.funcIndex}`;
    case 'during-marker':
      return `during marker matching: "${spec.searchString}"`;
    case 'includes-function':
      return `includes function: f-${spec.funcIndexes.join(', f-')}`;
    case 'includes-prefix':
      return `includes prefix: f-${spec.funcIndexes.join(' → f-')}`;
    case 'includes-suffix':
      return `includes suffix: f-${spec.funcIndex}`;
    case 'outside-marker':
      return `outside marker matching: "${spec.searchString}"`;
    default:
      throw new Error(
        `Unhandled filter spec type: ${(spec as SampleFilterSpec).type}`
      );
  }
}

/**
 * Push the Redux transforms for a filter spec and return the number pushed.
 * Exported so the ProfileQuerier can use it for ephemeral (non-tracked) filters.
 */
export function pushSpecTransforms(
  store: Store,
  threadsKey: ThreadsKey,
  spec: SampleFilterSpec
): number {
  switch (spec.type) {
    case 'excludes-function': {
      for (const funcIndex of spec.funcIndexes) {
        store.dispatch(
          addTransformToStack(threadsKey, { type: 'drop-function', funcIndex })
        );
      }
      return spec.funcIndexes.length;
    }
    case 'merge': {
      for (const funcIndex of spec.funcIndexes) {
        store.dispatch(
          addTransformToStack(threadsKey, { type: 'merge-function', funcIndex })
        );
      }
      return spec.funcIndexes.length;
    }
    case 'root-at': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'focus-function',
          funcIndex: spec.funcIndex,
        })
      );
      return 1;
    }
    case 'during-marker': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'filter-samples',
          filterType: 'marker-search',
          filter: spec.searchString,
        })
      );
      return 1;
    }
    case 'includes-function': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'filter-samples',
          filterType: 'function-include',
          filter: spec.funcIndexes.join(','),
        })
      );
      return 1;
    }
    case 'includes-prefix': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'filter-samples',
          filterType: 'stack-prefix',
          filter: spec.funcIndexes.join(','),
        })
      );
      return 1;
    }
    case 'includes-suffix': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'filter-samples',
          filterType: 'stack-suffix',
          filter: String(spec.funcIndex),
        })
      );
      return 1;
    }
    case 'outside-marker': {
      store.dispatch(
        addTransformToStack(threadsKey, {
          type: 'filter-samples',
          filterType: 'outside-marker',
          filter: spec.searchString,
        })
      );
      return 1;
    }
    default:
      throw new Error(
        `Unhandled filter spec type: ${(spec as SampleFilterSpec).type}`
      );
  }
}

export class FilterStack {
  /** Per-thread filter entries. Key is the ThreadsKey. */
  private _stacks: Map<ThreadsKey, FilterEntry[]> = new Map();

  /**
   * Push a new filter entry for the given thread.
   * Dispatches the necessary Redux transforms immediately.
   */
  push(
    store: Store,
    threadsKey: ThreadsKey,
    spec: SampleFilterSpec
  ): FilterEntry {
    const entries = this._getOrCreate(threadsKey);
    const reduxTransformCount = pushSpecTransforms(store, threadsKey, spec);
    const entry: FilterEntry = {
      index: entries.length + 1,
      spec,
      description: describeSpec(spec),
      reduxTransformCount,
    };
    entries.push(entry);
    return entry;
  }

  /**
   * Pop the last `count` filter entries for the given thread.
   * Dispatches POP_TRANSFORMS_FROM_STACK to remove the corresponding Redux transforms.
   * Returns the removed entries (most recent first).
   */
  pop(store: Store, threadsKey: ThreadsKey, count: number = 1): FilterEntry[] {
    const entries = this._getOrCreate(threadsKey);
    if (count <= 0 || entries.length === 0) {
      return [];
    }
    const actualCount = Math.min(count, entries.length);
    const removed = entries.splice(entries.length - actualCount, actualCount);

    // Compute how many Redux transforms need to be popped.
    const totalReduxPops = removed.reduce(
      (sum, e) => sum + e.reduxTransformCount,
      0
    );
    if (totalReduxPops > 0) {
      const state = store.getState();
      const currentLength = getTransformStack(state, threadsKey).length;
      store.dispatch({
        type: 'POP_TRANSFORMS_FROM_STACK',
        threadsKey,
        firstPoppedFilterIndex: currentLength - totalReduxPops,
      });
    }

    return removed.reverse();
  }

  /**
   * Clear all filter entries for the given thread.
   */
  clear(store: Store, threadsKey: ThreadsKey): FilterEntry[] {
    const entries = this._getOrCreate(threadsKey);
    const count = entries.length;
    if (count === 0) {
      return [];
    }
    return this.pop(store, threadsKey, count);
  }

  /**
   * Return all filter entries for the given thread (a snapshot, not live reference).
   */
  list(threadsKey: ThreadsKey): FilterEntry[] {
    return [...(this._stacks.get(threadsKey) ?? [])];
  }

  /**
   * Return all thread keys that have at least one active filter.
   */
  activeThreadsKeys(): ThreadsKey[] {
    return Array.from(this._stacks.entries())
      .filter(([, entries]) => entries.length > 0)
      .map(([key]) => key);
  }

  private _getOrCreate(threadsKey: ThreadsKey): FilterEntry[] {
    let entries = this._stacks.get(threadsKey);
    if (entries === undefined) {
      entries = [];
      this._stacks.set(threadsKey, entries);
    }
    return entries;
  }
}
