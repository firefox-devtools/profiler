/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Viewport } from '../../components/shared/chart/Viewport';
import type { Profile, IndexIntoSamplesTable } from '../../types/profile';
import type { CssPixels } from '../../types/units';

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import SelectedThreadActivityGraph from '../../components/shared/thread/SelectedActivityGraph';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox, getMouseEvent } from '../fixtures/utils';

import { getProfileFromTextSamples } from '../fixtures/profiles/make-profile';

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

/**
 * This test is asserting behavior of the ThreadStackGraph component. It does this
 * by using the SelectedThreadActivityGraph component, which is a connected version
 * that is used in the CallTree.
 */
describe('SelectedThreadActivityGraph', function() {
  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      A[cat:DOM]  A[cat:DOM]       A[cat:DOM]    A[cat:DOM]    A[cat:DOM]    A[cat:DOM]   A[cat:DOM]    A[cat:DOM]
      B           B                B             B             B             B            B             B
      C           C                H[cat:Other]  H[cat:Other]  H[cat:Other]  H[cat:Other] H[cat:Other]  C
      D           F[cat:Graphics]  I             I             I             I            I             F[cat:Graphics]
      E           G                                                                                     G
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

    const viewport: Viewport = {
      containerWidth: GRAPH_WIDTH,
      containerHeight: GRAPH_HEIGHT,
      viewportLeft: 0,
      viewportRight: 1,
      viewportTop: 0,
      viewportBottom: GRAPH_HEIGHT,
      isDragging: false,
      moveViewport: (_x: CssPixels, _y: CssPixels) => {},
      isSizeSet: true,
    };

    const view = mount(
      <Provider store={store}>
        <SelectedThreadActivityGraph viewport={viewport} />
      </Provider>
    );

    // WithSize uses requestAnimationFrame
    flushRafCalls();
    view.update();

    const activityGraphCanvas = view.find('.threadActivityGraphCanvas').first();
    const stackGraphCanvas = view.find('.threadStackGraphCanvas').first();
    const thread = profile.threads[0];

    // Perform a click on the activity graph.
    function clickActivityGraph(
      index: IndexIntoSamplesTable,
      graphHeightPercentage: number
    ) {
      return activityGraphCanvas.simulate(
        'mouseup',
        getMouseEvent({
          pageX: getSamplesPixelPosition(index),
          pageY: GRAPH_HEIGHT * graphHeightPercentage,
        })
      );
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
      dispatch,
      getState,
      profile,
      thread,
      store,
      view,
      threadIndex,
      activityGraphCanvas,
      stackGraphCanvas,
      clickActivityGraph,
      getCallNodePath,
      ctx,
    };
  }

  it('matches the component snapshot', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
  });

  it('matches the 2d canvas draw snapshot', () => {
    const { ctx } = setup();
    expect(ctx.__flushDrawLog()).toMatchSnapshot();
  });

  it('has the correct selectors into useful parts of the component for the samples profile', function() {
    const { activityGraphCanvas, stackGraphCanvas } = setup();
    expect(activityGraphCanvas.exists()).toBe(true);
    expect(stackGraphCanvas.exists()).toBe(true);
  });

  /**
   * The ThreadActivityGraph is not a connected component. It's easiest to test it
   * as once it's connected to the Redux store in the SelectedActivityGraph.
   */
  describe('ThreadActivityGraph', function() {
    it('can click a a best ancestor call node', function() {
      const { clickActivityGraph, getCallNodePath } = setup();

      // The full call node at this sample is:
      //  A -> B -> C -> F -> G
      // However, the best ancestor call node is:
      //  A -> B -> C -> F
      // As this is the most common ancestor with the same category.
      clickActivityGraph(1, 0.2);
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F']);

      // The full call node at this sample is:
      //  A -> B -> H -> I
      // However, the best ancestor call node is:
      //  A -> B -> H
      // As this is the most common ancestor with the same category.
      clickActivityGraph(1, 0.8);
      expect(getCallNodePath()).toEqual(['A', 'B', 'H']);
    });
  });

  /**
   * For completeness, test that the ThreadStackGraph is clickable, as it is using
   * a different method than the ThreadActivityGraph to select a call node.
   */
  describe('ThreadStackGraph', function() {
    it('can click a stack', function() {
      const { stackGraphCanvas, getCallNodePath } = setup();
      stackGraphCanvas.simulate(
        'mouseup',
        getMouseEvent({ pageX: getSamplesPixelPosition(1) })
      );
      expect(getCallNodePath()).toEqual(['A', 'B', 'C', 'F', 'G']);
    });
  });
});
