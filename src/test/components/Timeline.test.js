/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';

import { render, screen } from 'firefox-profiler/test/fixtures/testing-library';
import { Timeline } from '../../components/timeline';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect.js';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import {
  autoMockElementSize,
  getElementWithFixedSize,
} from '../fixtures/mocks/element-size';
import {
  fireFullClick,
  fireFullKeyPress,
  fireFullContextMenu,
} from '../fixtures/utils';
import ReactDOM from 'react-dom';
import {
  selectedThreadSelectors,
  getRightClickedTrack,
} from 'firefox-profiler/selectors';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { ensureExists } from '../../utils/flow';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';

import type { Profile } from 'firefox-profiler/types';

describe('Timeline multiple thread selection', function () {
  autoMockDomRect();
  autoMockCanvasContext();
  autoMockElementSize({ width: 200, height: 300 });
  autoMockIntersectionObserver();

  /** This function produces a profile that will have several global tracks and
   * local tracks, that look like this as displayed by getHumanReadableTracks:
   *  [
   *    'show [thread GeckoMain process]',
   *    '  - show [thread ThreadPool#1]',
   *    '  - show [thread ThreadPool#2]',
   *    '  - show [thread ThreadPool#3]',
   *    '  - show [thread ThreadPool#4]',
   *    '  - show [thread ThreadPool#5]',
   *    'show [thread GeckoMain tab]',
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]',
   *    'show [thread GeckoMain tab]',
   *    '  - show [thread AudioPool#1]',
   *    '  - show [thread AudioPool#2]',
   *    '  - show [thread Renderer]',
   *  ]
   */
  function getProfileWithMoreNiceTracks() {
    const { profile } = getProfileFromTextSamples(
      ...Array.from({ length: 13 }, () => 'A')
    );

    const { threads } = profile;
    let tid = 1000;
    let pid = 1000;

    // Global thread 1
    threads[0].name = 'GeckoMain';
    threads[0].processType = 'process';
    threads[0].pid = pid;
    threads[0].tid = tid++;

    for (let i = 1; i <= 5; i++) {
      threads[i].name = `ThreadPool#${i}`;
      threads[i].processType = 'tab';
      threads[i].pid = pid;
      threads[i].tid = tid++;
    }

    // Global thread 2
    threads[6].name = 'GeckoMain';
    threads[6].processType = 'tab';
    threads[6].pid = ++pid;
    threads[6].tid = tid++;

    threads[7].name = 'DOM Worker';
    threads[7].processType = 'tab';
    threads[7].pid = pid;
    threads[7].tid = tid++;

    threads[8].name = 'Style';
    threads[8].processType = 'tab';
    threads[8].pid = pid;
    threads[8].tid = tid++;

    // Global thread 3
    threads[9].name = 'GeckoMain';
    threads[9].processType = 'tab';
    threads[9].pid = ++pid;
    threads[9].tid = tid++;

    threads[10].name = 'AudioPool#1';
    threads[10].processType = 'tab';
    threads[10].pid = pid;
    threads[10].tid = tid++;

    threads[11].name = 'AudioPool#2';
    threads[11].processType = 'tab';
    threads[11].pid = pid;
    threads[11].tid = tid++;

    threads[12].name = 'Renderer';
    threads[12].processType = 'tab';
    threads[12].pid = pid;
    threads[12].tid = tid++;

    return profile;
  }

  function setup(profile = getProfileWithNiceTracks()) {
    const store = storeWithProfile(profile);

    // We need a properly laid out ActivityGraph for some of the operations in
    // tests.
    const flushRafCalls = mockRaf();
    const renderResult = render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );
    flushRafCalls();

    return { ...renderResult, ...store };
  }

  it('can toggle select multiple threads', function () {
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

  it('will not de-select the last thread', function () {
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

  it('can select one thread from many', function () {
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

  it('will not de-select threads when clicking on a sample', function () {
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

    fireFullClick(activityGraph, { offsetX: 50, offsetY: 50 });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will still work on the activity graph when holding ctrl', function () {
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

  it('maintains multi-selections when using the context menu', function () {
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

  it('will select a thread through enter and spacebar keypresses for global tracks', function () {
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

  it('will select a thread through enter and spacebar keypresses for local tracks', function () {
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

  it('unselects a selected local track whose global process is hidden', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // First click on on a local track
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#2' }));
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain process]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Then hides its global track
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(screen.getByText(/Hide/));

    expect(getHumanReadableTracks(getState())).toEqual([
      'hide [thread GeckoMain process]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
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

describe('Timeline', function () {
  autoMockCanvasContext();
  autoMockElementSize({ width: 200, height: 300 });
  autoMockIntersectionObserver();
  autoMockDomRect();

  beforeEach(() => {
    jest
      .spyOn(ReactDOM, 'findDOMNode')
      .mockImplementation(() =>
        getElementWithFixedSize({ width: 200, height: 300 })
      );
  });

  it('displays a context menu when right clicking global and local tracks', () => {
    const profile = getProfileWithNiceTracks();

    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );

    fireFullContextMenu(screen.getByRole('button', { name: /GeckoMain/ }));
    // Note that Fluent inserts isolation characters between variables.
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068GeckoMain\u2069”'
    );
    fireFullContextMenu(screen.getByRole('button', { name: /Style/ }));
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068Style\u2069”'
    );
  });

  it('displays a context menu when ctrl + left clicking global and local tracks on MacOS', () => {
    const profile = getProfileWithNiceTracks();

    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );

    fireFullContextMenu(screen.getByRole('button', { name: /GeckoMain/ }), {
      ctrlKey: true,
    });

    // Note that Fluent inserts isolation characters between variables.
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068GeckoMain\u2069”'
    );

    fireFullContextMenu(screen.getByRole('button', { name: /Style/ }), {
      ctrlKey: true,
    });
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068Style\u2069”'
    );
  });

  describe('TimelineSettingsHiddenTracks', () => {
    it('resets "rightClickedTrack" state when clicked', () => {
      const profile = _getProfileWithDroppedSamples();

      const store = storeWithProfile(profile);
      render(
        <Provider store={store}>
          <Timeline />
        </Provider>
      );

      expect(getRightClickedTrack(store.getState())).toEqual(null);

      fireFullContextMenu(screen.getByRole('button', { name: 'Process 0' }));
      expect(getRightClickedTrack(store.getState())).toEqual({
        trackIndex: 0,
        type: 'global',
      });

      // Fluent adds isolate characters around variables, that's why we have
      // these `.` in the regexp, that will match these extra characters.
      fireFullClick(screen.getByRole('button', { name: /.4. \/ .4. tracks/ }));
      expect(getRightClickedTrack(store.getState())).toEqual(null);
    });
  });
});
