/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import ReactDOM from 'react-dom';
import Timeline from '../../components/timeline';
import ActiveTabGlobalTrack from '../../components/timeline/ActiveTabGlobalTrack';
import { render, fireEvent } from 'react-testing-library';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import { changeTimelineTrackOrganization } from '../../actions/receive-profile';
import { getBoundingBox } from '../fixtures/utils';
import { addActiveTabInformationToProfile } from '../fixtures/profiles/processed-profile';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { getActiveTabGlobalTracks } from '../../selectors/profile';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import { changeSelectedThread } from '../../actions/profile-view';
import { ensureExists } from '../../utils/flow';

describe('ActiveTabTimeline', function() {
  beforeEach(() => {
    jest.spyOn(ReactDOM, 'findDOMNode').mockImplementation(() => {
      // findDOMNode uses nominal typing instead of structural (null | Element | Text), so
      // opt out of the type checker for this mock by returning `any`.
      const mockEl = ({
        getBoundingClientRect: () => getBoundingBox(300, 300),
      }: any);
      return mockEl;
    });

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(200, 300));

    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);
  });

  it('should be rendered properly from the Timeline component', () => {
    const {
      profile,
      parentInnerWindowIDsWithChildren,
      firstTabBrowsingContextID,
    } = addActiveTabInformationToProfile(getProfileWithNiceTracks());
    profile.threads[0].frameTable.innerWindowID[0] = parentInnerWindowIDsWithChildren;
    const store = storeWithProfile(profile);
    store.dispatch(
      changeTimelineTrackOrganization({
        type: 'active-tab',
        browsingContextID: firstTabBrowsingContextID,
      })
    );

    const { container } = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );
    expect(container.firstChild).toMatchSnapshot();
  });

  describe('ActiveTabGlobalTrack', function() {
    function setup() {
      const { profile, ...pageInfo } = addActiveTabInformationToProfile(
        getProfileWithNiceTracks()
      );
      profile.threads[0].frameTable.innerWindowID[0] =
        pageInfo.parentInnerWindowIDsWithChildren;
      const store = storeWithProfile(profile);
      store.dispatch(
        changeTimelineTrackOrganization({
          type: 'active-tab',
          browsingContextID: pageInfo.firstTabBrowsingContextID,
        })
      );
      const trackIndex = 0;
      const { getState, dispatch } = store;
      const trackReference = { type: 'global', trackIndex };
      const tracks = getActiveTabGlobalTracks(getState());
      const track = tracks[trackIndex];
      const setInitialSelected = () => {};
      if (track.type !== 'tab') {
        throw new Error('Expected a tab track.');
      }
      const threadIndex = track.threadIndex;

      if (threadIndex !== null) {
        // The assertions are simpler if the GeckoMain tab thread is not already selected.
        dispatch(changeSelectedThread(threadIndex + 1));
      }

      const renderResult = render(
        <Provider store={store}>
          <ActiveTabGlobalTrack
            trackIndex={trackIndex}
            trackReference={trackReference}
            setInitialSelected={setInitialSelected}
          />
        </Provider>
      );
      const { container } = renderResult;

      const getGlobalTrackRow = () =>
        ensureExists(
          container.querySelector('.timelineTrackGlobalRow'),
          `Couldn't find the track global row with selector .timelineTrackGlobalRow`
        );

      return {
        ...renderResult,
        ...pageInfo,
        dispatch,
        getState,
        profile,
        store,
        trackReference,
        trackIndex,
        threadIndex,
        getGlobalTrackRow,
      };
    }

    it('matches the snapshot of a global tab track', () => {
      const { container } = setup();
      expect(container.firstChild).toMatchSnapshot();
    });

    it('has useful parts of the component', function() {
      const { getGlobalTrackRow } = setup();
      expect(getGlobalTrackRow()).toBeTruthy();
    });

    it('starts out not being selected', function() {
      const { getState, getGlobalTrackRow, threadIndex } = setup();
      expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
      expect(getGlobalTrackRow().classList.contains('selected')).toBe(false);
    });

    it('can select a thread by clicking the row', () => {
      const { getState, getGlobalTrackRow, threadIndex } = setup();
      expect(getSelectedThreadIndex(getState())).not.toBe(threadIndex);
      fireEvent.click(getGlobalTrackRow());
      expect(getSelectedThreadIndex(getState())).toBe(threadIndex);
    });
  });
});
