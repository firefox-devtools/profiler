/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import {
  getCommittedRange,
  getPreviewSelection,
  getThreadSelectors,
} from 'firefox-profiler/selectors';
import { withSize, type SizeProps } from '../shared/WithSize';
import { createPortal } from 'react-dom';
import { TRACK_SCREENSHOT_HEIGHT } from '../../app-logic/constants';

import type { ScreenshotPayload } from '../../types/markers';
import type { ThreadIndex, Thread } from '../../types/profile';
import type { Marker } from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type { ConnectedProps } from '../../utils/connect';

import { ensureExists } from '../../utils/flow';
import './TrackScreenshots.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  +windowId: string,
|};
type StateProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: Marker[],
  +threadName: string,
  +isMakingPreviewSelection: boolean,
|};
type DispatchProps = {||};
type Props = {|
  ...SizeProps,
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
|};
type State = {|
  offsetX: null | number,
  pageX: null | number,
  containerTop: null | number,
|};

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
        style={{ height: TRACK_SCREENSHOT_HEIGHT }}
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

const EMPTY_SCREENSHOTS_TRACK = [];

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex, windowId } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const { start, end } = getCommittedRange(state);
    const previewSelection = getPreviewSelection(state);
    return {
      thread: selectors.getRangeFilteredThread(state),
      screenshots:
        selectors.getRangeFilteredScreenshotsById(state).get(windowId) ||
        EMPTY_SCREENSHOTS_TRACK,
      threadName: selectors.getFriendlyThreadName(state),
      rangeStart: start,
      rangeEnd: end,
      isMakingPreviewSelection:
        previewSelection.hasSelection && previewSelection.isModifying,
    };
  },
  component: withSize<Props>(Screenshots),
});

type HoverPreviewProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: Marker[],
  +isMakingPreviewSelection: boolean,
  +offsetX: null | number,
  +pageX: null | number,
  +containerTop: null | number,
  +width: number,
|};

const MAXIMUM_HOVER_SIZE = 350;

const HOVER_MAX_WIDTH_RATIO = 1.75;

class HoverPreview extends PureComponent<HoverPreviewProps> {
  findScreenshotAtMouse(offsetX: number): number | null {
    const { width, rangeStart, rangeEnd, screenshots } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const mouseTime = (offsetX / width) * rangeLength + rangeStart;

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

  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  render() {
    const {
      screenshots,
      thread,
      isMakingPreviewSelection,
      width,
      pageX,
      offsetX,
      containerTop,
    } = this.props;

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
    // Coefficient should be according to bigger side.
    const coefficient =
      windowHeight > windowWidth
        ? MAXIMUM_HOVER_SIZE / windowHeight
        : MAXIMUM_HOVER_SIZE / windowWidth;
    let hoverHeight = windowHeight * coefficient;
    let hoverWidth = windowWidth * coefficient;

    const distanceToTopFromTrackCenter =
      TRACK_SCREENSHOT_HEIGHT / 2 + containerTop;
    // If the hover height exceeds the top of screen,
    // set it to the value so that it reaches the top of screen when it is centered.
    if (hoverHeight > 2 * distanceToTopFromTrackCenter) {
      hoverHeight = 2 * distanceToTopFromTrackCenter;
      hoverWidth = (hoverHeight * windowWidth) / windowHeight;
    }

    if (hoverWidth > hoverHeight * HOVER_MAX_WIDTH_RATIO) {
      // This is a really wide image, limit the height so it lays out reasonably.
      hoverWidth = hoverHeight * HOVER_MAX_WIDTH_RATIO;
      hoverHeight = (hoverWidth / windowWidth) * windowHeight;
    }

    hoverWidth = Math.round(hoverWidth);
    hoverHeight = Math.round(hoverHeight);

    // Set the top so it centers around the track.
    let top = containerTop + (TRACK_SCREENSHOT_HEIGHT - hoverHeight) * 0.5;
    // Round top value to integer.
    top = Math.floor(top);
    if (top < 0) {
      // Stick the hover image on to the top side of the container.
      top = 0;
    }

    // Center the hover image around the mouse.
    let left = pageX - hoverWidth * 0.5;

    // marginX is the amount of pixels between this screenshot track
    // and the window's left edge.
    const marginX = pageX - offsetX;

    if (left < 0) {
      // Stick the hover image on to the left side of the page.
      left = 0;
    } else if (left + hoverWidth > width + marginX) {
      // Stick the hover image on to the right side of the container.
      left = marginX + width - hoverWidth;
    }
    // Round left value to integer.
    left = Math.floor(left);

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
}

type ScreenshotStripProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: Marker[],
  +width: number,
|};

class ScreenshotStrip extends PureComponent<ScreenshotStripProps> {
  render() {
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
    const imageContainerWidth = TRACK_SCREENSHOT_HEIGHT * 0.75;
    const timeToPixel = time =>
      (outerContainerWidth * (time - rangeStart)) / rangeLength;

    const leftmostPixel = Math.max(timeToPixel(screenshots[0].start), 0);
    let screenshotIndex = 0;
    for (
      let left = leftmostPixel;
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
      const scaledImageWidth =
        (TRACK_SCREENSHOT_HEIGHT * windowWidth) / windowHeight;
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
              height: TRACK_SCREENSHOT_HEIGHT,
            }}
          />
        </div>
      );
    }
    return images;
  }
}
