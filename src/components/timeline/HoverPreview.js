// @flow
import React, { PureComponent } from 'react';
import { TRACK_HEIGHT } from './TrackScreenshots';
import { createPortal } from 'react-dom';
import { ensureExists } from '../../utils/flow';
import type { Thread } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type { ScreenshotPayload } from '../../types/markers';

type Props = {|
  thread: Thread,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  screenshots: TracingMarker[],
  isMakingPreviewSelection: boolean,
  offsetX: null | number,
  pageX: null | number,
  containerTop: null | number,
  width: number,
|};

const HOVER_HEIGHT = 100;
const HOVER_MAX_WIDTH_RATIO = 1.75;

export default class HoverPreview extends PureComponent<Props> {
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
          pageX - offsetX + width - hoverWidth
        : // Center the hover image around the mouse.
          pageX - hoverWidth * 0.5;

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
