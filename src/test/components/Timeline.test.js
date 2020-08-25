/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import Timeline from '../../components/timeline';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import {
  getBoundingBox,
  fireFullClick,
  fireFullContextMenu,
} from '../fixtures/utils';
import ReactDOM from 'react-dom';
import { getTimelineTrackOrganization } from '../../selectors/url-state';
import { getRightClickedTrack } from '../../selectors/profile';

import type { Profile } from 'firefox-profiler/types';

function _getProfileWithDroppedSamples(): Profile {
  const { profile } = getProfileFromTextSamples(
    // The base thread is 9 samples long.
    'S1  S2  S3  S4  S5  S6  S7  S8  S9',
    // Create a second thread where `x` is when the thread wasn't yet initialized
    // and where e is an empty sample. The profile fixture will be mutated below
    // to follow this.
    `
      x  x  e  e  A  A  A  x  x
                  B  B  B
                  C  C  H
                  D  F  I
                  E  G
    `
  );

  const [thread1, thread2] = profile.threads;

  // Manually choose the timings:
  const sampleStartIndex = 2;
  const sampleEndIndex = 7;
  Object.assign(thread2, {
    processStartupTime: thread2.samples.time[sampleStartIndex],
    registerTime: thread2.samples.time[sampleStartIndex],
    processShutdownTime: thread2.samples.time[sampleEndIndex],
    unregisterTime: null,
  });
  thread1.name = 'Main Thread';
  thread2.name = 'Thread with dropped samples';

  // Remove the samples that contain 'x' and 'e'.
  {
    const samples = thread2.samples;
    for (const key in samples) {
      if (
        Object.prototype.hasOwnProperty.call(samples, key) &&
        Array.isArray(samples[key])
      ) {
        // Slice just the stacks we care about, simulating a thread that was started
        // later, and with dropped data in its buffer.
        samples[key] = samples[key].slice(4, 7);
      }
    }
  }
  thread2.samples.length = thread2.samples.time.length;

  profile.threads.push(thread2);
  return profile;
}

describe('Timeline', function() {
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
  });

  it('renders the header', () => {
    const flushRafCalls = mockRaf();
    window.devicePixelRatio = 1;
    const ctx = mockCanvasContext();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx);

    const profile = _getProfileWithDroppedSamples();

    const { container } = render(
      <Provider store={storeWithProfile(profile)}>
        <Timeline />
      </Provider>
    );

    // We need to flush twice since when the first flush is run, it
    // will request more code to be run in later animation frames.
    flushRafCalls();
    flushRafCalls();

    const drawCalls = ctx.__flushDrawLog();

    expect(container.firstChild).toMatchSnapshot();
    expect(drawCalls).toMatchSnapshot();

    delete window.devicePixelRatio;
  });

  // These tests are disabled for now because active tab view checkbox is disabled for now.
  // TODO: Enable it again once we have that checbox back.
  // eslint-disable-next-line jest/no-disabled-tests
  describe.skip('TimelineSettingsActiveTabView', function() {
    it('"Show active tab only" checkbox should not present in a profile without active tab metadata', () => {
      const ctx = mockCanvasContext();
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(() => ctx);

      const store = storeWithProfile();
      const { queryByText } = render(
        <Provider store={store}>
          <Timeline />
        </Provider>
      );

      expect(queryByText('Show active tab only')).toBeFalsy();
    });

    it('can switch between active tab view and advanced view', () => {
      const ctx = mockCanvasContext();
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(() => ctx);

      const profile = _getProfileWithDroppedSamples();
      profile.meta.configuration = {
        threads: [],
        features: [],
        capacity: 1000000,
        activeBrowsingContextID: 123,
      };
      const store = storeWithProfile(profile);
      const { getByText } = render(
        <Provider store={store}>
          <Timeline />
        </Provider>
      );

      expect(getTimelineTrackOrganization(store.getState())).toEqual({
        type: 'full',
      });

      fireFullClick(getByText('Show active tab only'));
      expect(getTimelineTrackOrganization(store.getState())).toEqual({
        type: 'active-tab',
        browsingContextID: 123,
      });

      fireFullClick(getByText('Show active tab only'));
      expect(getTimelineTrackOrganization(store.getState())).toEqual({
        type: 'full',
      });
    });
  });

  describe('TimelineSettingsHiddenTracks', () => {
    it('resets "rightClickedTrack" state when clicked', () => {
      const profile = _getProfileWithDroppedSamples();
      const ctx = mockCanvasContext();
      jest
        .spyOn(HTMLCanvasElement.prototype, 'getContext')
        .mockImplementation(() => ctx);

      const store = storeWithProfile(profile);
      const { getByText, getByRole } = render(
        <Provider store={store}>
          <Timeline />
        </Provider>
      );

      expect(getRightClickedTrack(store.getState())).toEqual(null);

      fireFullContextMenu(getByRole('button', { name: 'Process 0' }));
      expect(getRightClickedTrack(store.getState())).toEqual({
        trackIndex: 0,
        type: 'global',
      });

      fireFullClick(getByText('/ tracks visible'));
      expect(getRightClickedTrack(store.getState())).toEqual(null);
    });
  });
});
