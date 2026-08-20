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
        urls: string[],
        [baseIndex, newIndex]: [number, number],
        signal: AbortSignal
      ) => {
        // Which pair the page asked for. The stats themselves are the same
        // whatever is passed, so this is the only way to see that picking a
        // different pair reached the pipeline.
        comparedPairs.push([urls[baseIndex], urls[newIndex]]);
        // These helpers are function declarations, so they exist by
        // the time this is called even though jest hoists the mock above them.
        const { baseStats, newStats, thirdStats } = mockStatsPair();
        // Whatever is loaded and not compared is a mean column. The stats are
        // the same whichever pair is picked, so every such slot gets the one
        // third profile.
        const others = new Map<number, ProfileBenchmarkStats>();
        for (let i = 0; i < urls.length; i++) {
          if (i !== baseIndex && i !== newIndex) {
            others.set(i, thirdStats);
          }
        }
        return actual.compareStatsProgressively(
          baseStats,
          newStats,
          mockSources(),
          signal,
          mockHeldTableRunner,
          others
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

/** The (base, new) URLs of every comparison the page has started. */
const comparedPairs: Array<[string, string]> = [];

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
    // A third profile, for the questions that need one. On Beta it is the
    // slowest of the three, which is what makes "slower than the best of the
    // others" and "slower than this particular one" different answers rather
    // than two spellings of the same one.
    thirdStats: makeStats(bucketNames, [
      suite('Alpha', 0, 1),
      suite('Beta', 1, 3),
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

const URLS = [
  'https://profiler.firefox.com/public/base/',
  'https://profiler.firefox.com/public/new/',
  'https://profiler.firefox.com/public/third/',
];

describe('app/BenchmarkCompareViewer', () => {
  beforeEach(function () {
    heldTables.length = 0;
    comparedPairs.length = 0;
  });

  function setup(count: number = 2) {
    const store = blankStore();
    store.dispatch(
      changeProfilesToCompareBenchmark(
        URLS.slice(0, count),
        ['Chrome', 'Firefox', 'Safari'].slice(0, count)
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
      ['Chrome', URLS[0]],
      ['Firefox', URLS[1]],
    ]);
    // Two profiles are the whole comparison, so there is nothing to choose
    // between.
    expect(document.querySelector('.benchmarkComparingPair')).toBeNull();

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

  it('keeps three profiles loaded and reads any pair of them', async () => {
    setup(3);
    await screen.findByText('Overall (geomean-normalised)');

    // All three are linked, and the first two are compared until told
    // otherwise.
    expect(
      [...document.querySelectorAll('.benchmarkProfileLinks a')].map(
        (a) => a.textContent
      )
    ).toEqual(['Chrome', 'Firefox', 'Safari']);
    expect(comparedPairs).toEqual([[URLS[0], URLS[1]]]);

    // Picking a third profile for one side re-runs the comparison against it,
    // without touching the other side.
    const baseSelect = screen.getByLabelText(
      'Profile the percentages are measured against'
    );
    const newSelect = screen.getByLabelText(
      'Profile being compared against it'
    );
    fireEvent.change(newSelect, { target: { value: '2' } });
    await waitFor(() => expect(comparedPairs).toHaveLength(2));
    expect(comparedPairs[1]).toEqual([URLS[0], URLS[2]]);
    // And the whole report is now about that pair, down to the column headers.
    expect(await screen.findByText('Safari mean')).toBeInTheDocument();
    expect(screen.getByText('Chrome mean')).toBeInTheDocument();

    // Choosing the profile that is already on the other side swaps the two,
    // rather than comparing Safari with itself.
    fireEvent.change(baseSelect, { target: { value: '2' } });
    await waitFor(() => expect(comparedPairs).toHaveLength(3));
    expect(comparedPairs[2]).toEqual([URLS[2], URLS[0]]);
  });

  it('lists where a profile is behind the best of the others', async () => {
    setup(3);
    await screen.findByText('Overall (geomean-normalised)');
    // Overall, then Alpha, then Beta; Gamma never gets one.
    await releaseNextTable();
    await releaseNextTable();
    expect(await releaseNextTable()).toBe('Beta');

    fireEvent.click(screen.getByLabelText('Unfiltered'));
    fireEvent.click(screen.getByText('Beta').closest('tr') as HTMLElement);
    const listed = () =>
      [...document.querySelectorAll('.benchmarkCell--bucketName')].map((td) =>
        td.getAttribute('title')
      );

    // Safari is measured but not compared, so it is a mean column and nothing
    // else: on Beta it spends three times what Chrome does.
    const means = [
      ...document.querySelectorAll(
        '.benchmarkTable--buckets .benchmarkCell--number'
      ),
    ].map((td) => td.textContent);
    expect(means.slice(0, 3)).toEqual(['3.88', '7.75', '11.63']);

    // Firefox is slower than Chrome here and faster than Safari, so the two
    // ways of asking give different answers -- which is the whole reason the
    // comparand is a control rather than "the other one".
    fireEvent.click(
      screen.getByLabelText('Firefox is slower than the best of the others')
    );
    expect(listed()).toEqual(['betaFunc']);

    fireEvent.change(
      screen.getByLabelText('Profile the direction is measured against'),
      { target: { value: '2' } }
    );
    expect(
      screen.getByLabelText('Firefox is slower than Safari')
    ).toBeChecked();
    expect(listed()).toEqual([]);
    fireEvent.click(screen.getByLabelText('Firefox is faster than Safari'));
    expect(listed()).toEqual(['betaFunc']);
  });

  it('says what a subtest is worth before its table arrives', async () => {
    setup();
    await screen.findByText('Overall (geomean-normalised)');

    // Beta is the subtest the new profile is twice as slow on. Opening it says
    // so in the form a bug report gets written in -- and says it immediately,
    // because the sentence needs only the score row. The list of functions
    // behind it is still seconds away.
    fireEvent.click(screen.getByText('Beta').closest('tr') as HTMLElement);
    expect(
      document.querySelector('.benchmarkCounterfactual')?.textContent
    ).toBe(
      'If Firefox were as fast as Chrome on Beta, it would spend 20.63% less ' +
        'time overall.'
    );
    expect(
      screen.getByText(/Still working out which functions moved/)
    ).toBeInTheDocument();

    // The overall row is the one place it would only repeat the Δ% column back.
    fireEvent.click(
      screen
        .getByText('Overall (geomean-normalised)')
        .closest('tr') as HTMLElement
    );
    expect(document.querySelectorAll('.benchmarkCounterfactual')).toHaveLength(
      1
    );
  });

  it('lists a direction under either name for it', async () => {
    setup();
    await screen.findByText('Overall (geomean-normalised)');
    expect(await releaseNextTable()).toBe('Overall (geomean-normalised)');

    // Unfiltered, so that what the direction controls admit is the only thing
    // deciding this list.
    fireEvent.click(screen.getByLabelText('Unfiltered'));
    const overall = screen
      .getByText('Overall (geomean-normalised)')
      .closest('tr') as HTMLTableRowElement;
    fireEvent.click(overall);
    const listed = () =>
      [...document.querySelectorAll('.benchmarkCell--bucketName')].map((td) =>
        td.getAttribute('title')
      );

    // Firefox is the new profile, so it is what the directions are about until
    // the reader says otherwise, and "everything" is both of them -- plus
    // alphaFunc, which is in neither because it did not move at all.
    expect(screen.getByLabelText('Profile the direction is about')).toHaveValue(
      '1'
    );
    expect(listed()).toEqual(['gammaFunc', 'betaFunc', 'alphaFunc']);
    fireEvent.click(screen.getByLabelText('Firefox is slower'));
    expect(listed()).toEqual(['betaFunc']);

    // The same set, asked for the other way round. This is the whole point of
    // splitting the choice in two: a reader who wants to know where Firefox
    // wins can ask for that in those words, instead of having to work out that
    // it is what "Chrome is slower" means.
    fireEvent.change(screen.getByLabelText('Profile the direction is about'), {
      target: { value: '0' },
    });
    expect(screen.getByLabelText('Chrome is faster')).toBeChecked();
    expect(listed()).toEqual(['betaFunc']);
    fireEvent.click(screen.getByLabelText('Chrome is slower'));
    expect(listed()).toEqual(['gammaFunc']);
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
