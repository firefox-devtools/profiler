/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import memoize from 'memoize-immutable';
import * as React from 'react';
import TimelineRuler from './Ruler';
import TimelineSelection from './Selection';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';
import {
  getPanelLayoutGeneration,
  getCommittedRange,
  getZeroAt,
  getOriginsTimeline,
  getThreads,
} from 'firefox-profiler/selectors';
import { getFriendlyThreadName } from 'firefox-profiler/profile-logic/profile-data';
import { changeSelectedThreads } from 'firefox-profiler/actions/profile-view';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type {
  Thread,
  ThreadIndex,
  InitialSelectedTrackReference,
  OriginsTimeline,
  OriginsTimelineTrack,
  Milliseconds,
  StartEndRange,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './OriginsTimeline.css';

type StateProps = {|
  +committedRange: StartEndRange,
  +panelLayoutGeneration: number,
  +originsTimeline: OriginsTimeline,
  +zeroAt: Milliseconds,
  +threads: Thread[],
|};

type DispatchProps = {|
  +changeSelectedThreads: typeof changeSelectedThreads,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<{||}, StateProps, DispatchProps>,
|};

type State = {|
  initialSelected: InitialSelectedTrackReference | null,
|};

/**
 * This view is an experimental view, not meant for real usage at this time. It
 * implements the absolute minimum structure to show what real data looks like when
 * attempting to view threads organized according to their origin. The origin is
 * the `https://example.com` part of a full URL.
 */
class OriginsTimelineView extends React.PureComponent<Props, State> {
  state = {
    initialSelected: null,
  };

  /**
   * This method collects the initially selected track's HTMLElement. This allows the timeline
   * to scroll the initially selected track into view once the page is loaded.
   */
  setInitialSelected = (el: InitialSelectedTrackReference) => {
    this.setState({ initialSelected: el });
  };

  /**
   * This makes it handy to view a track that's been organized in the view.
   * Memoizing it is probably over-kill, but there you go.
   */
  clickTrack = memoize((threadIndex: ThreadIndex) => {
    return (event: Event) => {
      event.preventDefault();
      this.props.changeSelectedThreads(new Set([threadIndex]));
    };
  });

  /**
   * TODO - These might be better to use the other track data structures.
   */
  renderTrack = (track: OriginsTimelineTrack) => {
    const { threads } = this.props;
    switch (track.type) {
      case 'origin':
        return (
          <li
            className="originsTimelineTrack originsTimelineTrack-origin"
            key={track.threadIndex}
          >
            <a href="#" onClick={this.clickTrack(track.threadIndex)}>
              {track.origin}
            </a>
            <ol>{track.children.map(this.renderTrack)}</ol>
          </li>
        );
      case 'no-origin': {
        const thread = threads[track.threadIndex];
        return (
          <li
            key={track.threadIndex}
            className="originsTimelineTrack originsTimelineTrack-no-origin"
          >
            <a href="#" onClick={this.clickTrack(track.threadIndex)}>
              {getFriendlyThreadName(threads, thread)}
            </a>
          </li>
        );
      }
      case 'sub-origin': {
        return (
          <li
            className="originsTimelineTrack originsTimelineTrack-sub-origin"
            key={track.threadIndex}
          >
            <a href="#" onClick={this.clickTrack(track.threadIndex)}>
              {track.origin}
            </a>
          </li>
        );
      }
      default:
        throw assertExhaustiveCheck(track, 'Unhandled OriginsTimelineTrack.');
    }
  };

  render() {
    const {
      committedRange,
      zeroAt,
      width,
      panelLayoutGeneration,
      originsTimeline,
    } = this.props;

    return (
      <>
        <TimelineSelection width={width}>
          <TimelineRuler
            zeroAt={zeroAt}
            rangeStart={committedRange.start}
            rangeEnd={committedRange.end}
            width={width}
          />
          <OverflowEdgeIndicator
            className="timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
            initialSelected={this.state.initialSelected}
          >
            <ol className="timelineThreadList">
              {originsTimeline.map(this.renderTrack)}
            </ol>
          </OverflowEdgeIndicator>
        </TimelineSelection>
      </>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    threads: getThreads(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
    originsTimeline: getOriginsTimeline(state),
  }),
  mapDispatchToProps: {
    changeSelectedThreads,
  },
  component: withSize<Props>(OriginsTimelineView),
});
