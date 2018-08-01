/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { Profile } from '../../types/profile';

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import { changeSelectedThread } from '../../actions/profile-view';
import TrackThread from '../../components/timeline/TrackThread';
import {
  selectedThreadSelectors,
  getSelection,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox, getMouseEvent } from '../fixtures/utils';

import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
  getEmptyThread,
} from '../fixtures/profiles/make-profile';

describe('timeline/TrackThread', function() {
  function getSamplesProfile() {
    return getProfileFromTextSamples(`
      a  d  g  j
      b  e  h  k
      c  f  i  l
    `).profile;
  }

  function getMarkersProfile() {
    const profile = getProfileWithMarkers([
      ['Marker A', 0, { startTime: 0, endTime: 1 }],
      ['Marker B', 1, { startTime: 1, endTime: 2 }],
      ['Marker C', 2, { startTime: 2, endTime: 3 }],
      ['Marker D', 3, { startTime: 3, endTime: 4 }],
    ]);
    const [thread] = profile.threads;
    thread.name = 'GeckoMain';
    thread.processType = 'default';
    return profile;
  }

  function setup(profile: Profile) {
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
      .mockImplementation(() => getBoundingBox(400, 50));

    const view = mount(
      <Provider store={store}>
        <TrackThread threadIndex={threadIndex} />
      </Provider>
    );

    // WithSize uses requestAnimationFrame
    flushRafCalls();
    view.update();

    const stackGraphCanvas = view.find('.timelineStackGraphCanvas').first();
    const tracingMarkersCanvas = view
      .find(
        [
          '.timelineTrackThreadIntervalMarkerOverviewThreadGeckoMain',
          '.timelineTracingMarkersCanvas',
        ].join(' ')
      )
      .first();

    return {
      dispatch,
      getState,
      profile,
      thread: profile.threads[0],
      store,
      view,
      threadIndex,
      stackGraphCanvas,
      tracingMarkersCanvas,
    };
  }

  it('matches the snapshot', () => {
    const { view } = setup(getSamplesProfile());
    expect(view).toMatchSnapshot();
  });

  it('has the correct selectors into useful parts of the component for the samples profile', function() {
    const { stackGraphCanvas } = setup(getSamplesProfile());
    expect(stackGraphCanvas.exists()).toBe(true);
  });

  it('has the correct selectors into useful parts of the component for the markers profile', function() {
    const { tracingMarkersCanvas } = setup(getMarkersProfile());
    expect(tracingMarkersCanvas.exists()).toBe(true);
  });

  it('can click a stack in the stack graph', function() {
    const { getState, stackGraphCanvas, thread } = setup(getSamplesProfile());

    // Provide a quick helper for nicely asserting the call node path.
    const getCallNodePath = () =>
      selectedThreadSelectors
        .getSelectedCallNodePath(getState())
        .map(funcIndex =>
          thread.stringTable.getString(thread.funcTable.name[funcIndex])
        );

    stackGraphCanvas.simulate('mouseup', getMouseEvent({ pageX: 50 }));
    expect(getCallNodePath()).toEqual(['a', 'b', 'c']);

    stackGraphCanvas.simulate('mouseup', getMouseEvent({ pageX: 150 }));
    expect(getCallNodePath()).toEqual(['d', 'e', 'f']);

    stackGraphCanvas.simulate('mouseup', getMouseEvent({ pageX: 250 }));
    expect(getCallNodePath()).toEqual(['g', 'h', 'i']);

    stackGraphCanvas.simulate('mouseup', getMouseEvent({ pageX: 350 }));
    expect(getCallNodePath()).toEqual(['j', 'k', 'l']);
  });

  it('can click a marker', function() {
    const { getState, tracingMarkersCanvas } = setup(getMarkersProfile());

    function clickAndGetMarkerName(pageX: number) {
      tracingMarkersCanvas.simulate('mousedown', getMouseEvent({ pageX }));
      tracingMarkersCanvas.simulate('mouseup', getMouseEvent({ pageX }));
      return getSelection(getState());
    }

    expect(clickAndGetMarkerName(50)).toMatchObject({
      selectionStart: 0,
      selectionEnd: 1,
    });

    expect(clickAndGetMarkerName(150)).toMatchObject({
      selectionStart: 1,
      selectionEnd: 2,
    });
  });

  it('changes the selected thread when clicking a marker', function() {
    const profile = getMarkersProfile();
    profile.threads.push(getEmptyThread());
    const { getState, dispatch, tracingMarkersCanvas } = setup(profile);
    const thisThread = 0;
    const otherThread = 1;

    dispatch(changeSelectedThread(otherThread));
    expect(getSelectedThreadIndex(getState())).toBe(otherThread);

    tracingMarkersCanvas.simulate('mousedown', getMouseEvent({ pageX: 50 }));
    tracingMarkersCanvas.simulate('mouseup', getMouseEvent({ pageX: 50 }));
    expect(getSelectedThreadIndex(getState())).toBe(thisThread);
  });
});
