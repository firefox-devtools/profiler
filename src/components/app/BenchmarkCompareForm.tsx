/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useState, useCallback } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent } from 'react';
import { useDispatch } from 'react-redux';

import { changeProfilesToCompareBenchmark } from 'firefox-profiler/actions/app';
import { defaultBenchmarkProfileName } from './BenchmarkProfileNames';

type Props = {
  /** Pre-filled values, i.e. what is currently being compared. Two or more. */
  initialUrls: string[];
  initialNames: string[];
  /** Label for the submit button — "Compare" when nothing is loaded yet,
   * "Update comparison" when this form is sitting above a loaded report. */
  submitLabel: string;
};

/** Below this there is no comparison to make. */
const MIN_PROFILES = 2;

/**
 * The input form for the benchmark comparison view: the profile URLs and the
 * names to call them by.
 *
 * It doubles as the empty state of `/compare-benchmark` and as an editable
 * header above a loaded report, because the thing a reader most often wants
 * after reading one comparison is a neighbouring one — the same pair the other
 * way round, or one side swapped for a third build. Making them go back to a
 * separate form page to do that loses the URLs they already had.
 *
 * Two rows is the usual shape and the smallest legal one, but not the limit: a
 * question like "where is Firefox behind both Chrome and Safari" needs all three
 * loaded at once, so rows can be added and removed.
 */
export function BenchmarkCompareForm({
  initialUrls,
  initialNames,
  submitLabel,
}: Props) {
  const dispatch = useDispatch();
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [names, setNames] = useState<string[]>(initialNames);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.currentTarget;
    // `url3` / `name3` -- one-based in the DOM, because the labels are read by
    // people.
    const index = Number(name.replace(/^\D+/, '')) - 1;
    const setter = name.startsWith('url') ? setUrls : setNames;
    setter((prev) => prev.map((old, i) => (i === index ? value : old)));
  }, []);

  const handleSwap = useCallback(() => {
    // Only offered for a pair, where "the other way round" is unambiguous.
    setUrls(([a, b]) => [b, a]);
    setNames(([a, b]) => [b, a]);
  }, []);

  const handleAdd = useCallback(() => {
    setUrls((prev) => [...prev, '']);
    setNames((prev) => [...prev, '']);
  }, []);

  const handleRemove = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const index = Number(e.currentTarget.value);
    setUrls((prev) => prev.filter((_, i) => i !== index));
    setNames((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      dispatch(
        changeProfilesToCompareBenchmark(
          urls.map((url) => url.trim()),
          names.map((name, i) => name.trim() || defaultBenchmarkProfileName(i))
        )
      );
    },
    [dispatch, urls, names]
  );

  return (
    <form className="benchmarkCompareForm" onSubmit={handleSubmit}>
      <span className="benchmarkCompareForm__heading">Name</span>
      <span className="benchmarkCompareForm__heading">Profile URL</span>
      {/* The remove buttons' column, which has no heading of its own. */}
      <span />

      {urls.map((url, i) => (
        <Row
          key={i}
          index={i}
          url={url}
          name={names[i]}
          onChange={handleChange}
          // Removing one of two would leave nothing to compare, so the button is
          // absent rather than present-and-refusing.
          onRemove={urls.length > MIN_PROFILES ? handleRemove : null}
        />
      ))}

      <div className="benchmarkCompareForm__buttons">
        <button
          type="button"
          className="photon-button photon-button-default"
          onClick={handleAdd}
        >
          + Add a profile
        </button>
        {urls.length === 2 ? (
          <button
            type="button"
            className="photon-button photon-button-default"
            onClick={handleSwap}
            title="Swap the two sides. Every percentage in the report is relative to the first one, so this is how you ask the opposite question."
          >
            ⇅ Swap
          </button>
        ) : null}
        <button
          type="submit"
          className="photon-button photon-button-primary"
          disabled={urls.some((url) => url.trim() === '')}
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
  onRemove,
}: {
  index: number;
  url: string;
  name: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Null when this row cannot be removed. */
  onRemove: ((e: MouseEvent<HTMLButtonElement>) => void) | null;
}) {
  const n = index + 1;
  return (
    <>
      <input
        name={`name${n}`}
        aria-label={`Name of profile ${n}`}
        className="photon-input benchmarkCompareForm__nameInput"
        type="text"
        placeholder={defaultBenchmarkProfileName(index)}
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
      {onRemove === null ? (
        <span />
      ) : (
        <button
          type="button"
          className="benchmarkCompareForm__remove"
          value={index}
          aria-label={`Remove profile ${n}`}
          title={`Remove profile ${n} from the comparison`}
          onClick={onRemove}
        >
          ✕
        </button>
      )}
    </>
  );
}
