/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type {
  Profile,
  IndexIntoSamplesTable,
  CssPixels,
} from 'firefox-profiler/types';

import * as React from 'react';
import { Provider } from 'react-redux';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getTimelineType } from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';
import { TimelineTrackThread } from '../../components/timeline/TrackThread';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox, fireFullClick } from '../fixtures/utils';

import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';

import { commitRange } from '../../actions/profile-view';

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

describe('ThreadActivityGraph', function() {
  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      A[cat:DOM]   A[cat:DOM]       A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]     A[cat:DOM]
      B            B                B              B              B              B              B              B
      C            C                H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  H[cat:Layout]  C
      D            F[cat:Graphics]  I              I              I              I              I              F[cat:Graphics]
      E[cat:Idle]  G                                                                                           G
    `).profile;
  }

  function setup(profile: Profile = getSamplesProfile()) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const threadIndex = 0;
    const flushRafCalls = mockRaf();
    const ctx = mockCanvasContext();

    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(GRAPH_WIDTH, GRAPH_HEIGHT));

    const renderResult = render(
      <Provider store={store}>
        <TimelineTrackThread
          threadsKey={0}
          trackType="expanded"
          trackName="Test Track"
        />
      </Provider>
    );
    const { container } = renderResult;

    // WithSize uses requestAnimationFrame
    flushRafCalls();

    const activityGraphCanvas = ensureExists(
      container.querySelector('.threadActivityGraphCanvas'),
      `Couldn't find the activity graph canvas, with selector .threadActivityGraphCanvas`
    );
    const thread = profile.threads[0];

    // Perform a click on the activity graph.
    function clickActivityGraph(
      index: IndexIntoSamplesTable,
      graphHeightPercentage: number
    ) {
      fireFullClick(activityGraphCanvas, {
        pageX: getSamplesPixelPosition(index),
        pageY: GRAPH_HEIGHT * graphHeightPercentage,
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
      threadIndex,
      activityGraphCanvas,
      clickActivityGraph,
      getCallNodePath,
      ctx,
    };
  }

  it('matches the component snapshot', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    const { ctx } = setup();
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot with CPU values', () => {
    const profile = getSamplesProfile();
    profile.meta.interval = 1;
    profile.meta.sampleUnits = {
      time: 'ms',
      eventDelay: 'ms',
      threadCPUDelta: 'variable CPU cycles',
    };
    profile.threads[0].samples.threadCPUDelta = [
      null,
      400,
      1000,
      500,
      100,
      200,
      800,
      300,
    ];

    const { ctx, getState } = setup(profile);
    // If there are CPU values, it should be automatically defaulted to this view.
    expect(getTimelineType(getState())).toBe('cpu-category');
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });

  /**
   * The ThreadActivityGraph is not a connected component. It's easiest to test it
   * as once it's connected to the Redux store in the SelectedActivityGraph.
   */
  describe('ThreadActivityGraph', function() {
    it('selects the full call node path when clicked', function() {
      const { clickActivityGraph, getCallNodePath } = setup();

      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      clickActivityGraph(1, 0.2);
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);

      // The full call node at this sample is:
      //  A -> B -> H -> I
      clickActivityGraph(1, 0.8);
      expect(getCallNodePath()).toEqual(['A', 'B', 'H', 'I']);
    });

    it('will redraw even when there are no samples in range', function() {
      const { dispatch, ctx } = setup();
      ctx.__flushDrawLog();

      // Commit a thin range which contains no samples
      dispatch(commitRange(0.5, 0.6));
      const drawCalls = ctx.__flushDrawLog();
      // We use the presence of 'globalCompositeOperation' to know
      // whether the canvas was redrawn or not.
      expect(drawCalls.map(([fn]) => fn)).toContain(
        'set globalCompositeOperation'
      );
    });
  });
});
