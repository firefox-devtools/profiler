/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import FlameGraphCanvas from './Canvas';
import {
  selectedThreadSelectors,
  getDisplayRange,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import FlameGraphSettings from './Settings';
import { getSelectedThreadIndex } from '../../reducers/url-state';

import type { Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { FlameGraphTiming } from '../../profile-logic/flame-graph';
import type { ProfileSelection } from '../../types/actions';
import type { CallNodeInfo } from '../../types/profile-derived';

import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const STACK_FRAME_HEIGHT = 16;

type StateProps = {|
  +thread: Thread,
  +maxStackDepth: number,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +selection: ProfileSelection,
  +flameGraphTiming: FlameGraphTiming,
  +threadName: string,
  +processDetails: string,
  +callNodeInfo: CallNodeInfo,
  +threadIndex: number,
|};
type Props = ConnectedProps<{||}, StateProps, {||}>;

class FlameGraph extends React.PureComponent<Props> {
  render() {
    const {
      thread,
      threadIndex,
      maxStackDepth,
      flameGraphTiming,
      callNodeInfo,
      timeRange,
      selection,
      threadName,
      processDetails,
    } = this.props;

    const maxViewportHeight = maxStackDepth * STACK_FRAME_HEIGHT;

    return (
      <div className="flameGraph">
        <FlameGraphSettings />
        <div className="flameGraphContent">
          <div title={processDetails} className="flameGraphLabels grippy">
            <span>
              {threadName}
            </span>
          </div>
          <FlameGraphCanvas
            key={threadIndex}
            // ChartViewport props
            viewportProps={{
              timeRange,
              maxViewportHeight,
              maximumZoom: 1,
              selection,
              startsAtBottom: true,
              viewportNeedsUpdate,
            }}
            // FlameGraphCanvas props
            chartProps={{
              thread,
              maxStackDepth,
              flameGraphTiming,
              callNodeInfo,
              stackFrameHeight: STACK_FRAME_HEIGHT,
            }}
          />
        </div>
      </div>
    );
  }
}

// This function is given the FlameGraphCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +flameGraphTiming: FlameGraphTiming },
  newProps: { +flameGraphTiming: FlameGraphTiming }
) {
  return prevProps.flameGraphTiming !== newProps.flameGraphTiming;
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => {
    const flameGraphTiming = selectedThreadSelectors.getFlameGraphTiming(state);

    return {
      thread: selectedThreadSelectors.getThread(state),
      maxStackDepth: selectedThreadSelectors.getCallNodeMaxDepthForFlameGraph(
        state
      ),
      flameGraphTiming,
      timeRange: getDisplayRange(state),
      selection: getProfileViewOptions(state).selection,
      threadName: selectedThreadSelectors.getFriendlyThreadName(state),
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      threadIndex: getSelectedThreadIndex(state),
    };
  },
  component: FlameGraph,
};
export default explicitConnect(options);
