/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import ScreenshotStrip from './ScreenshotStrip';
import HoverPreview from './HoverPreview';
import explicitConnect from '../../utils/connect';
import {
  getCommittedRange,
  getPreviewSelection,
} from '../../selectors/profile';
import { getThreadSelectors } from '../../selectors/per-thread';
import { withSize, type SizeProps } from '../shared/WithSize';

import type { ThreadIndex, Thread } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import { ensureExists } from '../../utils/flow';
import './TrackScreenshots.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  +windowId: string,
  ...SizeProps,
|};
type StateProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: TracingMarker[],
  +threadName: string,
  +isMakingPreviewSelection: boolean,
|};
type DispatchProps = {||};
type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = {|
  offsetX: null | number,
  pageX: null | number,
  containerTop: null | number,
|};

// Export the value for tests.
export const TRACK_HEIGHT = 50;

class Screenshots extends PureComponent<Props, State> {
  state = {
    offsetX: null,
    pageX: null,
    containerTop: null,
  };

  _handleMouseLeave = () => {
    this.setState({
      offsetX: null,
      pageX: null,
      containerTop: null,
    });
  };

  _handleMouseMove = (event: SyntheticMouseEvent<HTMLDivElement>) => {
    const { top, left } = event.currentTarget.getBoundingClientRect();
    this.setState({
      pageX: event.pageX,
      offsetX: event.pageX - left,
      containerTop: top,
    });
  };

  render() {
    const {
      screenshots,
      thread,
      isMakingPreviewSelection,
      width,
      rangeStart,
      rangeEnd,
    } = this.props;
    const { pageX, offsetX, containerTop } = this.state;
    return (
      <div
        className="timelineTrackScreenshot"
        style={{ height: TRACK_HEIGHT }}
        onMouseLeave={this._handleMouseLeave}
        onMouseMove={this._handleMouseMove}
      >
        <ScreenshotStrip
          thread={thread}
          width={width}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          screenshots={screenshots}
        />
        <HoverPreview
          screenshots={screenshots}
          thread={thread}
          isMakingPreviewSelection={isMakingPreviewSelection}
          width={width}
          pageX={pageX}
          offsetX={offsetX}
          containerTop={containerTop}
          rangeEnd={rangeEnd}
          rangeStart={rangeStart}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, ownProps) => {
    const { threadIndex, windowId } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const { start, end } = getCommittedRange(state);
    const previewSelection = getPreviewSelection(state);
    return {
      thread: selectors.getRangeFilteredThread(state),
      screenshots: ensureExists(
        selectors.getRangeFilteredScreenshotsById(state).get(windowId),
        'Expected to find screenshots for the given pid'
      ),
      threadName: selectors.getFriendlyThreadName(state),
      rangeStart: start,
      rangeEnd: end,
      isMakingPreviewSelection:
        previewSelection.hasSelection && previewSelection.isModifying,
    };
  },
  component: Screenshots,
};

export default withSize(explicitConnect(options));
