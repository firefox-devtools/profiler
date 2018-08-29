/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { createPortal } from 'react-dom';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getCommittedRange,
  getPreviewSelection,
} from '../../reducers/profile-view';
import { withSize, type SizeProps } from '../shared/WithSize';

import type { ThreadIndex, Thread } from '../../types/profile';
import type { ScreenshotPayload } from '../../types/markers';
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
  +screenshotId: string,
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
const HOVER_HEIGHT = 100;
const HOVER_MAX_WIDTH_RATIO = 1.75;

class Screenshots extends PureComponent<Props, State> {
  state = {
    offsetX: null,
    pageX: null,
    containerTop: null,
  };

  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  findScreenshotAtMouse(offsetX: number): number | null {
    const { width, rangeStart, rangeEnd, screenshots } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const mouseTime = offsetX / width * rangeLength + rangeStart;

    // Loop backwards to find the latest screenshot that has a time less
    // than the current time at the mouse position.
    for (let i = screenshots.length - 1; i >= 0; i--) {
      const screenshotTime = screenshots[i].start;
      if (mouseTime >= screenshotTime) {
        return i;
      }
    }

    return null;
  }

  /**
   * This function runs through all of the screenshots, and then samples the last known
   * screenshot, and places it on the screen, making a film strip.
   */
  renderScreenshotStrip() {
    const {
      thread,
      width: outerContainerWidth,
      rangeStart,
      rangeEnd,
      screenshots,
    } = this.props;

    if (screenshots.length === 0) {
      return null;
    }

    const images = [];
    const rangeLength = rangeEnd - rangeStart;
    const imageContainerWidth = TRACK_HEIGHT * 0.75;
    const timeToPixel = time =>
      outerContainerWidth * (time - rangeStart) / rangeLength;

    let screenshotIndex = 0;
    for (
      let left = timeToPixel(screenshots[0].start);
      left < outerContainerWidth;
      left += imageContainerWidth
    ) {
      // Try to find the next screenshot to fit in, or re-use the existing one.
      for (let i = screenshotIndex; i < screenshots.length; i++) {
        if (timeToPixel(screenshots[i].start) <= left) {
          screenshotIndex = i;
        } else {
          break;
        }
      }
      // Coerce the payload into a screenshot one.
      const payload: ScreenshotPayload = (screenshots[screenshotIndex]
        .data: any);
      const { url: urlStringIndex, windowWidth, windowHeight } = payload;
      const scaledImageWidth = TRACK_HEIGHT * windowWidth / windowHeight;
      images.push(
        <div
          className="timelineTrackScreenshotImgContainer"
          style={{ left, width: imageContainerWidth }}
          key={left}
        >
          {/* The following image is centered and cropped by the outer container. */}
          <img
            className="timelineTrackScreenshotImg"
            src={thread.stringTable.getString(urlStringIndex)}
            style={{
              width: scaledImageWidth,
              height: TRACK_HEIGHT,
            }}
          />
        </div>
      );
    }

    return images;
  }

  renderHoverPreview() {
    const { pageX, offsetX, containerTop } = this.state;
    const { screenshots, thread, isMakingPreviewSelection, width } = this.props;
    if (isMakingPreviewSelection || offsetX === null || pageX === null) {
      return null;
    }
    const screenshotIndex = this.findScreenshotAtMouse(offsetX);
    if (screenshotIndex === null) {
      return null;
    }
    // Coerce the payload into a screenshot one.
    const payload: ScreenshotPayload = (screenshots[screenshotIndex].data: any);
    const { url, windowWidth, windowHeight } = payload;

    // Compute the hover image's thumbnail size.
    let hoverHeight = HOVER_HEIGHT;
    let hoverWidth = HOVER_HEIGHT / windowHeight * windowWidth;

    if (hoverWidth > HOVER_HEIGHT * HOVER_MAX_WIDTH_RATIO) {
      // This is a really wide image, limit the height so it lays out reasonably.
      hoverWidth = HOVER_HEIGHT * HOVER_MAX_WIDTH_RATIO;
      hoverHeight = hoverWidth / windowWidth * windowHeight;
    }

    // Set the top so it centers around the track.
    const top = containerTop + (TRACK_HEIGHT - hoverHeight) * 0.5;
    const left =
      offsetX + hoverWidth * 0.5 > width
        ? // Stick the hover image on to the right side of the container.
          pageX - offsetX + width - hoverWidth * 0.5
        : // Center the hover image around the mouse.
          pageX;

    return createPortal(
      <div className="timelineTrackScreenshotHover" style={{ left, top }}>
        <img
          className="timelineTrackScreenshotHoverImg"
          src={thread.stringTable.getString(url)}
          style={{
            height: hoverHeight,
            width: hoverWidth,
          }}
        />
      </div>,
      this._overlayElement
    );
  }

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
    return (
      <div
        className="timelineTrackScreenshot"
        style={{ height: TRACK_HEIGHT }}
        onMouseLeave={this._handleMouseLeave}
        onMouseMove={this._handleMouseMove}
      >
        {this.renderScreenshotStrip()}
        {this.renderHoverPreview()}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, ownProps) => {
    const { threadIndex, screenshotId } = ownProps;
    const selectors = selectorsForThread(threadIndex);
    const { start, end } = getCommittedRange(state);
    const previewSelection = getPreviewSelection(state);
    return {
      thread: selectors.getRangeFilteredThread(state),
      screenshots: ensureExists(
        selectors.getRangeFilteredScreenshotsById(state).get(screenshotId),
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
