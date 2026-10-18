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
import {
  getBenchmarkBucketFilter,
  getProfilesToCompare,
} from '../../selectors/url-state';
import { uploadComparedProfiles } from '../../profile-logic/benchmark/upload-compared-profiles';
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
        subject: number,
        comparand: number | 'best',
        signal: AbortSignal
      ) => {
        // Which comparison the page asked for, as the subject's URL and the
        // comparand's. This is the only way to see that picking a different
        // comparison reached the pipeline.
        comparisons.push([
          urls[subject],
          comparand === 'best' ? 'best' : urls[comparand],
        ]);
        // These helpers are function declarations, so they exist by
        // the time this is called even though jest hoists the mock above them.
        // Each loaded profile has stats of its own, by its place in the list.
        const { baseStats, newStats, thirdStats } = mockStatsPair();
        const statsByIndex = [baseStats, newStats, thirdStats];
        return actual.compareStatsProgressively(
          urls.map((_, i) => statsByIndex[i]),
          subject,
          comparand,
          mockSources(urls),
          signal,
          mockHeldTableRunner
        );
      },
    };
  }
);

/** The upload talks to the server, so only its result is made up here. */
jest.mock(
  'firefox-profiler/profile-logic/benchmark/upload-compared-profiles',
  () => ({
    ...jest.requireActual(
      'firefox-profiler/profile-logic/benchmark/upload-compared-profiles'
    ),
    uploadComparedProfiles: jest.fn(),
  })
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

/** The subject's URL and the comparand's (or 'best') of every comparison the
 * page has started. */
const comparisons: Array<[string, string]> = [];

function mockHeldTableRunner(setup: TableRunnerSetup): TableRunner {
  const actual = jest.requireActual(
    'firefox-profiler/profile-logic/benchmark/run-benchmark-comparison'
  );
  const inner: TableRunner = actual.createInProcessTableRunner(setup);
  const mine: Array<{ held: (typeof heldTables)[0]; reject: () => void }> = [];
  // A comparison the page has replaced is not waiting for its tables any more,
  // so they are no longer the next thing to release. Rejecting them is what the
  // worker pool does on abort, and it is what lets the abandoned comparison
  // finish.
  setup.signal.addEventListener('abort', () => {
    for (const { held, reject } of mine) {
      const index = heldTables.indexOf(held);
      if (index !== -1) {
        heldTables.splice(index, 1);
      }
      reject();
    }
  });
  return {
    run: (job) =>
      new Promise((resolve, reject) => {
        const held = {
          label: job.label,
          release: () => inner.run(job).then(resolve, reject),
        };
        mine.push({ held, reject: () => reject(setup.signal.reason) });
        heldTables.push(held);
      }),
    dispose: () => inner.dispose(),
  };
}

/** Let the oldest held table through, and wait for the page to have taken it —
 * which shows as one fewer spinner, since each pending row carries one. Against
 * the fastest of the others a row has one table per profile compared with, and
 * shows none of them until all are in, so all of them are let through. */
async function releaseNextTable(): Promise<string> {
  const next = heldTables.shift();
  if (next === undefined) {
    throw new Error('No bucket table is being held.');
  }
  const spinnersBefore = screen.queryAllByRole('progressbar').length;
  next.release();
  for (const held of heldTables.filter(({ label }) => label === next.label)) {
    heldTables.splice(heldTables.indexOf(held), 1);
    held.release();
  }
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
    // slowest of the three, which is what makes "slower than the fastest of the
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

function mockSources(urls: string[]) {
  return {
    profiles: urls.map(() => mockBenchmarkProfile()),
    viewerUrls: urls,
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
    comparisons.length = 0;
  });

  function setup(count: number = 2, urls: string[] = URLS) {
    const store = blankStore();
    store.dispatch(
      changeProfilesToCompareBenchmark(
        urls.slice(0, count),
        ['Chrome', 'Firefox', 'Safari'].slice(0, count)
      )
    );
    const renderResult = render(
      <Provider store={store}>
        <BenchmarkCompareViewer />
      </Provider>
    );
    return { ...renderResult, store };
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
    // Two profiles are the whole comparison, so there is no comparand to
    // choose.
    expect(
      screen.queryByLabelText('Profile it is compared with')
    ).not.toBeInTheDocument();

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

  it('compares a profile with the fastest of the others, or with one of them', async () => {
    setup(3);
    await screen.findByText('Overall (geomean-normalised)');

    // All three are linked, and the second is compared with the fastest of the
    // others until told otherwise.
    expect(
      [...document.querySelectorAll('.benchmarkProfileLinks a')].map(
        (a) => a.textContent
      )
    ).toEqual(['Chrome', 'Firefox', 'Safari']);
    expect(comparisons).toEqual([[URLS[1], 'best']]);
    expect(screen.getByText(/each q is multiplied by 2/)).toBeInTheDocument();

    // Naming one profile compares with that one alone.
    fireEvent.change(screen.getByLabelText('Profile it is compared with'), {
      target: { value: '2' },
    });
    await waitFor(() => expect(comparisons).toHaveLength(2));
    expect(comparisons[1]).toEqual([URLS[1], URLS[2]]);

    // Making that profile the subject swaps the two, rather than comparing
    // Safari with itself.
    fireEvent.change(screen.getByLabelText('Profile the report is about'), {
      target: { value: '2' },
    });
    await waitFor(() => expect(comparisons).toHaveLength(3));
    expect(comparisons[2]).toEqual([URLS[2], URLS[1]]);
  });

  it('measures each row against the fastest of the others', async () => {
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

    // On Beta, Safari spends three times what Chrome does, so Chrome is the
    // fastest of the others and its mean is the one marked.
    const bucketCells = [
      ...document.querySelectorAll(
        '.benchmarkTable--buckets .benchmarkCell--number'
      ),
    ];
    expect(bucketCells.slice(0, 3).map((td) => td.textContent)).toEqual([
      '3.88',
      '7.75',
      '11.63',
    ]);
    expect(bucketCells[0]).toHaveClass('benchmarkCell--comparand');
    expect(bucketCells[2]).not.toHaveClass('benchmarkCell--comparand');

    // Firefox is slower than Chrome here and faster than Safari, so the two
    // ways of asking give different answers -- which is the whole reason the
    // comparand is a control rather than "the other one".
    fireEvent.click(
      screen.getByLabelText('Firefox is slower than the fastest of the others')
    );
    expect(listed()).toEqual(['betaFunc']);

    fireEvent.change(screen.getByLabelText('Profile it is compared with'), {
      target: { value: '2' },
    });
    await screen.findByText('Overall (geomean-normalised)');
    await releaseNextTable();
    await releaseNextTable();
    await releaseNextTable();
    fireEvent.click(screen.getByText('Beta').closest('tr') as HTMLElement);
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

    // Firefox is the new profile, so it is what the report is about until
    // the reader says otherwise, and "everything" is both directions -- plus
    // alphaFunc, which is in neither because it did not move at all.
    expect(screen.getByLabelText('Profile the report is about')).toHaveValue(
      '1'
    );
    expect(listed()).toEqual(['gammaFunc', 'betaFunc', 'alphaFunc']);
    fireEvent.click(screen.getByLabelText('Firefox is slower'));
    expect(listed()).toEqual(['betaFunc']);

    // The same set, asked for the other way round. This is the whole point of
    // being able to swap the subject: a reader who wants to know where Chrome
    // wins can ask for that in those words, instead of having to work out that
    // it is what "Firefox is slower" means. The comparison is computed again
    // with the sides swapped.
    fireEvent.change(screen.getByLabelText('Profile the report is about'), {
      target: { value: '0' },
    });
    await screen.findByText('Overall (geomean-normalised)');
    await releaseNextTable();
    fireEvent.click(
      screen
        .getByText('Overall (geomean-normalised)')
        .closest('tr') as HTMLTableRowElement
    );
    expect(screen.getByLabelText('Chrome is faster')).toBeChecked();
    expect(listed()).toEqual(['betaFunc']);
    fireEvent.click(screen.getByLabelText('Chrome is slower'));
    expect(listed()).toEqual(['gammaFunc']);
  });

  it('keeps the direction filter in the URL state', async () => {
    const { store } = setup();
    await screen.findByText('Overall (geomean-normalised)');

    fireEvent.click(screen.getByLabelText('Firefox is slower'));
    expect(getBenchmarkBucketFilter(store.getState())).toEqual({
      mode: 'movers',
      // Not pinned to an index until the reader picks one.
      subject: null,
      comparand: 'best',
      show: 'slower',
    });

    fireEvent.change(screen.getByLabelText('Profile the report is about'), {
      target: { value: '0' },
    });
    expect(getBenchmarkBucketFilter(store.getState())).toMatchObject({
      subject: 0,
      show: 'faster',
    });
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

  it('offers no upload when every profile is already uploaded', async () => {
    setup();
    await screen.findByText('Overall (geomean-normalised)');
    expect(screen.queryByText('Upload profiles')).not.toBeInTheDocument();
  });

  it('uploads the profiles and points the page at the uploaded copies', async () => {
    const fromUrl = (name: string) =>
      'https://profiler.firefox.com/from-url/' +
      encodeURIComponent(`https://example.com/${name}.json.gz`) +
      '/';
    const { store } = setup(2, [fromUrl('base'), fromUrl('new')]);
    await screen.findByText('Overall (geomean-normalised)');

    let finishUpload: (urls: string[]) => void = () => {};
    jest
      .mocked(uploadComparedProfiles)
      .mockImplementation((_urls, _names, onProgress) => {
        onProgress({ index: 1, count: 2, fraction: 0.5 });
        return new Promise((resolve) => {
          finishUpload = resolve;
        });
      });
    fireEvent.click(screen.getByText('Upload profiles'));
    expect(uploadComparedProfiles).toHaveBeenCalledWith(
      [fromUrl('base'), fromUrl('new')],
      ['Chrome', 'Firefox'],
      expect.any(Function)
    );
    expect(
      screen.getByText('Uploading profile 2 of 2: 50%')
    ).toBeInTheDocument();

    finishUpload(URLS.slice(0, 2));
    expect(
      await screen.findByText(/The profiles are uploaded/)
    ).toBeInTheDocument();
    expect(getProfilesToCompare(store.getState())).toEqual(URLS.slice(0, 2));
    expect(
      [...document.querySelectorAll('.benchmarkProfileLinks a')].map((a) =>
        a.getAttribute('href')
      )
    ).toEqual(URLS.slice(0, 2));
    expect(screen.queryByText('Upload profiles')).not.toBeInTheDocument();
  });
});
