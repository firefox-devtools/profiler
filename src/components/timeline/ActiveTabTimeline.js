/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { TimelineRuler } from './Ruler';
import { TimelineSelection } from './Selection';
import { OverflowEdgeIndicator } from './OverflowEdgeIndicator';
import { TimelineActiveTabGlobalTrack } from './ActiveTabGlobalTrack';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getPanelLayoutGeneration } from 'firefox-profiler/selectors/app';
import {
  getCommittedRange,
  getZeroAt,
  getProfileTimelineUnit,
  getActiveTabGlobalTracks,
  getActiveTabGlobalTrackReferences,
} from 'firefox-profiler/selectors/profile';

import './index.css';
import './ActiveTabTimeline.css';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type {
  ActiveTabGlobalTrack,
  InitialSelectedTrackReference,
  GlobalTrackReference,
  Milliseconds,
  StartEndRange,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  // This ref will be added to the inner container.
  +innerElementRef?: React.Ref<any>,
|};

type StateProps = {|
  +committedRange: StartEndRange,
  +globalTracks: ActiveTabGlobalTrack[],
  +globalTrackReferences: GlobalTrackReference[],
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
  +profileTimelineUnit: string,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, {||}>,
|};

type State = {|
  initialSelected: InitialSelectedTrackReference | null,
  forceLayoutGeneration: number,
|};

class ActiveTabTimelineImpl extends React.PureComponent<Props, State> {
  state = {
    initialSelected: null,
    forceLayoutGeneration: 0,
  };

  /**
   * This method collects the initially selected track's HTMLElement. This allows the timeline
   * to scroll the initially selected track into view once the page is loaded.
   */
  setInitialSelected = (
    el: InitialSelectedTrackReference,
    forceScroll: boolean = false
  ) => {
    if (forceScroll) {
      this.setState((prevState) => {
        return {
          initialSelected: el,
          forceLayoutGeneration: prevState.forceLayoutGeneration + 1,
        };
      });
    } else {
      this.setState({ initialSelected: el });
    }
  };

  render() {
    const {
      committedRange,
      zeroAt,
      profileTimelineUnit,
      width,
      panelLayoutGeneration,
      globalTracks,
      globalTrackReferences,
      innerElementRef,
    } = this.props;

    return (
      <>
        <TimelineSelection width={width} className="activeTab">
          <TimelineRuler
            zeroAt={zeroAt}
            rangeStart={committedRange.start}
            rangeEnd={committedRange.end}
            width={width}
            unit={profileTimelineUnit}
          />
          <OverflowEdgeIndicator
            className="tracksContainer timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
            initialSelected={this.state.initialSelected}
            forceLayoutGeneration={this.state.forceLayoutGeneration}
          >
            <ol className="timelineThreadList" ref={innerElementRef}>
              {globalTracks.map((globalTrack, trackIndex) => (
                <TimelineActiveTabGlobalTrack
                  key={trackIndex}
                  trackIndex={trackIndex}
                  trackReference={globalTrackReferences[trackIndex]}
                  setInitialSelected={this.setInitialSelected}
                />
              ))}
            </ol>
          </OverflowEdgeIndicator>
        </TimelineSelection>
      </>
    );
  }
}

export const ActiveTabTimeline = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state) => ({
    globalTracks: getActiveTabGlobalTracks(state),
    globalTrackReferences: getActiveTabGlobalTrackReferences(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    profileTimelineUnit: getProfileTimelineUnit(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
  }),
  component: withSize<Props>(ActiveTabTimelineImpl),
});
