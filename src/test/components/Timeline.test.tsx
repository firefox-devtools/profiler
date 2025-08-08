/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { Timeline } from '../../components/timeline';
import {
  computeTimeColumnForRawSamplesTable,
  filterRawThreadSamplesToRange,
} from 'firefox-profiler/profile-logic/profile-data';
import {
  selectedThreadSelectors,
  getRightClickedTrack,
  getMouseTimePosition,
  getLocalTracksByPid,
} from 'firefox-profiler/selectors';
import { FULL_TRACK_SCREENSHOT_HEIGHT } from 'firefox-profiler/app-logic/constants';
import { ensureExists } from 'firefox-profiler/utils/flow';
import { showLocalTrack } from 'firefox-profiler/actions/profile-view';

import { storeWithProfile } from '../fixtures/stores';
import {
  getProfileFromTextSamples,
  addIPCMarkerPairToThreads,
} from '../fixtures/profiles/processed-profile';
import { autoMockCanvasContext } from '../fixtures/mocks/canvas-context';
import { autoMockDomRect } from 'firefox-profiler/test/fixtures/mocks/domrect';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import {
  autoMockElementSize,
  getElementWithFixedSize,
} from '../fixtures/mocks/element-size';
import {
  getMouseEvent,
  fireFullClick,
  fireFullKeyPress,
  fireFullContextMenu,
  type FakeMouseEventInit,
} from '../fixtures/utils';
import ReactDOM from 'react-dom';
import {
  getProfileWithNiceTracks,
  getProfileWithMoreNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';
import {
  getEmptyProfile,
  getEmptyThread,
} from 'firefox-profiler/profile-logic/data-structures';

import type { Profile, ThreadIndex } from 'firefox-profiler/types';

// Mock out the element size to have a 400 pixel width and some left/top
// positioning.
const TRACK_WIDTH = 400;
const LEFT = 100;
const TOP = 7;
const INITIAL_ELEMENT_SIZE = {
  width: TRACK_WIDTH,
  height: FULL_TRACK_SCREENSHOT_HEIGHT,
  offsetX: LEFT,
  offsetY: TOP,
};

autoMockDomRect();
autoMockCanvasContext();
autoMockElementSize(INITIAL_ELEMENT_SIZE);
autoMockIntersectionObserver();

describe('Timeline multiple thread selection', function () {
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

    const showAllIPCTracks = () => {
      const localTracksByPid = getLocalTracksByPid(store.getState());
      for (const [pid, localTracks] of localTracksByPid) {
        for (
          let trackIndex = 0;
          trackIndex < localTracks.length;
          trackIndex++
        ) {
          const localTrack = localTracks[trackIndex];
          if (localTrack.type === 'ipc') {
            act(() => {
              store.dispatch(showLocalTrack(pid, trackIndex));
            });
          }
        }
      }
    };

    return { ...renderResult, ...store, showAllIPCTracks };
  }

  it('can toggle select multiple threads', function () {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    const domWorker = getByRole('button', { name: 'DOM Worker' });

    fireFullClick(domWorker, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const contentProcess = getByRole('button', {
      name: 'Content Process PID: 222',
    });

    fireFullClick(contentProcess, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will not de-select the last thread', function () {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    const contentProcess = getByRole('button', {
      name: 'Content Process PID: 222',
    });

    fireFullClick(contentProcess, { metaKey: true });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullClick(domWorker);

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const activityGraph: HTMLElement = ensureExists(
      getByText('Activity Graph for DOM Worker').closest('canvas'),
      'Could not find the canvas.'
    ) as any;

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    fireFullClick(activityGraph, {
      offsetX: TRACK_WIDTH / 2,
      offsetY: (FULL_TRACK_SCREENSHOT_HEIGHT * 3) / 4,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    const activityGraphForStyle: HTMLElement = ensureExists(
      getByText('Activity Graph for Style').closest('canvas'),
      'Could not find the canvas.'
    ) as any;

    expect(selectedThreadSelectors.getSelectedCallNodeIndex(getState())).toBe(
      null
    );

    fireFullClick(activityGraphForStyle, {
      pageX: 50,
      pageY: 50,
      ctrlKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullContextMenu(domWorker);

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);
  });

  it('will select a thread through enter and spacebar keypresses for global tracks', function () {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'Parent Process PID: 111' }), {
      key: ' ',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
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
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);
  });

  it('will select a thread through enter and spacebar keypresses for local tracks', function () {
    const { getState, getByRole } = setup();

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'DOM Worker' }), {
      key: 'Enter',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style]',
    ]);

    fireFullKeyPress(getByRole('button', { name: 'Style' }), {
      key: ' ',
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style] SELECTED',
    ]);
  });

  it('unselects a selected local track whose global process is hidden', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
      'show [thread GeckoMain default]',
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
      'hide [thread GeckoMain default]',
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

  it('can select a range of tracks with shift clicking', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
    // Then shift-click on another local track below
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#2' }));
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);

    // Shift-clicking on another local track will still use the first clicked
    // track as the start.
    fireFullClick(screen.getByRole('button', { name: 'Style' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // We can also select tracks where start and end are in the same global process.
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#1' }));
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#5' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // This also works if the start track is the global track.
    fireFullClick(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#5' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  it('skips over hidden tracks', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());

    // Hide the "middle" global track
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1001/ }));
    fireFullClick(screen.getByText(/Hide/));

    // And hide a local track in the first process
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(
      screen.getByRole('menuitemcheckbox', { name: 'ThreadPool#1' })
    );

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - hide [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'hide [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Click a track in the first process, then shift click another track in the
    // last process
    fireFullClick(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(screen.getByRole('button', { name: /PID: 1002/ }), {
      shiftKey: true,
    });

    // Notice that the tracks in the hidden process aren't selected, nor the
    // hidden local track in the first process.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - hide [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'hide [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  it('can select a range of tracks with shift clicking starting at the selected track', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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

    // Just shift-click on another local track below the selected track
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);
  });

  it('can select a range of tracks with shift clicking in the reverse order too', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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
    // Then shift-click on another local track above
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }));
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#2' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);

    // We can also select tracks where start and end are in the same global process.
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#5' }));
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#1' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // This also works if the start track is the global track.
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#5' }));
    fireFullClick(screen.getByRole('button', { name: /PID: 1000/ }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  it('is possible to mix both ctrl and shift modifiers', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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

    // First click on on a track
    // Then ctrl-click on another track.
    // Finally shift-ctrl-click on a third track.
    fireFullClick(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#2' }), {
      ctrlKey: true,
    });
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#4' }), {
      ctrlKey: true,
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // This is also additive when the ctrlKey is pressed only at the first click
    // but not the second click.
    fireFullClick(screen.getByRole('button', { name: /PID: 1002/ }), {
      ctrlKey: true,
    });
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }), {
      shiftKey: true,
    });

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);

    // Shift-clicking again above the initial track should unselect the ones
    // that were selected before and select the new ones. Indeed everything
    // happens as if the previous selection was canceled.
    fireFullClick(screen.getByRole('button', { name: /PID: 1001/ }), {
      shiftKey: true,
    });
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  it('forgets a local clicked track whose process is hidden later', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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

    // Then hides its global track
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(screen.getByText(/Hide/));

    // Then shift-click another track
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }), {
      shiftKey: true,
    });

    // The selected tracks are between the track that's been selected after the
    // hiding operation and the newly clicked track.
    expect(getHumanReadableTracks(getState())).toEqual([
      'hide [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);
  });

  it('forgets a global clicked track whose process is hidden later', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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

    // First click on a global track
    fireFullClick(screen.getByRole('button', { name: /PID: 1002/ }));
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Then hide this global track
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1002/ }));
    fireFullClick(screen.getByText(/Hide/));
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'hide [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Then shift-click another track
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#3' }), {
      shiftKey: true,
    });

    // The selected tracks are between the track that's been selected after the
    // hiding operation and the newly clicked track.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default] SELECTED',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - show [thread ThreadPool#2] SELECTED',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [thread DOM Worker]',
      '  - show [thread Style]',
      'hide [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  it('forgets a local clicked track that is hidden later', function () {
    const { getState } = setup(getProfileWithMoreNiceTracks());
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
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

    // First click on a local track
    fireFullClick(screen.getByRole('button', { name: 'ThreadPool#2' }));

    // Then hides its global track
    fireFullContextMenu(screen.getByRole('button', { name: /PID: 1000/ }));
    fireFullClick(
      screen.getByRole('menuitemcheckbox', { name: 'ThreadPool#2' })
    );

    // Another thread has been selected because the currently selected one has
    // been hidden.
    // Note because the newly selected thread is a local track, this also tests
    // the path of finding the local track from a thread index.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - hide [thread ThreadPool#2]',
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

    // Then shift-click another track
    fireFullClick(screen.getByRole('button', { name: 'AudioPool#2' }), {
      shiftKey: true,
    });

    // The selected tracks are between the track that's been selected after the
    // hiding operation and the newly clicked track.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [thread ThreadPool#1] SELECTED',
      '  - hide [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3] SELECTED',
      '  - show [thread ThreadPool#4] SELECTED',
      '  - show [thread ThreadPool#5] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [thread Style] SELECTED',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [thread AudioPool#1] SELECTED',
      '  - show [thread AudioPool#2] SELECTED',
      '  - show [thread Renderer]',
    ]);
  });

  it('selects also the related thread when a related track is first clicked', function () {
    const profile = getProfileWithMoreNiceTracks();

    // Change the profile to have some local tracks that aren't threads
    addIPCMarkerPairToThreads(
      {
        startTime: 1,
        endTime: 10,
        messageSeqno: 1,
      },
      profile.threads[0], // Parent process
      profile.threads[6], // tab process
      profile.shared
    );

    addIPCMarkerPairToThreads(
      {
        startTime: 11,
        endTime: 20,
        messageSeqno: 2,
      },
      profile.threads[0], // Parent process
      profile.threads[7], // DOM Worker
      profile.shared
    );

    const { getState, showAllIPCTracks } = setup(profile);
    showAllIPCTracks();
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [ipc GeckoMain] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [ipc DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // First click on the first ipc track in the tab process.
    fireFullClick(
      screen.getByRole('button', { name: 'IPC — Content Process (1/2)' })
    );

    // No change is expected because this track was already selected.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [ipc GeckoMain] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [ipc DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Then shift click on the second ipc track in the same process
    fireFullClick(screen.getByRole('button', { name: 'IPC — DOM Worker' }), {
      shiftKey: true,
    });

    // The DOM Worker thread is selected, but also the main thread in this
    // process, despite that it was outside of the range.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [ipc GeckoMain] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [ipc DOM Worker] SELECTED',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);
  });

  // This test is similar to the previous one, except that the "related track"
  // is selected last.
  it('selects also the related thread when a related track is last clicked', function () {
    const profile = getProfileWithMoreNiceTracks();

    // Change the profile to have some local tracks that aren't threads
    addIPCMarkerPairToThreads(
      {
        startTime: 1,
        endTime: 10,
        messageSeqno: 1,
      },
      profile.threads[0], // Parent process
      profile.threads[6], // tab process
      profile.shared
    );

    addIPCMarkerPairToThreads(
      {
        startTime: 11,
        endTime: 20,
        messageSeqno: 2,
      },
      profile.threads[0], // Parent process
      profile.threads[7], // DOM Worker
      profile.shared
    );

    const { getState, showAllIPCTracks } = setup(profile);
    showAllIPCTracks();
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [ipc GeckoMain] SELECTED',
      '  - show [thread DOM Worker]',
      '  - show [ipc DOM Worker]',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // First click on the second ipc track in the tab process.
    fireFullClick(screen.getByRole('button', { name: 'IPC — DOM Worker' }));

    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab]',
      '  - show [ipc GeckoMain]',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [ipc DOM Worker] SELECTED',
      '  - show [thread Style]',
      'show [thread GeckoMain tab]',
      '  - show [thread AudioPool#1]',
      '  - show [thread AudioPool#2]',
      '  - show [thread Renderer]',
    ]);

    // Then shift click on the first ipc track in the same process
    fireFullClick(
      screen.getByRole('button', { name: 'IPC — Content Process (1/2)' }),
      { shiftKey: true }
    );

    // The DOM Worker thread is selected, but also the main thread in this
    // process, despite that it was outside of the range.
    expect(getHumanReadableTracks(getState())).toEqual([
      'show [thread GeckoMain default]',
      '  - show [ipc GeckoMain]',
      '  - show [thread ThreadPool#1]',
      '  - show [thread ThreadPool#2]',
      '  - show [thread ThreadPool#3]',
      '  - show [thread ThreadPool#4]',
      '  - show [thread ThreadPool#5]',
      'show [thread GeckoMain tab] SELECTED',
      '  - show [ipc GeckoMain] SELECTED',
      '  - show [thread DOM Worker] SELECTED',
      '  - show [ipc DOM Worker] SELECTED',
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
  const sampleTimes2 = computeTimeColumnForRawSamplesTable(thread2.samples);

  // Manually choose the timings:
  const sampleStartIndex = 2;
  const sampleEndIndex = 7;
  Object.assign(thread2, {
    processStartupTime: sampleTimes2[sampleStartIndex],
    registerTime: sampleTimes2[sampleStartIndex],
    processShutdownTime: sampleTimes2[sampleEndIndex],
    unregisterTime: null,
  });
  thread1.name = 'Main Thread';
  thread2.name = 'Thread with dropped samples';

  // Remove the samples that contain 'x' and 'e'.
  profile.threads.push(filterRawThreadSamplesToRange(thread2, 4, 7));
  return profile;
}

describe('Timeline', function () {
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

    fireFullContextMenu(screen.getByRole('button', { name: /Parent Process/ }));
    // Note that Fluent inserts isolation characters between variables.
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068Parent Process\u2069”'
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

    fireFullContextMenu(
      screen.getByRole('button', { name: /Parent Process/ }),
      {
        ctrlKey: true,
      }
    );

    // Note that Fluent inserts isolation characters between variables.
    expect(screen.getByText(/Only show “/)).toHaveTextContent(
      'Only show “\u2068Parent Process\u2069”'
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

  describe('TimelineInitialSettings', () => {
    function setup(config: {
      initialVisibleThreads?: ThreadIndex[];
      initialSelectedThreads?: ThreadIndex[];
      keepProfileThreadOrder?: boolean;
      swapDOMWorkerAndStyleThread?: boolean;
    }) {
      const profile = getProfileWithNiceTracks();
      profile.meta.initialSelectedThreads = config.initialSelectedThreads;
      profile.meta.initialVisibleThreads = config.initialVisibleThreads;
      profile.meta.keepProfileThreadOrder = config.keepProfileThreadOrder;
      if (config.swapDOMWorkerAndStyleThread) {
        const styleThread = profile.threads[3];
        profile.threads[3] = profile.threads[1];
        profile.threads[1] = styleThread;
      }
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

    it('displays the initially visible threads if setting is present', () => {
      const { getState } = setup({ initialVisibleThreads: [1, 2] });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - hide [thread Style]',
      ]);
    });

    it('displays the normal visible threads and orders them alphabetically if setting is not present', () => {
      const { getState } = setup({ swapDOMWorkerAndStyleThread: true });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker]',
        '  - show [thread Style]',
      ]);
    });

    it('selects the set threads if setting is present', () => {
      const { getState } = setup({ initialSelectedThreads: [1, 2] });
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread DOM Worker] SELECTED',
        '  - show [thread Style]',
      ]);
    });

    it('disables thread ordering if setting is present', () => {
      const { getState } = setup({
        keepProfileThreadOrder: true,
        initialVisibleThreads: [1, 2, 3],
        swapDOMWorkerAndStyleThread: true,
      });
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        'show [thread GeckoMain tab] SELECTED',
        '  - show [thread Style]',
        '  - show [thread DOM Worker]',
      ]);
    });
  });
});

describe('TimelineSelection', () => {
  function setup({ profileLength }: { profileLength?: number } = {}) {
    const flushRafCalls = mockRaf();
    // Default to 10 samples in the profile.
    profileLength = profileLength ?? 10;
    let profile;
    if (profileLength === 0) {
      // Create an empty profile with a single thread since
      // getProfileFromTextSamples doesn't like empty samples.
      profile = getEmptyProfile();
      profile.threads = [getEmptyThread()];
    } else {
      profile = getProfileFromTextSamples('A  '.repeat(profileLength)).profile;
    }

    // getBoundingClientRect is already mocked by autoMockElementSize.
    jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockImplementation((): DOMRectList => {
        const result = [
          new DOMRect(LEFT, TOP, TRACK_WIDTH, FULL_TRACK_SCREENSHOT_HEIGHT),
        ];
        // @ts-expect-error - missing "item"
        return result;
      });

    const store = storeWithProfile(profile);
    render(
      <Provider store={store}>
        <Timeline />
      </Provider>
    );

    // This is necessary to make sure the sizing is correct.
    flushRafCalls();

    function moveMouseOnThreadCanvas(mouseEventOptions: FakeMouseEventInit) {
      const threadCanvas = ensureExists(
        document.querySelector('.threadActivityGraphCanvas'),
        'Expected that a thread activity graph canvas is present.'
      );

      fireEvent(threadCanvas, getMouseEvent('mousemove', mouseEventOptions));
    }

    function getTimePositionLinePosition() {
      const positionLine = ensureExists(
        document.querySelector('.timelineSelectionHoverLine'),
        'Expected that the vertical line indicating the time position is present.'
      ) as HTMLElement;
      return parseInt(positionLine.style.left);
    }

    return {
      ...store,
      profileLength,
      flushRafCalls,
      moveMouseOnThreadCanvas,
      getTimePositionLinePosition,
    };
  }

  it('renders the vertical line indicating the time position from the mouse cursor', () => {
    const {
      moveMouseOnThreadCanvas,
      getState,
      profileLength,
      getTimePositionLinePosition,
    } = setup();
    let samplePosition = 3;

    moveMouseOnThreadCanvas({
      pageX: LEFT + (TRACK_WIDTH * samplePosition) / profileLength,
      pageY: TOP + 1,
    });

    expect(getMouseTimePosition(getState())).toBe(samplePosition);
    expect(getTimePositionLinePosition()).toBe(
      (TRACK_WIDTH * samplePosition) / profileLength
    );
    expect(document.body).toMatchSnapshot();

    // Move the mouse in another position.
    samplePosition = 6;

    moveMouseOnThreadCanvas({
      pageX: LEFT + (TRACK_WIDTH * samplePosition) / profileLength,
      pageY: TOP + 1,
    });

    expect(getMouseTimePosition(getState())).toBe(samplePosition);
    expect(getTimePositionLinePosition()).toBe(
      (TRACK_WIDTH * samplePosition) / profileLength
    );
  });

  it('does not crash when there are no samples or markers', () => {
    const { moveMouseOnThreadCanvas } = setup({ profileLength: 0 });

    // Hover over anywhere in the timeline to check if it'll crash.
    moveMouseOnThreadCanvas({
      pageX: TRACK_WIDTH / 2,
      pageY: TOP + 1,
    });

    expect(document.body).toMatchSnapshot();
  });
});
