/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Ruler } from './Ruler';
import { Selection } from './Selection';
import { OverflowEdgeIndicator } from './OverflowEdgeIndicator';
import { ActiveTabGlobalTrack } from './ActiveTabGlobalTrack';
import { withSize } from '../shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { getPanelLayoutGeneration } from 'firefox-profiler/selectors/app';
import {
  getCommittedRange,
  getZeroAt,
  getActiveTabGlobalTracks,
  getActiveTabGlobalTrackReferences,
} from 'firefox-profiler/selectors/profile';

import './index.css';
import './ActiveTabTimeline.css';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type {
  ActiveTabGlobalTrack as ActiveTabGlobalTracks,
  InitialSelectedTrackReference,
  GlobalTrackReference,
  Milliseconds,
  StartEndRange,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +committedRange: StartEndRange,
  +globalTracks: ActiveTabGlobalTracks[],
  +globalTrackReferences: GlobalTrackReference[],
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<{||}, StateProps, {||}>,
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
      this.setState(prevState => {
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
      width,
      panelLayoutGeneration,
      globalTracks,
      globalTrackReferences,
    } = this.props;

    return (
      <>
        <Selection width={width} className="activeTab">
          <Ruler
            zeroAt={zeroAt}
            rangeStart={committedRange.start}
            rangeEnd={committedRange.end}
            width={width}
          />
          <OverflowEdgeIndicator
            className="timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
            initialSelected={this.state.initialSelected}
            forceLayoutGeneration={this.state.forceLayoutGeneration}
          >
            <ol className="timelineThreadList">
              {globalTracks.map((globalTrack, trackIndex) => (
                <ActiveTabGlobalTrack
                  key={trackIndex}
                  trackIndex={trackIndex}
                  trackReference={globalTrackReferences[trackIndex]}
                  setInitialSelected={this.setInitialSelected}
                />
              ))}
            </ol>
          </OverflowEdgeIndicator>
        </Selection>
      </>
    );
  }
}

export const ActiveTabTimeline = explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    globalTracks: getActiveTabGlobalTracks(state),
    globalTrackReferences: getActiveTabGlobalTrackReferences(state),
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
  }),
  component: withSize<Props>(ActiveTabTimelineImpl),
});
