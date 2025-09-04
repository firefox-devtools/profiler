/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  TrackReference,
  Store,
  ThreadIndex,
  LocalTrack,
} from 'firefox-profiler/types';
import { Provider } from 'react-redux';

import { render, act } from 'firefox-profiler/test/fixtures/testing-library';
import {
  changeSelectedThreads,
  hideLocalTrack,
  showLocalTrack,
} from '../../actions/profile-view';
import { TimelineLocalTrack } from '../../components/timeline/LocalTrack';
import {
  getRightClickedTrack,
  getLocalTrackFromReference,
  getProfile,
} from '../../selectors/profile';
import { ensureExists } from '../../utils/types';
import { getFirstSelectedThreadIndex } from '../../selectors/url-state';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import {
  getNetworkTrackProfile,
  getIPCTrackProfile,
} from '../fixtures/profiles/processed-profile';
import {
  getProfileWithNiceTracks,
  getStoreWithMemoryTrack,
} from '../fixtures/profiles/tracks';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick, fireFullContextMenu } from '../fixtures/utils';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

// In getProfileWithNiceTracks, the two pids are 111 and 222 for the
// "GeckoMain process" and "GeckoMain tab" respectively. Use 222 since it has
// local tracks.
const PID = '222';

describe('timeline/LocalTrack', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: 400, height: 400 });
  autoMockIntersectionObserver();

  describe('with a thread track', function () {
    it('matches the snapshot of a local track', () => {
      const { container } = setupThreadTrack();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has the correct selectors into useful parts of the component', function () {
      const { getLocalTrackLabel, getLocalTrackRow } = setupThreadTrack();
      expect(getLocalTrackLabel()).toHaveTextContent('DOM Worker');
      expect(getLocalTrackRow()).toBeTruthy();
    });

    it('starts out not being selected', function () {
      const { getState, threadIndex, trackReference, getLocalTrackRow } =
        setupThreadTrack();
      expect(getRightClickedTrack(getState())).not.toEqual(trackReference);
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      expect(getLocalTrackRow()).not.toHaveClass('selected');
    });

    it('can select a thread by clicking the label', () => {
      const { getState, getLocalTrackLabel, threadIndex, getLocalTrackRow } =
        setupThreadTrack();
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      fireFullClick(getLocalTrackLabel());
      expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
      expect(getLocalTrackRow()).toHaveClass('selected');
    });

    it('can right click a thread on the label', () => {
      const { getState, getLocalTrackLabel, threadIndex, trackReference } =
        setupThreadTrack();

      fireFullContextMenu(getLocalTrackLabel());
      expect(getRightClickedTrack(getState())).toEqual(trackReference);
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    });

    it('can select a thread by clicking the track content', () => {
      const { getState, getLocalTrackContent, threadIndex } =
        setupThreadTrack();
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
      fireFullClick(getLocalTrackContent());
      expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
    });

    it('can right click a thread on the track content', () => {
      const { getState, getLocalTrackContent, threadIndex, trackReference } =
        setupThreadTrack();

      fireFullContextMenu(getLocalTrackContent());
      expect(getRightClickedTrack(getState())).toEqual(trackReference);
      expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    });

    it('will render a stub div if the track is hidden', () => {
      const { container, pid, trackReference, dispatch } = setupThreadTrack();
      act(() => {
        dispatch(hideLocalTrack(pid, trackReference.trackIndex));
      });
      expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
      expect(container.querySelector('.timelineTrack')).toBeFalsy();
    });
  });

  describe('with a network track', function () {
    it('has correctly renders the network label', function () {
      const { getLocalTrackLabel } = setupWithNetworkProfile();
      expect(getLocalTrackLabel()).toHaveTextContent('Network');
    });

    it('matches the snapshot of the network track', () => {
      const { container } = setupWithNetworkProfile();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('with a memory track', function () {
    it('correctly renders the network label', function () {
      const { getLocalTrackLabel } = setupWithMemory();
      expect(getLocalTrackLabel()).toHaveTextContent('Memory');
    });

    it('matches the snapshot of the memory track', () => {
      const { container } = setupWithMemory();
      expect(container.firstChild).toMatchSnapshot();
    });
  });

  describe('with an IPC track', function () {
    it('appears hidden by default', function () {
      const { container } = setupWithIPC();
      expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
      expect(container.querySelector('.timelineTrack')).toBeFalsy();
    });

    it('can be shown', function () {
      const { dispatch, pid, trackReference, container } = setupWithIPC();

      // First check that the IPC track is hidden by default.
      expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
      expect(container.querySelector('.timelineTrack')).toBeFalsy();

      // Now make it visible and check it.
      act(() => {
        dispatch(showLocalTrack(pid, trackReference.trackIndex));
      });
      expect(container.querySelector('.timelineTrackHidden')).toBeFalsy();
      expect(container.querySelector('.timelineTrack')).toBeTruthy();
    });

    it('correctly renders the IPC label', function () {
      const { dispatch, pid, trackReference, getLocalTrackLabel } =
        setupWithIPC();
      act(() => {
        dispatch(showLocalTrack(pid, trackReference.trackIndex));
      });
      expect(getLocalTrackLabel()).toHaveTextContent('IPC — Empty');
    });

    it('matches the snapshot of the IPC track', () => {
      const { pid, dispatch, trackReference, container, flushRafCalls } =
        setupWithIPC();
      act(() => {
        dispatch(showLocalTrack(pid, trackReference.trackIndex));
      });
      flushRafCalls();
      expect(container.firstChild).toMatchSnapshot();
    });
  });
});

function setup(
  store: Store,
  trackReference: TrackReference,
  localTrack: LocalTrack,
  threadIndex: ThreadIndex
) {
  const { getState, dispatch } = store;
  const setIsInitialSelectedPane = () => {};
  // The assertions are simpler if this thread is not already selected.
  dispatch(changeSelectedThreads(new Set([threadIndex + 1])));

  // WithSize uses requestAnimationFrame
  const flushRafCalls = mockRaf();
  const renderResult = render(
    <Provider store={store}>
      <TimelineLocalTrack
        pid={PID}
        localTrack={localTrack}
        trackIndex={trackReference.trackIndex}
        setIsInitialSelectedPane={setIsInitialSelectedPane}
      />
    </Provider>
  );
  flushRafCalls();

  const { container } = renderResult;

  const getLocalTrackLabel = () =>
    ensureExists(
      container.querySelector('.timelineTrackLabel'),
      `Couldn't find the track label with selector .timelineTrackLabel`
    ) as HTMLElement;
  const getLocalTrackContent = () =>
    ensureExists(
      container.querySelector('.timelineTrackTrack'),
      `Couldn't find the track content with selector .timelineTrackTrack`
    ) as HTMLElement;
  const getLocalTrackRow = () =>
    ensureExists(
      container.querySelector('.timelineTrackLocalRow'),
      `Couldn't find the track local row with selector .timelineTrackLocalRow`
    ) as HTMLElement;

  return {
    ...renderResult,
    dispatch,
    getState,
    profile: getProfile(getState()),
    store,
    trackReference,
    threadIndex,
    pid: PID,
    getLocalTrackLabel,
    getLocalTrackContent,
    getLocalTrackRow,
    flushRafCalls,
  };
}

/**
 *  getProfileWithNiceTracks() looks like: [
 *    'show [thread GeckoMain default]',
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
  const trackReference = { type: 'local' as const, pid: PID, trackIndex };
  const localTrack = getLocalTrackFromReference(
    store.getState(),
    trackReference
  );
  if (localTrack.type !== 'thread') {
    throw new Error('Expected a thread track.');
  }
  return setup(store, trackReference, localTrack, localTrack.threadIndex);
}

function setupWithNetworkProfile() {
  // Select the 2nd track, which will be the network track, while the first is the
  // main thread.
  const trackIndex = 1;
  const profile = getNetworkTrackProfile();
  profile.threads[0].pid = PID;

  const store = storeWithProfile(profile);
  const trackReference = { type: 'local' as const, pid: PID, trackIndex };
  const localTrack = getLocalTrackFromReference(
    store.getState(),
    trackReference
  );
  if (localTrack.type !== 'network') {
    throw new Error('Expected a network track.');
  }
  return setup(store, trackReference, localTrack, localTrack.threadIndex);
}

/**
 * Set up a profile with a memory counter.
 */
function setupWithMemory() {
  const { store, trackReference, localTrack, threadIndex } =
    getStoreWithMemoryTrack(PID);
  return setup(store, trackReference, localTrack, threadIndex);
}

/**
 * Set up a profile with an IPC message track.
 */
function setupWithIPC() {
  // Select the 2nd track, which will be the IPC track.
  const trackIndex = 1;
  const profile = getIPCTrackProfile();
  profile.threads[0].pid = PID;

  const store = storeWithProfile(profile);
  const trackReference = { type: 'local' as const, pid: PID, trackIndex };
  const localTrack = getLocalTrackFromReference(
    store.getState(),
    trackReference
  );
  if (localTrack.type !== 'ipc') {
    throw new Error('Expected an IPC track.');
  }
  return setup(store, trackReference, localTrack, localTrack.threadIndex);
}
