/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared argument parsing utilities for profiler-cli commands.
 */

import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import type { SampleFilterSpec } from '../protocol';

/**
 * Accumulator for Commander repeated options (--flag a --flag b -> ['a', 'b']).
 */
export function collectStrings(val: string, prev: string[]): string[] {
  return [...prev, val];
}

/**
 * Parse a comma-separated list of function handles (e.g. "f-1,f-2") into numeric indexes.
 */
export function parseFuncList(value: string): number[] {
  return value.split(',').map((s) => {
    const m = /^f-(\d+)$/.exec(s.trim());
    if (!m) {
      console.error(
        `Error: invalid function handle "${s.trim()}" (expected f-<N>)`
      );
      process.exit(1);
    }
    return parseInt(m[1], 10);
  });
}

/**
 * Options bag produced by Commander for commands that support ephemeral sample filters.
 * Keys are camelCase because Commander normalises hyphenated option names.
 */
export interface EphemeralFilterOpts {
  excludesFunction?: string[];
  merge?: string[];
  rootAt?: string[];
  includesFunction?: string[];
  includesPrefix?: string[];
  includesSuffix?: string[];
  duringMarker?: boolean;
  outsideMarker?: boolean;
  search?: string;
}

/**
 * Parse zero or more ephemeral SampleFilterSpecs from CLI options.
 * Multiple flags are collected in order; each produces one spec.
 * The same flag may be repeated (e.g. --merge f-1 --merge f-2) to apply it multiple times.
 */
export function parseEphemeralFilters(
  opts: EphemeralFilterOpts
): SampleFilterSpec[] {
  const specs: SampleFilterSpec[] = [];

  for (const v of opts.excludesFunction ?? []) {
    specs.push({ type: 'excludes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of opts.merge ?? []) {
    specs.push({ type: 'merge', funcIndexes: parseFuncList(v) });
  }
  for (const v of opts.rootAt ?? []) {
    const indexes = parseFuncList(v);
    if (indexes.length !== 1) {
      console.error('Error: --root-at takes exactly one function handle');
      process.exit(1);
    }
    specs.push({ type: 'root-at', funcIndex: indexes[0] });
  }
  for (const v of opts.includesFunction ?? []) {
    specs.push({ type: 'includes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of opts.includesPrefix ?? []) {
    specs.push({ type: 'includes-prefix', funcIndexes: parseFuncList(v) });
  }
  for (const v of opts.includesSuffix ?? []) {
    const indexes = parseFuncList(v);
    if (indexes.length !== 1) {
      console.error(
        'Error: --includes-suffix takes exactly one function handle'
      );
      process.exit(1);
    }
    specs.push({ type: 'includes-suffix', funcIndex: indexes[0] });
  }
  if (opts.duringMarker === true) {
    if (!opts.search) {
      console.error('Error: --during-marker requires --search <text>');
      process.exit(1);
    }
    specs.push({ type: 'during-marker', searchString: opts.search });
  }
  if (opts.outsideMarker === true) {
    if (!opts.search) {
      console.error('Error: --outside-marker requires --search <text>');
      process.exit(1);
    }
    specs.push({ type: 'outside-marker', searchString: opts.search });
  }

  return specs;
}

/**
 * Parse exactly one SampleFilterSpec from CLI options for `profiler-cli filter push`.
 * Exactly one filter flag must be provided.
 */
export function parseFilterSpec(opts: EphemeralFilterOpts): SampleFilterSpec {
  const valueFlags = [
    'excludesFunction',
    'merge',
    'rootAt',
    'includesFunction',
    'includesPrefix',
    'includesSuffix',
  ] as const;
  const markerFlags = ['duringMarker', 'outsideMarker'] as const;

  const activeValueFlags = valueFlags.filter(
    (f) => opts[f] !== undefined && (opts[f] as string[]).length > 0
  );
  const activeMarkerFlags = markerFlags.filter((f) => opts[f] === true);
  const totalActive = activeValueFlags.length + activeMarkerFlags.length;

  if (totalActive === 0) {
    const allFlags = [
      '--excludes-function',
      '--merge',
      '--root-at',
      '--includes-function',
      '--includes-prefix',
      '--includes-suffix',
      '--during-marker',
      '--outside-marker',
    ];
    console.error('Error: filter push requires one of: ' + allFlags.join(', '));
    process.exit(1);
  }
  if (totalActive > 1) {
    console.error('Error: filter push accepts only one filter flag per push');
    process.exit(1);
  }

  if (activeValueFlags.length > 0) {
    const flag = activeValueFlags[0];
    const values = opts[flag] as string[];
    // Each repeated flag produces one entry; for filter push there should be exactly one value
    const value = values[0];

    switch (flag) {
      case 'excludesFunction':
        return { type: 'excludes-function', funcIndexes: parseFuncList(value) };
      case 'merge':
        return { type: 'merge', funcIndexes: parseFuncList(value) };
      case 'rootAt': {
        const indexes = parseFuncList(value);
        if (indexes.length !== 1) {
          console.error('Error: --root-at takes exactly one function handle');
          process.exit(1);
        }
        return { type: 'root-at', funcIndex: indexes[0] };
      }
      case 'includesFunction':
        return { type: 'includes-function', funcIndexes: parseFuncList(value) };
      case 'includesPrefix':
        return { type: 'includes-prefix', funcIndexes: parseFuncList(value) };
      case 'includesSuffix': {
        const indexes = parseFuncList(value);
        if (indexes.length !== 1) {
          console.error(
            'Error: --includes-suffix takes exactly one function handle'
          );
          process.exit(1);
        }
        return { type: 'includes-suffix', funcIndex: indexes[0] };
      }
      default:
        throw assertExhaustiveCheck(flag);
    }
  }

  // Marker flags
  if (opts.duringMarker === true) {
    if (!opts.search) {
      console.error('Error: --during-marker requires --search <text>');
      process.exit(1);
    }
    return { type: 'during-marker', searchString: opts.search };
  }
  if (opts.outsideMarker === true) {
    if (!opts.search) {
      console.error('Error: --outside-marker requires --search <text>');
      process.exit(1);
    }
    return { type: 'outside-marker', searchString: opts.search };
  }

  // Should not be reachable.
  console.error('Error: no valid filter flag found');
  process.exit(1);
  throw new Error('unreachable');
}
