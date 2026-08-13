/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useState, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useDispatch } from 'react-redux';

import { changeProfilesToCompareBenchmark } from 'firefox-profiler/actions/app';

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
): [string, string] {
  const resolve = (i: number) =>
    names?.[i]?.trim() || DEFAULT_BENCHMARK_PROFILE_NAMES[i];
  const first = resolve(0);
  let second = resolve(1);
  if (first === second) {
    second = `${second} (2)`;
  }
  return [first, second];
}

type Props = {
  /** Pre-filled values, i.e. what is currently being compared. */
  initialUrls: [string, string];
  initialNames: [string, string];
  /** Label for the submit button — "Compare" when nothing is loaded yet,
   * "Update comparison" when this form is sitting above a loaded report. */
  submitLabel: string;
};

/**
 * The input form for the benchmark comparison view: two profile URLs and the
 * names to call them by.
 *
 * It doubles as the empty state of `/compare-benchmark` and as an editable
 * header above a loaded report, because the thing a reader most often wants
 * after reading one comparison is a neighbouring one — the same pair the other
 * way round, or one side swapped for a third build. Making them go back to a
 * separate form page to do that loses the URLs they already had.
 */
export function BenchmarkCompareForm({
  initialUrls,
  initialNames,
  submitLabel,
}: Props) {
  const dispatch = useDispatch();
  const [urls, setUrls] = useState<[string, string]>(initialUrls);
  const [names, setNames] = useState<[string, string]>(initialNames);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    const index = name.endsWith('2') ? 1 : 0;
    const setter = name.startsWith('url') ? setUrls : setNames;
    setter((prev) => {
      const next: [string, string] = [prev[0], prev[1]];
      next[index] = value;
      return next;
    });
  }, []);

  const handleSwap = useCallback(() => {
    setUrls(([a, b]) => [b, a]);
    setNames(([a, b]) => [b, a]);
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      dispatch(
        changeProfilesToCompareBenchmark(
          [urls[0].trim(), urls[1].trim()],
          [
            names[0].trim() || DEFAULT_BENCHMARK_PROFILE_NAMES[0],
            names[1].trim() || DEFAULT_BENCHMARK_PROFILE_NAMES[1],
          ]
        )
      );
    },
    [dispatch, urls, names]
  );

  return (
    <form className="benchmarkCompareForm" onSubmit={handleSubmit}>
      <span className="benchmarkCompareForm__heading">Name</span>
      <span className="benchmarkCompareForm__heading">Profile URL</span>

      {([0, 1] as const).map((i) => (
        <Row
          key={i}
          index={i}
          url={urls[i]}
          name={names[i]}
          onChange={handleChange}
        />
      ))}

      <div className="benchmarkCompareForm__buttons">
        <button
          type="button"
          className="photon-button photon-button-default"
          onClick={handleSwap}
          title="Swap the two sides. Every percentage in the report is relative to the first one, so this is how you ask the opposite question."
        >
          ⇅ Swap
        </button>
        <button
          type="submit"
          className="photon-button photon-button-primary"
          disabled={urls[0].trim() === '' || urls[1].trim() === ''}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function Row({
  index,
  url,
  name,
  onChange,
}: {
  index: 0 | 1;
  url: string;
  name: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  const n = index + 1;
  return (
    <>
      <input
        name={`name${n}`}
        aria-label={`Name of profile ${n}`}
        className="photon-input benchmarkCompareForm__nameInput"
        type="text"
        placeholder={DEFAULT_BENCHMARK_PROFILE_NAMES[index]}
        onChange={onChange}
        value={name}
      />
      <input
        name={`url${n}`}
        aria-label={`URL of profile ${n}`}
        className="photon-input"
        type="url"
        required
        placeholder="https://"
        onChange={onChange}
        value={url}
      />
    </>
  );
}
