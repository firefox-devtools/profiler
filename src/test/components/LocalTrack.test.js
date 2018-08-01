/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import {
  changeSelectedThread,
  hideLocalTrack,
} from '../../actions/profile-view';
import LocalTrack from '../../components/timeline/LocalTrack';
import {
  getLocalTracks,
  getRightClickedTrack,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';

const LEFT_CLICK = 0;
const RIGHT_CLICK = 2;

describe('timeline/LocalTrack', function() {
  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain process]',
   *    'show [thread GeckoMain tab]',
   *    '  - show [thread DOM Worker]',         <- use this local track.
   *    '  - show [thread Style]',
   *  ]
   */
  function setup() {
    // In getProfileWithNiceTracks, the two pids are 111 and 222 for the
    // "GeckoMain process" and "GeckoMain tab" respectively. Use 222 since it has
    // local tracks.
    const pid = 222;
    const trackIndex = 0;
    const profile = getProfileWithNiceTracks();
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const trackReference = { type: 'local', pid, trackIndex };
    const localTrack = getLocalTracks(getState(), pid)[trackIndex];
    if (localTrack.type !== 'thread') {
      throw new Error('Expected a thread track.');
    }
    const { threadIndex } = localTrack;

    // The assertions are simpler if this thread is not already selected.
    dispatch(changeSelectedThread(threadIndex + 1));

    const view = mount(
      <Provider store={store}>
        <LocalTrack pid={pid} localTrack={localTrack} trackIndex={trackIndex} />
      </Provider>
    );

    const getLocalTrackLabel = () => view.find('.timelineTrackLabel').first();
    const getLocalTrackRow = () => view.find('.timelineTrackLocalRow').first();

    return {
      dispatch,
      getState,
      profile,
      store,
      view,
      trackReference,
      trackIndex,
      threadIndex,
      pid,
      getLocalTrackLabel,
      getLocalTrackRow,
    };
  }

  it('matches the snapshot of a local track', () => {
    const { view } = setup();
    expect(view).toMatchSnapshot();
  });

  it('has the correct selectors into useful parts of the component', function() {
    const { getLocalTrackLabel, getLocalTrackRow } = setup();
    expect(getLocalTrackLabel().text()).toBe('DOM Worker');
    expect(getLocalTrackRow().exists()).toBe(true);
  });

  it('starts out not being selected', function() {
    const { getState, threadIndex, trackReference, getLocalTrackRow } = setup();
    expect(getRightClickedTrack(getState())).not.toEqual(trackReference);
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    expect(getLocalTrackRow().hasClass('selected')).toBe(false);
  });

  it('can select a thread by clicking the label', () => {
    const {
      getState,
      getLocalTrackLabel,
      threadIndex,
      getLocalTrackRow,
    } = setup();
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    getLocalTrackLabel().simulate('mousedown', { button: LEFT_CLICK });
    expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
    expect(getLocalTrackRow().hasClass('selected')).toBe(true);
  });

  it('can right click a thread', () => {
    const {
      getState,
      getLocalTrackLabel,
      threadIndex,
      trackReference,
    } = setup();

    getLocalTrackLabel().simulate('mousedown', { button: RIGHT_CLICK });
    expect(getRightClickedTrack(getState())).toEqual(trackReference);
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
  });

  it('can select a thread by clicking the row', () => {
    const { getState, getLocalTrackRow, threadIndex } = setup();
    expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    getLocalTrackRow().simulate('click');
    expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
  });

  it('will render a stub div if the track is hidden', () => {
    const { view, trackIndex, pid, dispatch } = setup();
    dispatch(hideLocalTrack(pid, trackIndex));
    view.update();
    expect(view.find('.timelineTrackHidden').exists()).toBe(true);
    expect(view.find('.timelineTrack').exists()).toBe(false);
  });
});
