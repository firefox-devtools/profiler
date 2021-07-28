/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { ensureExists } from 'firefox-profiler/utils/flow';
import { TimelineTrackThread } from 'firefox-profiler/components/timeline/TrackThread';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick } from '../fixtures/utils';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { autoMockElementSize } from '../fixtures/mocks/element-size';

import type {
  Profile,
  IndexIntoSamplesTable,
  CssPixels,
} from 'firefox-profiler/types';

// Mocking the ActivityGraph because we don't want to see the content/draw log
// of it in these tests. It has its own tests.
jest.mock('firefox-profiler/components/shared/thread/ActivityGraph', () => ({
  ThreadActivityGraph: 'thread-activity-graph',
}));

// The following constants determine the size of the drawn graph.
const SAMPLE_COUNT = 8;
const PIXELS_PER_SAMPLE = 10;
const GRAPH_WIDTH = PIXELS_PER_SAMPLE * SAMPLE_COUNT;
const GRAPH_HEIGHT = 10;
function getSamplesPixelPosition(
  sampleIndex: IndexIntoSamplesTable
): CssPixels {
  // Compute the pixel position of the center of a given sample.
  return sampleIndex * PIXELS_PER_SAMPLE + PIXELS_PER_SAMPLE * 0.5;
}

describe('SampleGraph', function() {
  autoMockCanvasContext();
  autoMockElementSize({ width: GRAPH_WIDTH, height: GRAPH_HEIGHT });

  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      A[cat:DOM]  A[cat:DOM]       A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]
      B           B                B             B             B             B             B             B
      C           C                H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other]  C
      D           F[cat:Graphics]  I             I             I             I             I             F[cat:Graphics]
      E           G                                                                                      G
    `).profile;
  }

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const flushRafCalls = mockRaf();

    const renderResult = render(
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

    const sampleGraphCanvas = ensureExists(
      document.querySelector('.threadSampleGraphCanvas'),
      `Couldn't find the sample graph canvas, with selector .threadSampleGraphCanvas`
    );
    const thread = profile.threads[0];

    // Perform a click on the sample graph.
    function clickSampleGraph(index: IndexIntoSamplesTable) {
      fireFullClick(sampleGraphCanvas, {
        pageX: getSamplesPixelPosition(index),
        pageY: GRAPH_HEIGHT / 2,
      });
    }

    // This function gets the selected call node path as a list of function names.
    function getCallNodePath() {
      return selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map(funcIndex =>
          thread.stringTable.getString(thread.funcTable.name[funcIndex])
        );
    }

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      thread,
      store,
      sampleGraphCanvas,
      clickSampleGraph,
      getCallNodePath,
    };
  }

  it('matches the component snapshot', () => {
    const { sampleGraphCanvas } = setup();
    expect(sampleGraphCanvas).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    setup();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  /**
   * The ThreadSampleGraph is not a connected component. It's easiest to test it
   * as once it's connected to the Redux store in the TrackThread.
   */
  describe('ThreadSampleGraph', function() {
    it('selects the full call node path when clicked', function() {
      const { clickSampleGraph, getCallNodePath } = setup();

      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      clickSampleGraph(1);
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);

      // The full call node at this sample is:
      //  A -> B -> H -> I
      clickSampleGraph(2);
      expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'I']);
    });
  });
});
