// @flow
import React, { PureComponent } from 'react';
import { TRACK_HEIGHT } from './TrackScreenshots';
import type { ScreenshotPayload } from '../../types/markers';
import type { Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';

type Props = {|
  thread: Thread,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  screenshots: TracingMarker[],
  width: number,
|};

export default class ScreenshotStrip extends PureComponent<Props> {
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
}
