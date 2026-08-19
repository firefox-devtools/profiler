/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from 'firefox-profiler/test/fixtures/testing-library';
import { BenchmarkCompareViewer } from '../../components/app/BenchmarkCompareViewer';
import { changeProfilesToCompareBenchmark } from '../../actions/app';
import { getProfileWithMarkers } from '../fixtures/profiles/processed-profile';
import type { ProfileBenchmarkStats } from '../../profile-logic/benchmark/extract-benchmark-stats';
import type {
  TableRunner,
  TableRunnerSetup,
} from '../../profile-logic/benchmark/run-benchmark-comparison';
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
        // These helpers are function declarations, so they exist by
        // the time this is called even though jest hoists the mock above them.
        const { baseStats, newStats } = mockStatsPair();
        return actual.compareStatsProgressively(
          baseStats,
          newStats,
          mockSources(),
          signal,
          mockHeldTableRunner
        );
      },
    };
  }
);

/**
 * Tables the runner is sitting on, in the order they were asked for.
 *
 * The point of this page is that the score rows are readable while the bucket
 * tables are still being computed, so a test has to be able to stand in the middle
 * of that rather than race the real runner to it. Every job is held here until
 * `releaseNextTable` lets it through; the table itself is still computed by the
 * real in-process runner, so what is faked is only *when* it arrives.
 */
const heldTables: Array<{ label: string; release: () => void }> = [];

function mockHeldTableRunner(setup: TableRunnerSetup): TableRunner {
  const actual = jest.requireActual(
    'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison'
  );
  const inner: TableRunner = actual.createInProcessTableRunner(setup);
  return {
    run: (job) =>
      new Promise((resolve, reject) => {
        heldTables.push({
          label: job.label,
          release: () => inner.run(job).then(resolve, reject),
        });
      }),
    dispose: () => inner.dispose(),
  };
}

/** Let the oldest held table through, and wait for the page to have taken it —
 * which shows as one fewer spinner, since each pending row carries one. */
async function releaseNextTable(): Promise<string> {
  const next = heldTables.shift();
  if (next === undefined) {
    throw new Error('No bucket table is being held.');
  }
  const spinnersBefore = screen.queryAllByRole('progressbar').length;
  next.release();
  await waitFor(() =>
    expect(screen.queryAllByRole('progressbar').length).toBeLessThan(
      spinnersBefore
    )
  );
  return next.label;
}

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
  const bucketNames = ['alphaFunc', 'betaFunc', 'gammaFunc'];
  const suite = (name: string, bucket: number, scale: number) => ({
    suiteName: name,
    buckets: [[bucket, WEIGHTS.map((w) => w * scale)]] as Array<
      [number, number[]]
    >,
  });
  return {
    // "Gamma" is in the base profile only, which is the case that has a score row
    // but will never have a bucket table.
    baseStats: makeStats(bucketNames, [
      suite('Alpha', 0, 1),
      suite('Beta', 1, 1),
      suite('Gamma', 2, 1),
    ]),
    newStats: makeStats(bucketNames, [
      suite('Alpha', 0, 1),
      suite('Beta', 1, 2),
    ]),
  };
}

/**
 * A profile with just enough in it for `makeBucketProfileBundle` to build a bundle:
 * one thread carrying a `suite-<name>` UserTiming marker per suite, which is how
 * `getSpeedometerBenchmarkInfo` recognises a Speedometer run and picks its thread.
 *
 * Expanding a score row builds those bundles, so a cast to `Profile` is not enough
 * here. It is still only enough to *build* one — there are no samples behind it, so
 * this fixture says nothing about the flame graphs themselves.
 */
function mockBenchmarkProfile(): Profile {
  return getProfileWithMarkers(
    ['Alpha', 'Beta', 'Gamma'].map((suiteName, i) => [
      'UserTiming',
      i * 10,
      i * 10 + 10,
      { type: 'UserTiming', name: `suite-${suiteName}`, entryType: 'measure' },
    ])
  );
}

function mockSources() {
  return {
    baseViewerUrl: 'https://profiler.firefox.com/public/base/',
    newViewerUrl: 'https://profiler.firefox.com/public/new/',
    baseProfile: mockBenchmarkProfile(),
    newProfile: mockBenchmarkProfile(),
  };
}

describe('app/BenchmarkCompareViewer', () => {
  beforeEach(function () {
    heldTables.length = 0;
  });

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
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByText('Beta')).toBeInTheDocument();

    // ...and each spinner is replaced by a count as that row's table lands, one
    // row at a time rather than all at the end.
    expect(await releaseNextTable()).toBe('Overall (geomean-normalised)');
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    await releaseNextTable();
    await releaseNextTable();
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('opens a row whose table is still being computed', async () => {
    setup();

    // The arrow is there from the moment the row is, not from when its table
    // arrives: a disclosure that appears a second late is one the reader has
    // already looked past, and one they cannot tell "not yet" from "never" by.
    const label = await screen.findByText('Overall (geomean-normalised)');
    const row = label.closest('tr') as HTMLTableRowElement;
    expect(row).toHaveClass('benchmarkRow--suite-expandable');
    expect(row.querySelector('.benchmarkDisclosure')?.textContent).toBe('▶');

    // Opening it says what it is waiting for, rather than showing an empty box.
    fireEvent.click(row);
    expect(row.querySelector('.benchmarkDisclosure')?.textContent).toBe('▼');
    expect(
      screen.getByText(/Still working out which functions moved/)
    ).toBeInTheDocument();
    expect(document.querySelectorAll('.benchmarkTable--buckets')).toHaveLength(
      0
    );

    // And it stays open, with the table in it, once the table lands.
    await releaseNextTable();
    expect(row.querySelector('.benchmarkDisclosure')?.textContent).toBe('▼');
    expect(
      screen.queryByText(/Still working out which functions moved/)
    ).not.toBeInTheDocument();
    expect(document.querySelectorAll('.benchmarkTable--buckets')).toHaveLength(
      1
    );
  });

  it('gives a subtest the new profile did not run no arrow at all', async () => {
    setup();
    await screen.findByText('Overall (geomean-normalised)');

    // Three score rows, but only two of them will ever have a table: "Gamma" is
    // in the base profile alone. That row must not offer a disclosure the reader
    // would click and wait behind forever.
    const rowFor = (text: string) =>
      screen.getByText(text).closest('tr') as HTMLTableRowElement;
    for (const label of ['Alpha', 'Beta']) {
      expect(
        rowFor(label).querySelector('.benchmarkDisclosure')
      ).not.toBeNull();
    }
    const gamma = rowFor('Gamma');
    expect(gamma.querySelector('.benchmarkDisclosure')).toBeNull();
    expect(gamma).not.toHaveClass('benchmarkRow--suite-expandable');
    expect(gamma.querySelector('[role="progressbar"]')).toBeNull();
  });
});
