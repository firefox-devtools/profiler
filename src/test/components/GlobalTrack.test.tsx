/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { Provider } from 'react-redux';
import { stripIndent } from 'common-tags';

import {
  render,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import {
  changeSelectedThreads,
  hideGlobalTrack,
} from '../../actions/profile-view';
import { TimelineGlobalTrack } from '../../components/timeline/GlobalTrack';
import { getGlobalTracks, getRightClickedTrack } from '../../selectors/profile';
import { getFirstSelectedThreadIndex } from '../../selectors/url-state';
import { ensureExists } from '../../utils/types';
import {
  autoMockCanvasContext,
  flushDrawLog,
} from '../fixtures/mocks/canvas-context';
import { getProfileWithNiceTracks } from '../fixtures/profiles/tracks';
import {
  getProfileFromTextSamples,
  getProfileWithMarkers,
} from '../fixtures/profiles/processed-profile';
import { storeWithProfile } from '../fixtures/stores';
import { fireFullClick, fireFullContextMenu } from '../fixtures/utils';
import { autoMockElementSize } from '../fixtures/mocks/element-size';
import { mockRaf } from '../fixtures/mocks/request-animation-frame';
import { autoMockIntersectionObserver } from '../fixtures/mocks/intersection-observer';
import { selectedThreadSelectors } from '../../selectors/per-thread';

describe('timeline/GlobalTrack', function () {
  autoMockCanvasContext();
  // Some child components render to canvas.
  autoMockElementSize({ width: 400, height: 400 });
  autoMockIntersectionObserver();

  /**
   *  getProfileWithNiceTracks() looks like: [
   *    'show [thread GeckoMain default]',   // Track index 0
   *    'show [thread GeckoMain tab]',       // Track index 1 (default)
   *    '  - show [thread DOM Worker]',
   *    '  - show [thread Style]',
   *    'show [process]',                    // Track index 2
   *    '  - show [thread NoMain]'
   *  ]
   */
  const GECKOMAIN_TAB_TRACK_INDEX = 1;
  const NO_THREAD_TRACK_INDEX = 2;
  const PRIVATE_TRACK_INDEX = 3;
  const CONTAINER_TRACK_INDEX = 4;

  function getGlobalTrackProfile() {
    const profile = getProfileWithNiceTracks();
    {
      // Add another thread to highlight a thread-less global process track.
      const {
        profile: {
          threads: [thread],
        },
      } = getProfileFromTextSamples('A');
      thread.name = 'NoMain';
      thread.pid = '5555';
      profile.threads.push(thread);
    }
    {
      // Add another thread launched in a fission browser to handle a private
      // browsing window.
      const {
        profile: {
          threads: [thread],
        },
      } = getProfileFromTextSamples('A');
      thread.name = 'Private';
      thread['eTLD+1'] = 'https://example.org';
      thread.pid = '6666';
      thread.tid = 6666;
      thread.isPrivateBrowsing = true;
      profile.threads.push(thread);
    }
    {
      // Add another thread launched in a fission browser to handle a tab in a
      // non-default container.
      const {
        profile: {
          threads: [thread],
        },
      } = getProfileFromTextSamples('A');
      thread.name = 'InContainer';
      thread['eTLD+1'] = 'https://example.org';
      thread.pid = '7777';
      thread.tid = 7777;
      thread.userContextId = 3;
      profile.threads.push(thread);
    }
    return profile;
  }

  function setup(
    trackIndex = GECKOMAIN_TAB_TRACK_INDEX,
    profile = getGlobalTrackProfile()
  ) {
    const store = storeWithProfile(profile);
    const { getState, dispatch } = store;
    const trackReference = { type: 'global' as const, trackIndex };
    const tracks = getGlobalTracks(getState());
    const track = tracks[trackIndex];
    const setInitialSelected = () => {};
    if (track.type !== 'process') {
      throw new Error('Expected a process track.');
    }
    const threadIndex = track.mainThreadIndex;

    if (threadIndex !== null) {
      // The assertions are simpler if the GeckoMain tab thread is not already selected.
      dispatch(changeSelectedThreads(new Set([threadIndex + 1])));
    }

    // WithSize uses requestAnimationFrame
    const flushRafCalls = mockRaf();
    const renderResult = render(
      <Provider store={store}>
        <TimelineGlobalTrack
          trackIndex={trackIndex}
          trackReference={trackReference}
          setInitialSelected={setInitialSelected}
        />
      </Provider>
    );
    flushRafCalls();
    const { container } = renderResult;

    const getGlobalTrackLabel = () =>
      ensureExists(
        container.querySelector('.timelineTrackLabel'),
        `Couldn't find the track label with selector .timelineTrackLabel`
      ) as HTMLElement;
    const getGlobalTrackRow = () =>
      ensureExists(
        container.querySelector('.timelineTrackGlobalRow'),
        `Couldn't find the track global row with selector .timelineTrackGlobalRow`
      ) as HTMLElement;

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

  it('matches the snapshot of a global process track with pid set to 0', () => {
    const profile = getGlobalTrackProfile();
    profile.threads[GECKOMAIN_TAB_TRACK_INDEX].pid = '0';

    const { container } = setup(GECKOMAIN_TAB_TRACK_INDEX, profile);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('matches the snapshot of a global process track without a thread', () => {
    const { container } = setup(NO_THREAD_TRACK_INDEX);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the private browsing status of a fission thread', () => {
    setup(PRIVATE_TRACK_INDEX);
    const track = screen.getByText('Private');
    // $FlowExpectError The parent element is an HTML Element but Flow doesn't know that.
    expect(ensureExists(track.parentElement).title).toBe(stripIndent`
      Private
      Thread: "Private" (6666)
      Process: "default" (6666)
      Private Browsing: Yes
    `);
  });

  it('displays the container status of a fission thread', () => {
    setup(CONTAINER_TRACK_INDEX);
    const track = screen.getByText('InContainer');
    // $FlowExpectError The parent element is an HTML Element but Flow doesn't know that.
    expect(ensureExists(track.parentElement).title).toBe(stripIndent`
      InContainer
      Thread: "InContainer" (7777)
      Process: "default" (7777)
      Container Id: 3
    `);
  });

  it('has the correct selectors into useful parts of the component', function () {
    const { getGlobalTrackLabel, getGlobalTrackRow } = setup();
    expect(getGlobalTrackLabel()).toHaveTextContent('Content ProcessPID: 222');
    expect(getGlobalTrackRow()).toBeTruthy();
  });

  it('starts out not being selected', function () {
    const { getState, getGlobalTrackRow, threadIndex, trackReference } =
      setup();
    expect(getRightClickedTrack(getState())).not.toEqual(trackReference);
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    expect(getGlobalTrackRow()).not.toHaveClass('selected');
  });

  it('can select a thread by clicking the label', () => {
    const { getState, getGlobalTrackLabel, getGlobalTrackRow, threadIndex } =
      setup();
    expect(getFirstSelectedThreadIndex(getState())).not.toBe(threadIndex);
    fireFullClick(getGlobalTrackLabel());
    expect(getFirstSelectedThreadIndex(getState())).toBe(threadIndex);
    expect(getGlobalTrackRow()).toHaveClass('selected');
  });

  it('can right click a thread', () => {
    const { getState, getGlobalTrackLabel, threadIndex, trackReference } =
      setup();

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
    act(() => {
      dispatch(hideGlobalTrack(trackIndex));
    });
    expect(container.querySelector('.timelineTrackHidden')).toBeTruthy();
    expect(container.querySelector('.timelineTrack')).toBeFalsy();
  });

  function getTaskProfile(showMarkersInTimeline: boolean) {
    const profile = getProfileWithMarkers([
      ['Task 1', 0, 10, { type: 'task' }],
      ['Task 2', 20, 30, { type: 'task' }],
      ['Task 3', 40, 50, { type: 'task' }],
      ['Task 4', 60, 70, { type: 'task' }],
    ]);
    profile.meta.markerSchema = [
      {
        name: 'task',
        display: ['timeline-overview'],
        fields: [],
      },
    ];
    const [thread] = profile.threads;
    thread.name = 'Task Thread';
    thread.showMarkersInTimeline = showMarkersInTimeline;
    return profile;
  }

  it('will render markers with a timeline-overview schema', () => {
    const showMarkersInTimeline = true;
    const trackIndex = 0;
    const profile = getTaskProfile(showMarkersInTimeline);

    const { container, getState } = setup(trackIndex, profile);

    // The markers overview graph is present.
    expect(screen.getByTestId('TimelineMarkersOverview')).toBeInTheDocument();

    // The markers are present in the track.
    expect(
      selectedThreadSelectors.getTimelineOverviewMarkerIndexes(getState())
    ).toEqual([0, 1, 2, 3]);

    // Check the snapshots, as this will capture all of the draw calls for the markers.
    expect(container.firstChild).toMatchSnapshot();
    expect(flushDrawLog()).toMatchSnapshot();
  });

  it('will not render markers to the timeline-overview when showMarkersInTimeline is not set', () => {
    const showMarkersInTimeline = false;
    const trackIndex = 0;
    const profile = getTaskProfile(showMarkersInTimeline);

    const { container, getState } = setup(trackIndex, profile);

    // The markers overview graph is now not present.
    expect(
      screen.queryByTestId('TimelineMarkersOverview')
    ).not.toBeInTheDocument();

    // The markers are still present here.
    expect(
      selectedThreadSelectors.getTimelineOverviewMarkerIndexes(getState())
    ).toEqual([0, 1, 2, 3]);

    // Check the snapshots, as this will capture the fact that nothing is rendered.
    expect(container.firstChild).toMatchSnapshot();
    expect(flushDrawLog()).toMatchSnapshot();
  });
});
