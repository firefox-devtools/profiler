/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render, fireEvent } from 'react-testing-library';

import {
  changeSelectedThread,
  hideGlobalTrack,
} from '../../actions/profile-view';
import GlobalTrack from '../../components/timeline/GlobalTrack';
import { getGlobalTracks, getRightClickedTrack } from '../../selectors/profile';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';
import { getBoundingBox } from '../fixtures/utils';

const LEFT_CLICK = 0;
const RIGHT_CLICK = 2;

describe('timeline/GlobalTrack', function() {
  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain process]',
   *    'show [thread GeckoMain tab]',       <- use this global track.
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]',
   *  ]
   */
  function setup() {
    const trackIndex = 1;
    const profile = getProfileWithNiceTracks();
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const trackReference = { type: 'global', trackIndex };
    const tracks = getGlobalTracks(getState());
    const track = tracks[trackIndex];
    if (track.type !== 'process') {
      throw new Error('Expected a process track.');
    }
    const threadIndex = track.mainThreadIndex;
    if (threadIndex === null) {
      throw new Error('Expected the track to have a thread index.');
    }

    // Some child components render to canvas.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext());
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(400, 400));

    // The assertions are simpler if this thread is not already selected.
    dispatch(changeSelectedThread(threadIndex + 1));

    const renderResult = render(
      <Provider store={store}>
        <GlobalTrack trackIndex={trackIndex} trackReference={trackReference} />
      </Provider>
    );
    const { container } = renderResult;

    const getGlobalTrackLabel = () =>
      ensureExists(
        container.querySelector('.timelineTrackLabel'),
        `Couldn't find the track label with selector .timelineTrackLabel`
      );
    const getGlobalTrackRow = () =>
      ensureExists(
        container.querySelector('.timelineTrackGlobalRow'),
        `Couldn't find the track global row with selector .timelineTrackGlobalRow`
      );

    return {
      ...renderResult,
      dispatch,
      getState,
      profile,
      store,
      trackReference,
      trackIndex,
      threadIndex,
      getGlobalTrackLabel,
      getGlobalTrackRow,
    };
  }

  it('matches the snapshot of a global track', () => {
    const { container } = setup();
    expect(container.firstChild).toMatchSnapshot();
  });

  it('has the correct selectors into useful parts of the component', function() {
    const { getGlobalTrackLabel, getGlobalTrackRow } = setup();
    expect(getGlobalTrackLabel().textContent).toBe('Content Process');
    expect(getGlobalTrackRow()).toBeTruthy();
  });

  it('starts out not being selected', function() {
    const {
      getState,
      getGlobalTrackRow,
      threadIndex,
      trackReference,
    } = setup();
    expect(getRightClickedTrack(getState())).not.toEqual(trackReference);
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    expect(getGlobalTrackRow().classList.contains('selected')).toBe(false);
  });

  it('can select a thread by clicking the label', () => {
    const {
      getState,
      getGlobalTrackLabel,
      getGlobalTrackRow,
      threadIndex,
    } = setup();
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    fireEvent.mouseDown(getGlobalTrackLabel(), { button: LEFT_CLICK });
    expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
    expect(getGlobalTrackRow().classList.contains('selected')).toBe(true);
  });

  it('can right click a thread', () => {
    const {
      getState,
      getGlobalTrackLabel,
      threadIndex,
      trackReference,
    } = setup();

    fireEvent.mouseDown(getGlobalTrackLabel(), { button: RIGHT_CLICK });
    expect(getRightClickedTrack(getState())).toEqual(trackReference);
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
  });

  it('can select a thread by clicking the row', () => {
    const { getState, getGlobalTrackRow, threadIndex } = setup();
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    fireEvent.click(getGlobalTrackRow());
    expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
  });

  it('will render a stub div if the track is hidden', () => {
    const { container, trackIndex, dispatch } = setup();
    dispatch(hideGlobalTrack(trackIndex));
    expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
    expect(container.querySelector('.timelineTrack')).toBeFalsy();
  });
});
