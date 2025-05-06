/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';

import { AppHeader } from './AppHeader';
import { getProfilesToCompare } from 'firefox-profiler/selectors/url-state';
import { fetchProfile } from 'firefox-profiler/utils/profile-fetch';
import { unserializeProfileOfArbitraryFormat } from 'firefox-profiler/profile-logic/process-profile';
import { expandUrl } from 'firefox-profiler/utils/shorten-url';
import { getProfileFetchUrl } from 'firefox-profiler/actions/receive-profile';
import { extractBenchmarkStatsFromProfile } from 'firefox-profiler/profile-logic/benchmark/extract-benchmark-stats';
import {
  compareBuckets,
  compareIterationTotals,
  suiteIterationTotals,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type {
  BucketComparison,
  ScoreComparison,
} from 'firefox-profiler/profile-logic/benchmark/compare-benchmark-stats';
import type { ConfidenceRating } from 'firefox-profiler/profile-logic/benchmark/perf-compare-stats';
import './BenchmarkCompareViewer.css';

type ComparisonData = {
  baseUrl: string;
  newUrl: string;
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
  globalComparisons: BucketComparison[];
  suiteComparisons: Array<{
    suiteName: string;
    comparisons: BucketComparison[];
  }>;
};

type State =
  | { phase: 'loading' }
  | { phase: 'error'; error: string }
  | { phase: 'done'; data: ComparisonData };

const TOP_N = 100;

async function loadOneProfile(viewerUrl: string) {
  let url = viewerUrl;
  if (
    url.startsWith('https://perfht.ml/') ||
    url.startsWith('https://share.firefox.dev/') ||
    url.startsWith('https://bit.ly/')
  ) {
    url = await expandUrl(url);
  }
  const dataUrl = getProfileFetchUrl(url);
  const response = await fetchProfile({
    url: dataUrl,
    onTemporaryError: () => {},
  });
  if (response.responseType !== 'PROFILE') {
    throw new Error('Expected a profile, not a zip file.');
  }
  return unserializeProfileOfArbitraryFormat(response.profile, dataUrl);
}

async function computeComparison(
  baseUrl: string,
  newUrl: string
): Promise<ComparisonData> {
  const [baseProfile, newProfile] = await Promise.all([
    loadOneProfile(baseUrl),
    loadOneProfile(newUrl),
  ]);

  const baseStats = extractBenchmarkStatsFromProfile(baseProfile);
  const newStats = extractBenchmarkStatsFromProfile(newProfile);

  const iterationCount = baseStats.suites[0]?.iterationCount ?? 1;

  const baseGlobalIter = suiteIterationTotals(
    baseStats.globalBuckets,
    iterationCount
  );
  const newGlobalIter = suiteIterationTotals(
    newStats.globalBuckets,
    iterationCount
  );
  const overallScore = compareIterationTotals(
    'Overall (geomean-normalised)',
    baseGlobalIter,
    newGlobalIter
  );

  const suiteScores: ScoreComparison[] = [];
  for (const baseSuite of baseStats.suites) {
    const newSuite = newStats.suites.find(
      (s) => s.suiteName === baseSuite.suiteName
    );
    const baseIter = suiteIterationTotals(
      baseSuite.buckets,
      baseSuite.iterationCount
    );
    const newIter = newSuite
      ? suiteIterationTotals(newSuite.buckets, newSuite.iterationCount)
      : new Array<number>(baseSuite.iterationCount).fill(0);
    suiteScores.push(
      compareIterationTotals(baseSuite.suiteName, baseIter, newIter)
    );
  }
  suiteScores.sort((a, b) => a.label.localeCompare(b.label));

  const globalComparisons = compareBuckets(
    baseStats.globalBuckets,
    newStats.globalBuckets,
    baseStats.bucketNames,
    newStats.bucketNames,
    iterationCount
  );

  const suiteComparisons = baseStats.suites.flatMap((baseSuite) => {
    const newSuite = newStats.suites.find(
      (s) => s.suiteName === baseSuite.suiteName
    );
    if (!newSuite) return [];
    const comparisons = compareBuckets(
      baseSuite.buckets,
      newSuite.buckets,
      baseStats.bucketNames,
      newStats.bucketNames,
      baseSuite.iterationCount
    );
    return [{ suiteName: baseSuite.suiteName, comparisons }];
  });
  suiteComparisons.sort((a, b) => a.suiteName.localeCompare(b.suiteName));

  return {
    baseUrl,
    newUrl,
    overallScore,
    suiteScores,
    globalComparisons,
    suiteComparisons,
  };
}

function formatChange(rel: number): string {
  if (!isFinite(rel)) return rel > 0 ? 'appeared' : 'disappeared';
  const pct = (rel * 100).toFixed(2);
  return rel >= 0 ? `+${pct}%` : `${pct}%`;
}

function changeClass(relChange: number, confidence: ConfidenceRating): string {
  if (!isFinite(relChange) || relChange === 0) return '';
  const direction = relChange > 0 ? 'regressed' : 'improved';
  if (confidence === 'LOW') return '';
  if (confidence === 'MEDIUM') return `benchmarkCell--${direction}-medium`;
  return `benchmarkCell--${direction}`;
}

function ScoreTable({
  overallScore,
  suiteScores,
}: {
  overallScore: ScoreComparison;
  suiteScores: ScoreComparison[];
}) {
  return (
    <table className="benchmarkTable">
      <thead>
        <tr>
          <th>Score</th>
          <th className="benchmarkCell--number">Base mean</th>
          <th className="benchmarkCell--number">New mean</th>
          <th className="benchmarkCell--number">Δ abs</th>
          <th className="benchmarkCell--number">Δ%</th>
          <th className="benchmarkCell--number">Effect</th>
          <th className="benchmarkCell--number">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {[overallScore, ...suiteScores].map((row, i) => {
          const absDiff = row.newMean - row.baseMean;
          const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
          return (
            <tr key={i} className={i === 0 ? 'benchmarkRow--overall' : ''}>
              <td className={i > 0 ? 'benchmarkCell--indented' : ''}>
                {row.label}
              </td>
              <td className="benchmarkCell--number">
                {row.baseMean.toFixed(2)}
              </td>
              <td className="benchmarkCell--number">
                {row.newMean.toFixed(2)}
              </td>
              <td className="benchmarkCell--number">{absDiffStr}</td>
              <td
                className={`benchmarkCell--number ${changeClass(row.relChange, row.confidence)}`}
              >
                {formatChange(row.relChange)}
              </td>
              <td className="benchmarkCell--number">{row.effectSize}</td>
              <td className="benchmarkCell--number">{row.confidence}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BucketTable({
  comparisons,
  label,
}: {
  comparisons: BucketComparison[];
  label: string;
}) {
  const significant = comparisons
    .filter((c) => c.confidence !== 'LOW')
    .sort(
      (a, b) =>
        Math.abs(b.newMean - b.baseMean) - Math.abs(a.newMean - a.baseMean)
    )
    .slice(0, TOP_N);

  if (significant.length === 0) {
    return (
      <p className="benchmarkNoChanges">
        No significant bucket changes in {label}.
      </p>
    );
  }

  return (
    <table className="benchmarkTable benchmarkTable--buckets">
      <thead>
        <tr>
          <th>Bucket name</th>
          <th className="benchmarkCell--number">Base mean</th>
          <th className="benchmarkCell--number">New mean</th>
          <th className="benchmarkCell--number">Δ abs</th>
          <th className="benchmarkCell--number">Δ%</th>
          <th className="benchmarkCell--number">Effect</th>
          <th className="benchmarkCell--number">Confidence</th>
        </tr>
      </thead>
      <tbody>
        {significant.map((c, i) => {
          const absDiff = c.newMean - c.baseMean;
          const absDiffStr = (absDiff >= 0 ? '+' : '') + absDiff.toFixed(2);
          return (
            <tr key={i}>
              <td className="benchmarkCell--bucketName" title={c.bucketName}>
                {c.bucketName}
              </td>
              <td className="benchmarkCell--number">{c.baseMean.toFixed(2)}</td>
              <td className="benchmarkCell--number">{c.newMean.toFixed(2)}</td>
              <td className="benchmarkCell--number">{absDiffStr}</td>
              <td
                className={`benchmarkCell--number ${changeClass(c.relChange, c.confidence)}`}
              >
                {formatChange(c.relChange)}
              </td>
              <td className="benchmarkCell--number">{c.effectSize}</td>
              <td className="benchmarkCell--number">{c.confidence}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ComparisonResults({ data }: { data: ComparisonData }) {
  return (
    <div className="benchmarkResults">
      <div className="benchmarkProfileUrls">
        <span>
          <strong>Base:</strong>{' '}
          <a href={data.baseUrl} target="_blank" rel="noopener noreferrer">
            {data.baseUrl}
          </a>
        </span>
        <span>
          <strong>New:</strong>{' '}
          <a href={data.newUrl} target="_blank" rel="noopener noreferrer">
            {data.newUrl}
          </a>
        </span>
      </div>

      <h3 className="benchmarkSectionTitle">Score and subtest totals</h3>
      <ScoreTable
        overallScore={data.overallScore}
        suiteScores={data.suiteScores}
      />

      <h3 className="benchmarkSectionTitle">
        Global buckets (top {TOP_N} by |Δ abs|, medium or high confidence)
      </h3>
      <BucketTable comparisons={data.globalComparisons} label="global" />

      {data.suiteComparisons.map(({ suiteName, comparisons }) => (
        <details key={suiteName} className="benchmarkSuiteDetails">
          <summary className="benchmarkSectionTitle">
            Suite: {suiteName}
          </summary>
          <BucketTable comparisons={comparisons} label={suiteName} />
        </details>
      ))}
    </div>
  );
}

export function BenchmarkCompareViewer() {
  const profilesToCompare = useSelector(getProfilesToCompare);
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    if (!profilesToCompare || profilesToCompare.length < 2) {
      setState({ phase: 'error', error: 'Two profile URLs are required.' });
      return;
    }
    setState({ phase: 'loading' });
    const [baseUrl, newUrl] = profilesToCompare;
    computeComparison(baseUrl, newUrl)
      .then((data) => setState({ phase: 'done', data }))
      .catch((err) =>
        setState({ phase: 'error', error: String(err?.message ?? err) })
      );
  }, [profilesToCompare]);

  return (
    <main className="benchmarkCompareViewer">
      <AppHeader />
      <h2 className="photon-title-20 benchmarkTitle">Benchmark Comparison</h2>

      {state.phase === 'loading' && (
        <div className="benchmarkLoading">
          <div className="benchmarkSpinner" />
          <p>Loading profiles and computing statistics…</p>
        </div>
      )}

      {state.phase === 'error' && (
        <div className="benchmarkError">
          <p>
            <strong>Error:</strong> {state.error}
          </p>
        </div>
      )}

      {state.phase === 'done' && <ComparisonResults data={state.data} />}
    </main>
  );
}
