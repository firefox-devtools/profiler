/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getDisplayRange,
} from '../../reducers/profile-view';

import type {
  Thread,
  ThreadIndex,
  MarkersTableWithPayload,
} from '../../types/profile';
import type { ScreenshotPayload } from '../../types/markers';
import type { Milliseconds } from '../../types/units';
import type { SizeProps } from '../shared/WithSize';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './Screenshots.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  ...SizeProps,
|};

type StateProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: *,
  +threadName: string,
|};
type DispatchProps = {||};
type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = void;

// This should probably be configurable at some point.
const HEIGHT = 75;

class Screenshots extends PureComponent<Props, State> {
  renderScreenshotStrip(
    markerTable: MarkersTableWithPayload<ScreenshotPayload>
  ) {
    const { thread, width: containerWidth, rangeStart, rangeEnd } = this.props;
    const images = [];
    let lastRight = 0;
    for (let i = 0; i < markerTable.length; i++) {
      // This strategy is to lay out an image into the next fully available space.
      // This leaves some gaps in the images. It would probably be better to find the
      // next available image that fits, then put the previous image in seemlessly.
      // This way there would be no gaps. Also the images don't really seem to line
      // up correctly right now to the data in the timeline, so perhaps there is some
      // error in the math.
      const time = markerTable.time[i];
      const { url, windowWidth, windowHeight } = markerTable.data[i];
      const scaledImgWidth = HEIGHT * windowWidth / windowHeight;
      const left =
        containerWidth * (time - rangeStart) / (rangeEnd - rangeStart);
      if (left >= lastRight) {
        const src = thread.stringTable.getString(url);
        const style = {
          width: scaledImgWidth,
          height: HEIGHT,
          left,
        };
        images.push(
          <img
            className="headerScreenshotImg"
            key={i}
            src={src}
            style={style}
          />
        );
        lastRight = left + scaledImgWidth;
      }
    }
    return images;
  }

  render() {
    const { screenshots } = this.props;

    return (
      <div className="headerScreenshots">
        {[...screenshots.entries()].map(([windowID, markerTable]) => (
          <li className="profileThreadHeaderBar" key={windowID}>
            <div
              title="Screenshots"
              className="profileThreadHeaderBarThreadLabel"
            >
              <h1 className="profileThreadHeaderBarThreadName">Screenshots</h1>
            </div>
            <div
              className="headerScreenshotsDetails"
              style={{ height: HEIGHT }}
            >
              {this.renderScreenshotStrip(markerTable)}
            </div>
          </li>
        ))}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const selectors = selectorsForThread(threadIndex);
    const { start, end } = getDisplayRange(state);
    return {
      thread: selectors.getRangeSelectionFilteredThread(state),
      screenshots: selectors.getScreenshotMarkers(state),
      threadName: selectors.getFriendlyThreadName(state),
      rangeStart: start,
      rangeEnd: end,
    };
  },
  // mapDispatchToProps: {},
  component: Screenshots,
};

export default withSize(explicitConnect(options));
