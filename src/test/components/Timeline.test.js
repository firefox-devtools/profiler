/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Timeline } from '../../components/timeline';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import mockCanvasContext from '../fixtures/mocks/canvas-context';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect.js';
import mockRaf from '../fixtures/mocks/request-animation-frame';
import {
  getBoundingBox,
  fireFullClick,
  fireFullKeyPress,
  fireFullContextMenu,
} from '../fixtures/utils';
import ReactDOM from 'react-dom';
import {
  getTimelineTrackOrganization,
  selectedThreadSelectors,
  getRightClickedTrack,
} from 'firefox-profiler/selectors';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { ensureExists } from '../../utils/flow';

import type { Profile } from 'firefox-profiler/types';

describe('Timeline multiple thread selection', function() {
  autoMockDomRect();

  function setup() {
    const profile = getProfileWithNiceTracks();
    const store = storeWithProfile(profile);

    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => mockCanvasContext());

    jest
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => getBoundingBox(200, 300));

    const renderResult = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );

    return { ...renderResult, ...store };
  }

  it('can toggle select multiple threads', function() {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const contentProcess = getByRole('button', {
      name: 'Content Process PID: 222',
    });

    fireFullClick(contentProcess, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will not de-select the last thread', function() {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    const contentProcess = getByRole('button', {
      name: 'Content Process PID: 222',
    });

    fireFullClick(contentProcess, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });

  it('can select one thread from many', function() {
    const { getState, getByRole } = setup();

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullClick(domWorker);

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will not de-select threads when clicking on a sample', function() {
    const { getState, getByRole, getByText } = setup();

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const activityGraph: HTMLElement = (ensureExists(
      getByText('Activity Graph for DOM Worker').closest('canvas'),
      'Could not find the canvas.'
    ): any);

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    fireFullClick(activityGraph, { pageX: 50, pageY: 50 });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will still work on the activity graph when holding ctrl', function() {
    const { getState, getByRole, getByText } = setup();

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const activityGraphForStyle: HTMLElement = (ensureExists(
      getByText('Activity Graph for Style').closest('canvas'),
      'Could not find the canvas.'
    ): any);

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    fireFullClick(activityGraphForStyle, {
      pageX: 50,
      pageY: 50,
      ctrlKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
    ]);
  });

  it('maintains multi-selections when using the context menu', function() {
    const { getState, getByRole } = setup();

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullContextMenu(domWorker);

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will select a thread through enter and spacebar keypresses for global tracks', function() {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'GeckoMain PID: 111' }), {
      key: ' ',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(
      getByRole('button', { name: 'Content Process PID: 222' }),
      {
        key: 'Enter',
      }
    );

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });

  it('will not select a track through a random keypress for a global track', function() {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'GeckoMain PID: 111' }), {
      key: 'a',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });

  it('will select a thread through enter and spacebar keypresses for local tracks', function() {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'DOM Worker' }), {
      key: 'Enter',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'Style' }), {
      key: ' ',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style] SELECTED',
    ]);
  });

  it('will not select a track through a random keypress for local tracks', function() {
    const { getState, getByRole } = setup();

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(domWorker, { key: 'a' });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });
});

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
