/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';
import { stripIndent } from 'common-tags';
// This module is mocked.
import copy from 'copy-to-clipboard';

import {
  render,
  screen,
  fireEvent,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { MarkerTable } from '../../components/marker-table';
import { MaybeMarkerContextMenu } from '../../components/shared/MarkerContextMenu';
import {
  updatePreviewSelection,
  changeMarkersSearchString,
  hideGlobalTrack,
  hideLocalTrack,
  selectTrackWithModifiers,
} from '../../actions/profile-view';
import { changeSelectedTab } from 'firefox-profiler/actions/app';
import { ensureExists } from '../../utils/types';
import { getEmptyThread } from 'firefox-profiler/profile-logic/data-structures';

import { storeWithProfile } from '../fixtures/stores';
import type { TestDefinedMarker } from '../fixtures/profiles/processed-profile';
import {
  getProfileFromTextSamples,
  getMarkerTableProfile,
  addMarkersToThreadWithCorrespondingSamples,
  addIPCMarkerPairToThreads,
  getNetworkTrackProfile,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { fireFullClick, fireFullContextMenu } from '../fixtures/utils';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import {
  getProfileWithNiceTracks,
  getHumanReadableTracks,
} from '../fixtures/profiles/tracks';
import * as UrlStateSelectors from '../../selectors/url-state';
import { getScrollToSelectionGeneration } from 'firefox-profiler/selectors/profile';

import type { CauseBacktrace } from 'firefox-profiler/types';

describe('MarkerTable', function () {
  // Set an arbitrary size that will not kick in any virtualization behavior.
  autoMockElementSize({ width: 2000, height: 1000 });

  function setup(profile = getMarkerTableProfile()) {
    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <>
          <MaybeMarkerContextMenu />
          <MarkerTable />
        </>
      </Provider>
    );
    const { container } = renderResult;

    const fixedRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowFixedColumns'));
    const scrolledRows = () =>
      Array.from(container.querySelectorAll('.treeViewRowScrolledColumns'));

    const getRowElement = (functionName: string | RegExp) =>
      ensureExists(
        screen.getByText(functionName).closest('.treeViewRow'),
        `Couldn't find the row for node ${String(functionName)}.`
      );
    const getContextMenu = () =>
      ensureExists(
        container.querySelector('.react-contextmenu'),
        `Couldn't find the context menu.`
      );

    return {
      ...renderResult,
      ...store,
      fixedRows,
      scrolledRows,
      getRowElement,
      getContextMenu,
    };
  }

  it('renders some basic markers and updates when needed', () => {
    const { container, fixedRows, scrolledRows, dispatch } = setup();

    expect(fixedRows()).toHaveLength(7);
    expect(scrolledRows()).toHaveLength(7);
    expect(container.firstChild).toMatchSnapshot();

    /* Check that the table updates properly despite the memoisation. */
    act(() => {
      dispatch(
        updatePreviewSelection({
          isModifying: false,
          selectionStart: 10,
          selectionEnd: 20,
        })
      );
    });

    expect(fixedRows()).toHaveLength(2);
    expect(scrolledRows()).toHaveLength(2);
  });

  it('selects a row when left clicking', () => {
    const { getByText, getRowElement, getState } = setup();

    const initialScrollGeneration = getScrollToSelectionGeneration(getState());
    fireFullClick(getByText(/setTimeout/));
    expect(getRowElement(/setTimeout/)).toHaveClass('isSelected');

    fireFullClick(getByText('foobar'));
    expect(getRowElement(/setTimeout/)).not.toHaveClass('isSelected');
    expect(getRowElement('foobar')).toHaveClass('isSelected');

    // The scroll generation hasn't moved.
    expect(getScrollToSelectionGeneration(getState())).toEqual(
      initialScrollGeneration
    );
  });

  it('displays a context menu when right clicking', () => {
    jest.useFakeTimers();

    const { getContextMenu, getRowElement, getByText } = setup();

    function checkMenuIsDisplayedForNode(str: string | RegExp) {
      expect(getContextMenu()).toHaveClass('react-contextmenu--visible');

      // Note that selecting a menu item will close the menu.
      fireFullClick(getByText('Copy description'));
      expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(str));
    }

    fireFullContextMenu(getByText(/setTimeout/));
    checkMenuIsDisplayedForNode(/setTimeout/);
    expect(getRowElement(/setTimeout/)).toHaveClass('isRightClicked');

    // Wait that all timers are done before trying again.
    act(() => jest.runAllTimers());

    // Now try it again by right clicking 2 nodes in sequence.
    fireFullContextMenu(getByText(/setTimeout/));
    fireFullContextMenu(getByText('foobar'));
    checkMenuIsDisplayedForNode('foobar');
    expect(getRowElement(/setTimeout/)).not.toHaveClass('isRightClicked');
    expect(getRowElement('foobar')).toHaveClass('isRightClicked');

    // Wait that all timers are done before trying again.
    act(() => jest.runAllTimers());

    // And now let's do it again, but this time waiting for timers before
    // clicking, because the timer can impact the menu being displayed.
    fireFullContextMenu(getByText('NotifyDidPaint'));
    fireFullContextMenu(getByText('foobar'));
    act(() => jest.runAllTimers());
    checkMenuIsDisplayedForNode('foobar');
    expect(getRowElement('foobar')).toHaveClass('isRightClicked');
  });

  it("can copy a marker's cause using the context menu", () => {
    jest.useFakeTimers();

    // This is a tid we'll reuse later.
    const tid = 4444;

    // Just a simple profile with 1 thread and a nice stack.
    const {
      profile,
      funcNamesDictPerThread: [{ E }],
    } = getProfileFromTextSamples(`
      A[lib:libxul.so]
      B[lib:libxul.so]
      C[lib:libxul.so]
      D[lib:libxul.so]
      E[lib:libxul.so]
    `);
    profile.threads[0].name = 'Main Thread';

    // Add another thread with a known tid that we'll reuse in the marker's cause.
    profile.threads.push(getEmptyThread({ name: 'Another Thread', tid }));
    // Add the reflow marker to the first thread.
    addMarkersToThreadWithCorrespondingSamples(
      profile.threads[0],
      profile.shared,
      [
        getReflowMarker(3, 100, {
          tid: tid,
          // We're cheating a bit here: E is a funcIndex, but because of how
          // getProfileFromTextSamples works internally, this will be the right
          // stackIndex too.
          stack: E,
          time: 1,
        }),
      ]
    );

    const { getByText } = setup(profile);
    fireFullContextMenu(getByText(/Reflow/));
    fireFullClick(getByText('Copy call stack'));
    expect(copy).toHaveBeenLastCalledWith(stripIndent`
      A [libxul.so]
      B [libxul.so]
      C [libxul.so]
      D [libxul.so]
      E [libxul.so]
    `);
  });

  it("can copy a marker's page url using the context menu", () => {
    // A simple profile that contains markers with page information.
    // We will be using `DOMContentLoaded` that has a page url.
    const profile = getNetworkTrackProfile();
    setup(profile);

    // Make sure that a marker without an innerWindowID doesn't have this
    // context menu item. `Navigation::Start` doesn't have one.
    //
    // We are using `getAllByText` here because marker table puts the same text
    // to both `type` and `name` columns. But right clicking on either of them
    // results in the same menu item.
    fireFullContextMenu(screen.getAllByText('FirstContentfulPaint')[0]);
    expect(screen.queryByText('Copy page URL')).not.toBeInTheDocument();

    // Make sure that a marker with innerWindowID has this context menu item and
    // can copy its page url successfully.
    fireFullContextMenu(screen.getByText('DOMContentLoaded'));
    fireFullClick(screen.getByText('Copy page URL'));
    expect(copy).toHaveBeenLastCalledWith(
      'https://developer.mozilla.org/en-US/'
    );
  });

  describe('EmptyReasons', () => {
    it('shows reasons when a profile has no non-network markers', () => {
      const { profile } = getProfileFromTextSamples('A'); // Just a simple profile without any marker.
      const { container } = setup(profile);
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });

    it('shows reasons when all non-network markers have been filtered out', function () {
      const { dispatch, container } = setup();
      act(() => {
        dispatch(changeMarkersSearchString('MATCH_NOTHING'));
      });
      expect(container.querySelector('.EmptyReasons')).toMatchSnapshot();
    });
  });

  describe('IPC marker context menu item', () => {
    /**
     * Using the following tracks:
     *  [
     *    'show [thread GeckoMain default]',
     *    'show [thread GeckoMain tab]',
     *    '  - show [thread DOM Worker]',
     *    '  - show [thread Style]',
     *  ]
     */
    const parentTrackReference = { type: 'global' as const, trackIndex: 0 };
    const tabTrackReference = { type: 'global' as const, trackIndex: 1 };
    const domWorkerTrackReference = {
      type: 'local',
      trackIndex: 0,
      pid: '222',
    };
    const styleTrackReference = {
      type: 'local' as const,
      trackIndex: 1,
      pid: '222',
    };
    const parentThreadIndex = 0;
    const domWorkerThreadIndex = 2;
    const styleThreadIndex = 3;
    const tabPid = '222';
    function setupWithTracksAndIPCMarker() {
      const profile = getProfileWithNiceTracks();
      addIPCMarkerPairToThreads(
        {
          startTime: 1,
          endTime: 10,
          messageSeqno: 1,
        },
        profile.threads[0], // Parent process
        profile.threads[1], // tab process
        profile.shared
      );

      addIPCMarkerPairToThreads(
        {
          startTime: 11,
          endTime: 20,
          messageSeqno: 2,
        },
        profile.threads[0], // Parent process
        profile.threads[2], // DOM Worker
        profile.shared
      );

      // Add an incomplete IPC marker to the Style thread.
      // We do not add the other marker pair to another thread on purpose.
      addMarkersToThreadWithCorrespondingSamples(
        profile.threads[3],
        profile.shared,
        [
          [
            'IPC',
            20,
            25,
            {
              type: 'IPC',
              startTime: 20,
              endTime: 25,
              otherPid: '444',
              messageSeqno: 3,
              messageType: 'PContent::Msg_PreferenceUpdate',
              side: 'parent',
              direction: 'sending',
              phase: 'endpoint',
              sync: false,
              niceDirection: `sending to 444`,
            },
          ],
        ]
      );

      return setup(profile);
    }

    it('can switch to another global track', function () {
      const { getState } = setupWithTracksAndIPCMarker();
      fireFullContextMenu(screen.getByText(/IPCIn/));
      fireFullClick(screen.getByText(/Select the sender/));
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
      );
    });

    it('can switch to a hidden global track', function () {
      const { getState, dispatch } = setupWithTracksAndIPCMarker();
      // Hide the global track first.
      act(() => {
        dispatch(hideGlobalTrack(parentTrackReference.trackIndex));
      });
      // Make sure that it's hidden.
      expect(getHumanReadableTracks(getState())).toEqual([
        'hide [thread GeckoMain default]',
        '  - hide [ipc GeckoMain]',
        'show [thread GeckoMain tab] SELECTED',
        '  - hide [ipc GeckoMain] SELECTED',
        '  - show [thread DOM Worker]',
        '  - hide [ipc DOM Worker]',
        '  - show [thread Style]',
        '  - hide [ipc Style]',
      ]);

      // Check the actual behavior now.
      fireFullContextMenu(screen.getByText(/IPCIn/));
      fireFullClick(screen.getByText(/Select the sender/));
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
      );
      // Make sure that it's not hidden anymore.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        '  - hide [ipc GeckoMain] SELECTED',
        'show [thread GeckoMain tab]',
        '  - hide [ipc GeckoMain]',
        '  - show [thread DOM Worker]',
        '  - hide [ipc DOM Worker]',
        '  - show [thread Style]',
        '  - hide [ipc Style]',
      ]);
    });

    it('can switch to a local track', function () {
      const { getState, dispatch } = setupWithTracksAndIPCMarker();
      act(() => {
        dispatch(selectTrackWithModifiers(parentTrackReference));
      });
      // Make sure that we are in the parent process thread.
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
      );

      // Check if we can switch to the DOM Worker properly.
      fireFullContextMenu(screen.getByText(/sent to DOM Worker/));
      fireFullClick(screen.getByText(/Select the receiver/));

      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([domWorkerThreadIndex])
      );
    });

    it('can switch to a hidden local track', function () {
      const { getState, dispatch } = setupWithTracksAndIPCMarker();
      act(() => {
        dispatch(selectTrackWithModifiers(parentTrackReference));
      });
      // Make sure that we are in the parent process thread.
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([parentThreadIndex])
      );
      // Hide the global and local tracks.
      act(() => {
        dispatch(hideLocalTrack(tabPid, domWorkerTrackReference.trackIndex));
        dispatch(hideGlobalTrack(tabTrackReference.trackIndex));
      });
      // Make sure that they are hidden.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default] SELECTED',
        '  - hide [ipc GeckoMain] SELECTED',
        'hide [thread GeckoMain tab]',
        '  - hide [ipc GeckoMain]',
        '  - hide [thread DOM Worker]',
        '  - hide [ipc DOM Worker]',
        '  - show [thread Style]',
        '  - hide [ipc Style]',
      ]);

      // Check the actual behavior now.
      fireFullContextMenu(screen.getByText(/sent to DOM Worker/));
      fireFullClick(screen.getByText(/Select the receiver/));
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([domWorkerThreadIndex])
      );
      // Make sure that they are not hidden anymore.
      expect(getHumanReadableTracks(getState())).toEqual([
        'show [thread GeckoMain default]',
        '  - hide [ipc GeckoMain]',
        'show [thread GeckoMain tab]',
        '  - hide [ipc GeckoMain]',
        '  - show [thread DOM Worker] SELECTED',
        '  - hide [ipc DOM Worker] SELECTED',
        '  - show [thread Style]',
        '  - hide [ipc Style]',
      ]);
    });

    it('does not render when the other thread is not profiled', function () {
      const { getState, dispatch } = setupWithTracksAndIPCMarker();
      act(() => {
        dispatch(selectTrackWithModifiers(styleTrackReference));
      });
      // Make sure that we are in the Style thread.
      expect(UrlStateSelectors.getSelectedThreadIndexes(getState())).toEqual(
        new Set([styleThreadIndex])
      );

      // Silence console logs coming from the component.
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Make sure that it's not in the context menu.
      fireFullContextMenu(screen.getByText(/IPCOut/));
      expect(screen.queryByText(/Select the/)).not.toBeInTheDocument();
    });
  });

  describe('column resizing', () => {
    it('can resize a column, then move it back to its initial size', () => {
      const store = storeWithProfile(getMarkerTableProfile());
      store.dispatch(changeSelectedTab('marker-table'));
      const { unmount } = render(
        <Provider store={store}>
          <MarkerTable />
        </Provider>
      );

      let dividerForFirstColumn = ensureExists(
        document.querySelector('.treeViewColumnDivider')
      );
      let firstColumn = screen.getByText('Start');
      expect(firstColumn).toHaveStyle({ width: '90px' });
      fireEvent.mouseDown(dividerForFirstColumn, { clientX: 90 });

      const body = ensureExists(document.body);

      // Move right
      fireEvent.mouseMove(body, { clientX: 100 });
      expect(firstColumn).toHaveStyle({ width: '100px' });

      // Move left
      fireEvent.mouseMove(body, { clientX: 80 });
      expect(firstColumn).toHaveStyle({ width: '80px' });

      // Release the mouse -> still the same style
      fireEvent.mouseUp(body);
      expect(firstColumn).toHaveStyle({ width: '80px' });

      // Now we'll unmount and render again.
      unmount();
      render(
        <Provider store={store}>
          <MarkerTable />
        </Provider>
      );

      // Make sure the first column kept its width
      firstColumn = screen.getByText('Start');
      expect(firstColumn).toHaveStyle({ width: '80px' });

      // Now double click to reset the style.
      dividerForFirstColumn = ensureExists(
        document.querySelector('.treeViewColumnDivider')
      );
      fireEvent.dblClick(dividerForFirstColumn, { detail: 2 });
      expect(firstColumn).toHaveStyle({ width: '90px' });
    });
  });

  it('can copy the table as plain text', () => {
    const { container } = setup();

    const button = ensureExists(
      container.querySelector('.copyTableButton')
    ) as HTMLElement;
    fireFullClick(button);

    const menu = ensureExists(
      container.querySelector('.markerCopyTableContextMenu')
    ) as HTMLElement;

    const items = menu.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);

    fireFullClick(items[0] as HTMLElement);

    const pattern = new RegExp(
      '^ +Start +Duration +Name +Details\\n +0s +0s +UserTiming +foobar\\n'
    );
    expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(pattern));
  });

  it('can copy the table as markdown', () => {
    const { container } = setup();

    const button = ensureExists(
      container.querySelector('.copyTableButton')
    ) as HTMLElement;
    fireFullClick(button);

    const menu = ensureExists(
      container.querySelector('.markerCopyTableContextMenu')
    ) as HTMLElement;

    const items = menu.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);

    fireFullClick(items[1] as HTMLElement);

    const pattern = new RegExp(
      '^\\| +Start +\\| +Duration +\\| +Name +\\| +Details +\\|\\n' +
        '\\|-+:\\|-+:\\|-+:\\|-+\\|\\n' +
        '\\| +0s +\\| +0s +\\| +UserTiming +\\| +foobar +\\|\\n'
    );
    expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(pattern));
  });

  it('shows warning when copying 10001+ rows', () => {
    jest.useFakeTimers();

    const markers: TestDefinedMarker[] = [];
    for (let i = 1; i < 10010; i++) {
      markers.push([
        'UserTiming',
        i,
        i,
        {
          type: 'UserTiming',
          name: 'foobar',
          entryType: 'mark',
        },
      ]);
    }
    const profile = getProfileWithMarkers(markers);
    const { container } = setup(profile);

    const button = ensureExists(
      container.querySelector('.copyTableButton')
    ) as HTMLElement;
    fireFullClick(button);

    const menu = ensureExists(
      container.querySelector('.markerCopyTableContextMenu')
    ) as HTMLElement;

    const items = menu.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(2);

    fireFullClick(items[0] as HTMLElement);

    const pattern = new RegExp(
      '^ +Start +Duration +Name +Details\\n +0s +0s +UserTiming +foobar\\n.+9\\.999s +0s +UserTiming +foobar$',
      's'
    );
    expect(copy).toHaveBeenLastCalledWith(expect.stringMatching(pattern));

    const warning = screen.getByText(
      'The number of rows exceeds the limit: ⁨10,009⁩ > ⁨10,000⁩. Only the first ⁨10,000⁩ rows will be copied.'
    );
    expect(warning).toBeInTheDocument();

    act(() => jest.runAllTimers());

    const warning2 = screen.queryByText(
      'The number of rows exceeds the limit: ⁨10,009⁩ > ⁨10,000⁩. Only the first ⁨10,000⁩ rows will be copied.'
    );
    expect(warning2).not.toBeInTheDocument();
  });
});

function getReflowMarker(
  startTime: number,
  endTime: number,
  cause?: CauseBacktrace
): TestDefinedMarker {
  return [
    'Reflow',
    startTime,
    endTime,
    {
      type: 'tracing',
      category: 'Paint',
      cause,
    },
  ];
}
