/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import type { TrackReference } from '../../types/actions';
import type { Store } from '../../types/store';
import type { LocalTrack } from '../../types/profile-derived';

import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import {
  changeSelectedThread,
  hideLocalTrack,
} from '../../actions/profile-view';
import TimelineLocalTrack from '../../components/timeline/LocalTrack';
import {
  getRightClickedTrack,
  getLocalTrackFromReference,
  getProfile,
} from '../../selectors/profile';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getNetworkTrackProfile } from '../fixtures/profiles/processed-profile';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';

// In getProfileWithNiceTracks, the two pids are 111 and 222 for the
// "GeckoMain process" and "GeckoMain tab" respectively. Use 222 since it has
// local tracks.
const PID = 222;
const LEFT_CLICK = 0;
const RIGHT_CLICK = 2;

describe('timeline/LocalTrack', function() {
  describe('with a thread track', function() {
    it('matches the snapshot of a local track', () => {
      const { view } = setupThreadTrack();
      expect(view).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function() {
      const { getLocalTrackLabel, getLocalTrackRow } = setupThreadTrack();
      expect(getLocalTrackLabel().text()).toBe('DOM Worker');
      expect(getLocalTrackRow().exists()).toBe(true);
    });

    it('starts out not being selected', function() {
      const {
        getState,
        threadIndex,
        trackReference,
        getLocalTrackRow,
      } = setupThreadTrack();
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
      } = setupThreadTrack();
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
      } = setupThreadTrack();

      getLocalTrackLabel().simulate('mousedown', { button: RIGHT_CLICK });
      expect(getRightClickedTrack(getState())).toEqual(trackReference);
      expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
    });

    it('can select a thread by clicking the row', () => {
      const { getState, getLocalTrackRow, threadIndex } = setupThreadTrack();
      expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
      getLocalTrackRow().simulate('click');
      expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
    });

    it('will render a stub div if the track is hidden', () => {
      const { view, pid, trackReference, dispatch } = setupThreadTrack();
      dispatch(hideLocalTrack(pid, trackReference.trackIndex));
      view.update();
      expect(view.find('.timelineTrackHidden').exists()).toBe(true);
      expect(view.find('.timelineTrack').exists()).toBe(false);
    });
  });

  describe('with a network track', function() {
    it('has correctly renders the network label', function() {
      const { getLocalTrackLabel } = setupWithNetworkProfile();
      expect(getLocalTrackLabel().text()).toBe('Network');
    });

    it('matches the snapshot of the network track', () => {
      const { view } = setupWithNetworkProfile();
      expect(view).toMatchSnapshot();
    });
  });
});

function setup(
  store: Store,
  trackReference: TrackReference,
  localTrack: LocalTrack
) {
  const { getState, dispatch } = store;
  if (localTrack.type === 'memory') {
    throw new Error('This test assumes that the local track has a thread.');
  }
  const { threadIndex } = localTrack;
  // The assertions are simpler if this thread is not already selected.
  dispatch(changeSelectedThread(threadIndex + 1));

  // Some child components render to canvas.
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(() => mockCanvasContext());

  const view = mount(
    <Provider store={store}>
      <TimelineLocalTrack
        pid={PID}
        localTrack={localTrack}
        trackIndex={trackReference.trackIndex}
      />
    </Provider>
  );

  const getLocalTrackLabel = () => view.find('.timelineTrackLabel').first();
  const getLocalTrackRow = () => view.find('.timelineTrackLocalRow').first();

  return {
    dispatch,
    getState,
    profile: getProfile(getState()),
    store,
    view,
    trackReference,
    threadIndex,
    pid: PID,
    getLocalTrackLabel,
    getLocalTrackRow,
  };
}

/**
 *  getProfileWithNiceTracks() looks like: [
 *    'show [thread GeckoMain process]',
 *    'show [thread GeckoMain tab]',
 *    '  - show [thread DOM Worker]',         <- use this local track.
 *    '  - show [thread Style]',
 *  ]
 */
function setupThreadTrack() {
  // Select the first local track index, which should be the one noted in the
  // the comment above.
  const trackIndex = 0;
  const profile = getProfileWithNiceTracks();
  const store = storeWithProfile(profile);
  const trackReference = { type: 'local', pid: PID, trackIndex };
  const localTrack = getLocalTrackFromReference(
    store.getState(),
    trackReference
  );
  if (localTrack.type !== 'thread') {
    throw new Error('Expected a thread track.');
  }
  return setup(store, trackReference, localTrack);
}

function setupWithNetworkProfile() {
  // Select the 2nd track, which will be the network track, while the first is the
  // main thread.
  const trackIndex = 1;
  const profile = getNetworkTrackProfile();
  profile.threads[0].pid = PID;

  const store = storeWithProfile(profile);
  const trackReference = { type: 'local', pid: PID, trackIndex };
  const localTrack = getLocalTrackFromReference(
    store.getState(),
    trackReference
  );
  if (localTrack.type !== 'network') {
    throw new Error('Expected a network track.');
  }
  return setup(store, trackReference, localTrack);
}
