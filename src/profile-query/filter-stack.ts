/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Filter helpers for profiler-cli.
 *
 * The CLI's filter stack is just the Redux transform stack for a thread, so
 * there is no separate in-memory representation to track. This module provides
 * two helpers:
 *
 * - `pushSpecTransforms` — dispatches the Redux transforms that implement a
 *   SampleFilterSpec (the CLI's `filter push` DSL).
 * - `describeSpec` / `describeTransform` — human-readable descriptions. Specs
 *   come from `filter push`; transforms come from the raw Redux stack (which
 *   can include URL-loaded entries that weren't pushed by the CLI).
 */

import { addTransformToStack } from '../actions/profile-view';
import type { SampleFilterSpec } from './types';
import type { Store } from '../types/store';
import type { ThreadsKey, Transform } from 'firefox-profiler/types';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';

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
      throw assertExhaustiveCheck(spec);
  }
}

/**
 * Build a human-readable description for a single Redux transform.
 *
 * Where a transform corresponds 1:1 to a CLI filter spec (e.g. `drop-function`
 * is what `--excludes-function` pushes), use the CLI wording so `filter list`
 * matches what the user typed. For transforms the CLI never produces — only
 * URL-loaded or web-app-produced ones — fall back to the transform type.
 */
function describeSingleTransform(transform: Transform): string {
  switch (transform.type) {
    // CLI-produced transforms: use the original filter-spec wording.
    case 'drop-function':
      return `excludes function: f-${transform.funcIndex}`;
    case 'merge-function':
      return `merge: f-${transform.funcIndex}`;
    case 'focus-function':
      return `root-at: f-${transform.funcIndex}`;
    case 'filter-samples':
      switch (transform.filterType) {
        case 'marker-search':
          return `during marker matching: "${transform.filter}"`;
        case 'outside-marker':
          return `outside marker matching: "${transform.filter}"`;
        case 'function-include':
          return `includes function: f-${transform.filter.split(',').join(', f-')}`;
        case 'stack-prefix':
          return `includes prefix: f-${transform.filter.split(',').join(' → f-')}`;
        case 'stack-suffix':
          return `includes suffix: f-${transform.filter}`;
        default:
          return `filter-samples (${transform.filterType}): "${transform.filter}"`;
      }

    // URL-only / web-app transforms: generic description.
    case 'focus-subtree':
      return `focus-subtree: ${transform.callNodePath.map((f) => `f-${f}`).join(' → ')}${transform.inverted ? ' (inverted)' : ''}`;
    case 'focus-self':
      return `focus-self: f-${transform.funcIndex}`;
    case 'merge-call-node':
      return `merge-call-node: ${transform.callNodePath.map((f) => `f-${f}`).join(' → ')}`;
    case 'collapse-resource':
      return `collapse-resource: r-${transform.resourceIndex}`;
    case 'collapse-direct-recursion':
      return `collapse-direct-recursion: f-${transform.funcIndex}`;
    case 'collapse-recursion':
      return `collapse-recursion: f-${transform.funcIndex}`;
    case 'collapse-function-subtree':
      return `collapse-function-subtree: f-${transform.funcIndex}`;
    case 'focus-category':
      return `focus-category: ${transform.category}`;
    default:
      throw assertExhaustiveCheck(transform);
  }
}

/**
 * Build a human-readable description for a filter-stack entry, which may back
 * one or more Redux transforms. Multi-transform groups come from CLI specs
 * that accept a comma-separated list (e.g. `--merge f-1,f-2` dispatches two
 * merge-function transforms); render them with the spec's plural wording so
 * the display matches what the user typed.
 */
export function describeTransformGroup(transforms: Transform[]): string {
  if (transforms.length === 1) {
    return describeSingleTransform(transforms[0]);
  }
  const allSameType = transforms.every((t) => t.type === transforms[0].type);
  if (allSameType && transforms[0].type === 'drop-function') {
    const ids = (transforms as { funcIndex: number }[])
      .map((t) => `f-${t.funcIndex}`)
      .join(', ');
    return `excludes function: ${ids}`;
  }
  if (allSameType && transforms[0].type === 'merge-function') {
    const ids = (transforms as { funcIndex: number }[])
      .map((t) => `f-${t.funcIndex}`)
      .join(', ');
    return `merge: ${ids}`;
  }
  // Shouldn't happen in practice — multi-transform groups only come from the
  // two CLI specs above. Join single descriptions as a last resort.
  return transforms.map(describeSingleTransform).join('; ');
}

/**
 * Dispatch the Redux transforms for a filter spec and return the number pushed.
 * Used by `filter push` (sticky) and by ephemeral-filter application.
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
      throw assertExhaustiveCheck(spec);
  }
}
