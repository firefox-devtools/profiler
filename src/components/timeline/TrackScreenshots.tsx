/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getPreviewSelectionIsBeingModified,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  withSize,
  type SizeProps,
} from 'firefox-profiler/components/shared/WithSize';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { createPortal } from 'react-dom';
import { computeScreenshotSize } from 'firefox-profiler/profile-logic/marker-data';
import { FULL_TRACK_SCREENSHOT_HEIGHT } from 'firefox-profiler/app-logic/constants';

import type {
  ScreenshotPayload,
  ThreadIndex,
  Thread,
  Marker,
  Milliseconds,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import { ensureExists } from 'firefox-profiler/utils/types';
import './TrackScreenshots.css';

type OwnProps = {
  readonly threadIndex: ThreadIndex;
  readonly windowId: string;
};
type StateProps = {
  readonly thread: Thread;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly screenshots: Marker[];
  readonly threadName: string;
  readonly isMakingPreviewSelection: boolean;
};
type DispatchProps = {
  readonly updatePreviewSelection: typeof updatePreviewSelection;
};
type Props = SizeProps & ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = {
  offsetX: null | number;
  pageX: null | number;
  containerTop: null | number;
};

class Screenshots extends PureComponent<Props, State> {
  override state = {
    offsetX: null,
    pageX: null,
    containerTop: null,
  };

  findScreenshotAtMouse(offsetX: number): number | null {
    const { width, rangeStart, rangeEnd, screenshots } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const mouseTime = (offsetX / width) * rangeLength + rangeStart;

    // Loop backwards to find the latest screenshot that has a time less
    // than the current time at the mouse position.
    for (let i = screenshots.length - 1; i >= 0; i--) {
      const screenshotTime = screenshots[i].start;
      if (mouseTime >= screenshotTime) {
        if (mouseTime > (screenshots[i].end || Infinity)) {
          // The window is already closed at this point.
          return null;
        }
        return i;
      }
    }
    return null;
  }

  _handleMouseLeave = () => {
    this.setState({
      offsetX: null,
      pageX: null,
      containerTop: null,
    });
  };

  _handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { top, left } = event.currentTarget.getBoundingClientRect();
    this.setState({
      pageX: event.pageX,
      offsetX: event.pageX - left,
      containerTop: top,
    });
  };

  // This selects a screenshot when clicking on the screenshot strip.
  _selectScreenshotOnClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const { screenshots, updatePreviewSelection, isMakingPreviewSelection } =
      this.props;
    if (isMakingPreviewSelection) {
      // Avoid reseting the selection if the user is currently selecting one.
      return;
    }

    const { left } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const screenshotIndex = this.findScreenshotAtMouse(offsetX);
    if (screenshotIndex === null) {
      return;
    }
    const { start, end } = screenshots[screenshotIndex];
    if (end === null) {
      return;
    }
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: start,
      selectionEnd: end,
    });
  };

  override render() {
    const {
      screenshots,
      thread,
      isMakingPreviewSelection,
      width,
      rangeStart,
      rangeEnd,
    } = this.props;

    const { pageX, offsetX, containerTop } = this.state;
    let payload: ScreenshotPayload | null = null;

    if (offsetX !== null) {
      const screenshotIndex = this.findScreenshotAtMouse(offsetX);
      if (screenshotIndex !== null) {
        payload = screenshots[screenshotIndex].data as any;
      }
    }

    return (
      <div
        className="timelineTrackScreenshot"
        style={{ height: FULL_TRACK_SCREENSHOT_HEIGHT }}
        onMouseLeave={this._handleMouseLeave}
        onMouseMove={this._handleMouseMove}
        onClick={this._selectScreenshotOnClick}
      >
        <ScreenshotStrip
          thread={thread}
          width={width}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          screenshots={screenshots}
          trackHeight={FULL_TRACK_SCREENSHOT_HEIGHT}
        />
        {payload ? (
          <HoverPreview
            thread={thread}
            isMakingPreviewSelection={isMakingPreviewSelection}
            width={width}
            pageX={pageX}
            offsetX={offsetX}
            containerTop={containerTop}
            rangeEnd={rangeEnd}
            rangeStart={rangeStart}
            trackHeight={FULL_TRACK_SCREENSHOT_HEIGHT}
            payload={payload}
          />
        ) : null}
      </div>
    );
  }
}

const EMPTY_SCREENSHOTS_TRACK: Marker[] = [];

export const TimelineTrackScreenshots = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex, windowId } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const { start, end } = getCommittedRange(state);
    return {
      thread: selectors.getRangeFilteredThread(state),
      screenshots:
        selectors.getRangeFilteredScreenshotsById(state).get(windowId) ||
        EMPTY_SCREENSHOTS_TRACK,
      threadName: selectors.getFriendlyThreadName(state),
      rangeStart: start,
      rangeEnd: end,
      isMakingPreviewSelection: getPreviewSelectionIsBeingModified(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
  },
  component: withSize(Screenshots),
});

type HoverPreviewProps = {
  readonly thread: Thread;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly isMakingPreviewSelection: boolean;
  readonly offsetX: null | number;
  readonly pageX: null | number;
  readonly containerTop: null | number;
  readonly width: number;
  readonly trackHeight: number;
  readonly payload: ScreenshotPayload;
};

const MAXIMUM_HOVER_SIZE = 350;
const MAXIMUM_HOVER_SIZE_WHEN_SELECTING_RANGE = 100;

class HoverPreview extends PureComponent<HoverPreviewProps> {
  _screenshotHoverElement = ensureExists(
    document.querySelector('#screenshot-hover'),
    'Expected to find a screenshot hover element.'
  );

  override render() {
    const {
      thread,
      isMakingPreviewSelection,
      width,
      pageX,
      offsetX,
      containerTop,
      trackHeight,
      payload,
    } = this.props;

    if (offsetX === null || pageX === null) {
      return null;
    }

    if (payload.url === undefined) {
      return null;
    }

    const { url } = payload;

    const maximumHoverSize = isMakingPreviewSelection
      ? MAXIMUM_HOVER_SIZE_WHEN_SELECTING_RANGE
      : MAXIMUM_HOVER_SIZE;

    // Type guard: payload.url !== undefined means it has windowWidth and windowHeight
    const { width: hoverWidth, height: hoverHeight } = computeScreenshotSize(
      payload as { windowWidth: number; windowHeight: number },
      maximumHoverSize
    );

    // Set the top so it centers around the track.
    let top = (containerTop || 0) + (trackHeight - hoverHeight) * 0.5;
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
      this._screenshotHoverElement
    );
  }
}

type ScreenshotStripProps = {
  readonly thread: Thread;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly screenshots: Marker[];
  readonly width: number;
  readonly trackHeight: number;
};

class ScreenshotStrip extends PureComponent<ScreenshotStripProps> {
  override render() {
    const {
      thread,
      width: outerContainerWidth,
      rangeStart,
      rangeEnd,
      screenshots,
      trackHeight,
    } = this.props;

    if (screenshots.length === 0) {
      return null;
    }

    const images = [];
    const rangeLength = rangeEnd - rangeStart;
    const imageContainerWidth = trackHeight * 0.75;
    const timeToPixel = (time: Milliseconds) =>
      (outerContainerWidth * (time - rangeStart)) / rangeLength;

    const leftmostPixel = Math.max(timeToPixel(screenshots[0].start), 0);
    const rightmostPixel = Math.min(
      timeToPixel(screenshots[screenshots.length - 1].end || Infinity),
      outerContainerWidth
    );
    let screenshotIndex = 0;
    for (
      let left = leftmostPixel;
      left < rightmostPixel;
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
      const payload: ScreenshotPayload = screenshots[screenshotIndex]
        .data as any;
      if (payload.url === undefined) {
        continue;
      }
      const {
        url: urlStringIndex,
        windowWidth,
        windowHeight,
      } = payload as ScreenshotPayload & {
        windowWidth: number;
        windowHeight: number;
      };
      const scaledImageWidth = (trackHeight * windowWidth) / windowHeight;
      images.push(
        <div
          className="timelineTrackScreenshotImgContainer"
          style={{
            left,
            width: Math.min(imageContainerWidth, rightmostPixel - left),
          }}
          key={left}
        >
          {/* The following image is centered and cropped by the outer container. */}
          <img
            className="timelineTrackScreenshotImg"
            src={thread.stringTable.getString(urlStringIndex as number)}
            style={{
              width: scaledImageWidth,
              height: trackHeight,
            }}
          />
        </div>
      );
    }
    return images.length > 0 ? images : null;
  }
}
