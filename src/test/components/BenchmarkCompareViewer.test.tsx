/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  screen,
  waitFor,
} from 'firefox-profiler/test/fixtures/testing-library';
import { BenchmarkCompareViewer } from '../../components/app/BenchmarkCompareViewer';
import { changeProfilesToCompareBenchmark } from '../../actions/app';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';
import type { Profile } from '../../types';

import { blankStore } from '../fixtures/stores';

/**
 * The staged comparison, run on stats built here instead of on two downloaded
 * profiles. Everything about the progressive rendering is downstream of this, so
 * only the loading is replaced.
 */
jest.mock(
  'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison',
  () => {
    const actual = jest.requireActual(
      'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison'
    );
    return {
      ...actual,
      runBenchmarkComparison: (
        _baseUrl: string,
        _newUrl: string,
        signal: AbortSignal
      ) => {
        // Both helpers are function declarations, so they exist by
        // the time this is called even though jest hoists the mock above them.
        const { baseStats, newStats } = mockStatsPair();
        return actual.compareStatsProgressively(
          baseStats,
          newStats,
          mockSources(),
          signal
        );
      },
    };
  }
);

const WEIGHTS = [3, 4, 3, 5, 4, 3, 4, 5];

function makeStats(
  bucketNames: string[],
  suites: Array<{ suiteName: string; buckets: Array<[number, number[]]> }>
): ProfileBenchmarkStats {
  return {
    bucketNames,
    bucketKeys: bucketNames,
    bucketFuncs: bucketNames.map((_, i) => i),
    suites: suites.map(({ suiteName, buckets }) => ({
      suiteName,
      iterationCount: buckets[0][1].length,
      buckets: buckets.map(([bucketIndex, iterationTotals]) => ({
        bucketIndex,
        iterationTotals,
      })),
    })),
  };
}

function mockStatsPair() {
  const bucketNames = ['alphaFunc', 'betaFunc'];
  const suite = (name: string, bucket: number, scale: number) => ({
    suiteName: name,
    buckets: [[bucket, WEIGHTS.map((w) => w * scale)]] as Array<
      [number, number[]]
    >,
  });
  return {
    baseStats: makeStats(bucketNames, [
      suite('Alpha', 0, 1),
      suite('Beta', 1, 1),
    ]),
    newStats: makeStats(bucketNames, [
      suite('Alpha', 0, 1),
      suite('Beta', 1, 2),
    ]),
  };
}

function mockSources() {
  return {
    baseViewerUrl: 'https://profiler.firefox.com/public/base/',
    newViewerUrl: 'https://profiler.firefox.com/public/new/',
    baseProfile: {} as Profile,
    newProfile: {} as Profile,
  };
}

describe('app/BenchmarkCompareViewer', () => {
  function setup() {
    const store = blankStore();
    store.dispatch(
      changeProfilesToCompareBenchmark(
        [
          'https://profiler.firefox.com/public/base/',
          'https://profiler.firefox.com/public/new/',
        ],
        ['Chrome', 'Firefox']
      )
    );
    return render(
      <Provider store={store}>
        <BenchmarkCompareViewer />
      </Provider>
    );
  }

  it('links both profiles from the header, and fills the table in row by row', async () => {
    setup();

    // Both profiles are linked from the first render, not from behind the
    // "edit or swap" disclosure.
    const links = document.querySelectorAll('.benchmarkProfileLinks a');
    expect(
      [...links].map((a) => [a.textContent, a.getAttribute('href')])
    ).toEqual([
      ['Chrome', 'https://profiler.firefox.com/public/base/'],
      ['Firefox', 'https://profiler.firefox.com/public/new/'],
    ]);

    // The score rows show up while their per-function tables are still being
    // computed, each with a spinner where its count will go.
    expect(
      await screen.findByText('Overall (geomean-normalised)')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0);

    // ...and every spinner is eventually replaced by a count.
    await waitFor(() =>
      expect(screen.queryAllByRole('progressbar')).toHaveLength(0)
    );
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});
