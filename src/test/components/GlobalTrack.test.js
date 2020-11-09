/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from '@testing-library/react';

import {
  changeSelectedThreads,
  hideGlobalTrack,
} from '../../actions/profile-view';
import { GlobalTrackComponent } from '../../components/timeline/GlobalTrack';
import { getGlobalTracks, getRightClickedTrack } from '../../selectors/profile';
import { getFirstSelectedThreadIndex } from '../../selectors/url-state';
import { ensureExists } from '../../utils/flow';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import {
  getBoundingBox,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';

describe('timeline/GlobalTrack', function() {
  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain process]',   // Track index 0
   *    'show [thread GeckoMain tab]',       // Track index 1 (default)
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]',
   *    'show [process]',                    // Track index 2
   *    '  - show [thread NoMain]'
   *  ]
   */
  const GECKOMAIN_TAB_TRACK_INDEX = 1;
  const NO_THREAD_TRACK_INDEX = 2;
  function setup(trackIndex = GECKOMAIN_TAB_TRACK_INDEX) {
    const profile = getProfileWithNiceTracks();
    {
      // Add another thread to highlight a thread-less global process track.
      const {
        profile: {
          threads: [thread],
        },
      } = getProfileFromTextSamples('A');
      thread.name = 'NoMain';
      thread.pid = 5555;
      profile.threads.push(thread);
    }
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const trackReference = { type: 'global', trackIndex };
    const tracks = getGlobalTracks(getState());
    const track = tracks[trackIndex];
    const setInitialSelected = () => {};
    if (track.type !== 'process') {
      throw new Error('Expected a process track.');
    }
    const threadIndex = track.mainThreadIndex;

    // Some child components render to canvas.
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext());
    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(400, 400));

    if (threadIndex !== null) {
      // The assertions are simpler if the GeckoMain tab thread is not already selected.
      dispatch(changeSelectedThreads(new Set([threadIndex + 1])));
    }

    const renderResult = render(
      <Provider store={store}>
        <GlobalTrackComponent
          trackIndex={trackIndex}
          trackReference={trackReference}
          setInitialSelected={setInitialSelected}
        />
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

  it('matches the snapshot of a global process track', () => {
    const { container } = setup(GECKOMAIN_TAB_TRACK_INDEX);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot of a global process track without a thread', () => {
    const { container } = setup(NO_THREAD_TRACK_INDEX);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('has the correct selectors into useful parts of the component', function() {
    const { getGlobalTrackLabel, getGlobalTrackRow } = setup();
    expect(getGlobalTrackLabel().textContent).toBe('Content ProcessPID: 222');
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
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    expect(getGlobalTrackRow().classList.contains('selected')).toBe(false);
  });

  it('can select a thread by clicking the label', () => {
    const {
      getState,
      getGlobalTrackLabel,
      getGlobalTrackRow,
      threadIndex,
    } = setup();
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    fireFullClick(getGlobalTrackLabel());
    expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
    expect(getGlobalTrackRow().classList.contains('selected')).toBe(true);
  });

  it('can right click a thread', () => {
    const {
      getState,
      getGlobalTrackLabel,
      threadIndex,
      trackReference,
    } = setup();

    fireFullContextMenu(getGlobalTrackLabel());
    expect(getRightClickedTrack(getState())).toEqual(trackReference);
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
  });

  it('can select a thread by clicking the row', () => {
    const { getState, getGlobalTrackRow, threadIndex } = setup();
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    fireFullClick(getGlobalTrackRow());
    expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
  });

  it('will render a stub div if the track is hidden', () => {
    const { container, trackIndex, dispatch } = setup();
    dispatch(hideGlobalTrack(trackIndex));
    expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
    expect(container.querySelector('.timelineTrack')).toBeFalsy();
  });
});
