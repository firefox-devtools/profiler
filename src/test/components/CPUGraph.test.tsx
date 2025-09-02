/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { enableExperimentalCPUGraphs } from 'firefox-profiler/actions/app';
import { ensureExists } from 'firefox-profiler/utils/types';
import { TimelineTrackThread } from 'firefox-profiler/components/timeline/TrackThread';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  addCpuUsageValues,
} from '../fixtures/profiles/processed-profile';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

// Mocking the ActivityGraph and SampleGraph because we don't want to see the
// content/draw log of it in these tests. It has its own tests.
jest.mock('firefox-profiler/components/shared/thread/ActivityGraph', () => ({
  ThreadActivityGraph: 'thread-activity-graph',
}));
jest.mock('firefox-profiler/components/shared/thread/SampleGraph', () => ({
  ThreadSampleGraph: 'sample-graph',
}));

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 8;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;

describe('CPUGraph', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });
  autoMockIntersectionObserver();

  function getSamplesProfile() {
    const profile = getProfileFromTextSamples(`
      A[cat:DOM]  A[cat:DOM]       A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]
      B           B                B             B             B             B             B             B
      C           C                H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  C
      D           F[cat:Graphics]  I             I             I             I             I             F[cat:Graphics]
      E           G                                                                                      G
    `).profile;

    // Adding CPU usage values, so we can see the CPU graph properly.
    addCpuUsageValues(
      profile,
      [null, 400, 1000, 500, 100, 200, 800, 300],
      'µs'
    );

    return profile;
  }

  function setup() {
    const profile = getSamplesProfile();
    const store = storeWithProfile(profile);
    const { dispatch } = store;
    const flushRafCalls = mockRaf();

    // Enable the CPU Graph
    dispatch(enableExperimentalCPUGraphs());

    render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={0}
          trackType="expanded"
          trackName="Test Track"
        />
      </Provider>
    );

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const cpuGraphCanvas = ensureExists(
      document.querySelector('.threadCPUGraphCanvas'),
      `Couldn't find the CPU graph canvas, with selector .threadCPUGraphCanvas`
    );

    return {
      cpuGraphCanvas,
    };
  }

  it('matches the component snapshot', () => {
    const { cpuGraphCanvas } = setup();
    expect(cpuGraphCanvas).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    setup();
    expect(flushDrawLog()).toMatchSnapshot();
  });
});
