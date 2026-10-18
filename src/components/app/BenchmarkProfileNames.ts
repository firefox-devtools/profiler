/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createContext, useContext } from 'react';

/**
 * What the two sides of a benchmark comparison are called.
 *
 * `base` is the reference: every Δ and every percentage in the report is
 * `new` measured against it, and every sentence is phrased as what happens to
 * `base` if it behaved like `new`.
 */
export type BenchmarkProfileNames = { base: string; new: string };

/**
 * What the two sides are called when the URL doesn't say.
 *
 * The view started out as a before-patch / after-patch tool and its wording was
 * baked in accordingly, but the same comparison is just as useful for Chrome vs
 * Firefox or Release vs Nightly. Everything user-visible now goes through these
 * names, so the only thing that is still specific to the patch workflow is what
 * they default to.
 */
export const DEFAULT_BENCHMARK_PROFILE_NAMES = ['Baseline', 'New'];

/**
 * What to call the profile at `index` when the URL doesn't say.
 *
 * The first two keep the before/after names the view started with, since that is
 * still what two profiles usually are. A third has no such story -- nobody
 * compares a "New (2)" -- so it is numbered.
 */
export function defaultBenchmarkProfileName(index: number): string {
  return DEFAULT_BENCHMARK_PROFILE_NAMES[index] ?? `Profile ${index + 1}`;
}

/**
 * Fill in the blanks in a list of names from the URL, and make sure no two of
 * them are the same.
 *
 * Names arrive from an editable query parameter, so they can be missing, empty,
 * or (if someone hand-edits the URL, or compares two runs of the same build)
 * duplicated. The last case matters more than it looks: a report that says
 * "Firefox is 3% slower than Firefox" is unreadable, and with more than two
 * profiles a collision also makes the controls that pick between them by name
 * ambiguous. So a repeat is numbered rather than passed through.
 */
export function resolveBenchmarkProfileNameList(
  names: string[] | null,
  count: number
): string[] {
  const resolved: string[] = [];
  const taken = new Set<string>();
  for (let i = 0; i < count; i++) {
    const wanted = names?.[i]?.trim() || defaultBenchmarkProfileName(i);
    let name = wanted;
    // "Firefox", "Firefox (2)", "Firefox (3)" -- and if the URL itself already
    // says "Firefox (2)", the next one skips past it rather than colliding.
    for (let n = 2; taken.has(name); n++) {
      name = `${wanted} (${n})`;
    }
    taken.add(name);
    resolved.push(name);
  }
  return resolved;
}

/** The two sides of one comparison, by their positions in the profile list. */
export function benchmarkProfileNamePair(
  allNames: string[],
  baseIndex: number,
  newIndex: number
): BenchmarkProfileNames {
  return { base: allNames[baseIndex], new: allNames[newIndex] };
}

/** The names of a two-profile comparison, straight from the URL's list. */
export function resolveBenchmarkProfileNames(
  names: string[] | null
): BenchmarkProfileNames {
  return benchmarkProfileNamePair(
    resolveBenchmarkProfileNameList(names, 2),
    0,
    1
  );
}

/**
 * The names, supplied once at the top of the report.
 *
 * Passed by context rather than by prop because every level of the report needs
 * them -- the column headers, each verdict cell, the counterfactual sentences,
 * the flame-graph panels -- and threading them through four layers of table
 * components would swamp the props that actually differ per row.
 */
export const BenchmarkProfileNamesContext =
  createContext<BenchmarkProfileNames>(resolveBenchmarkProfileNames(null));

export function useBenchmarkProfileNames(): BenchmarkProfileNames {
  return useContext(BenchmarkProfileNamesContext);
}
