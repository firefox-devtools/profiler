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
 * Fill in the blanks in a pair of names from the URL.
 *
 * Names arrive from an editable query parameter, so they can be missing, empty,
 * or (if someone hand-edits the URL) duplicated. The last case matters more than
 * it looks: a whole report that says "Firefox is 3% slower than Firefox" is
 * unreadable, so a collision is broken by number rather than passed through.
 */
export function resolveBenchmarkProfileNames(
  names: string[] | null
): BenchmarkProfileNames {
  const resolve = (i: number) =>
    names?.[i]?.trim() || DEFAULT_BENCHMARK_PROFILE_NAMES[i];
  const base = resolve(0);
  let neu = resolve(1);
  if (base === neu) {
    neu = `${neu} (2)`;
  }
  return { base, new: neu };
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
