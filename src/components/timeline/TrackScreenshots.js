/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  getCommittedRange,
  getIsMakingPreviewSelection,
} from 'firefox-profiler/selectors/profile';
import { getScreenshotTrackHeight } from 'firefox-profiler/selectors/app';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { createPortal } from 'react-dom';

import type {
  ScreenshotPayload,
  ThreadIndex,
  Thread,
  Marker,
  Milliseconds,
  CssPixels,
  Dispatch,
} from 'firefox-profiler/types';

import { ensureExists } from 'firefox-profiler/utils/flow';
import './TrackScreenshots.css';
import { useDimensions } from '../shared/UseDimensions';

const EMPTY_SCREENSHOTS_TRACK = [];

type HoverPreviewProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +isMakingPreviewSelection: boolean,
  +offsetX: null | number,
  +pageX: null | number,
  +containerTop: null | number,
  +width: number,
  +trackHeight: number,
  +payload: ScreenshotPayload,
|};

const MAXIMUM_HOVER_SIZE = 350;

class HoverPreview extends PureComponent<HoverPreviewProps> {
  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  render() {
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

    if (isMakingPreviewSelection || offsetX === null || pageX === null) {
      return null;
    }
    const { url, windowWidth, windowHeight } = payload;
    // Compute the hover image's thumbnail size.
    // Coefficient should be according to bigger side.
    const coefficient =
      windowHeight > windowWidth
        ? MAXIMUM_HOVER_SIZE / windowHeight
        : MAXIMUM_HOVER_SIZE / windowWidth;
    let hoverHeight = windowHeight * coefficient;
    let hoverWidth = windowWidth * coefficient;

    hoverWidth = Math.round(hoverWidth);
    hoverHeight = Math.round(hoverHeight);

    // Set the top so it centers around the track.
    let top = containerTop + (trackHeight - hoverHeight) * 0.5;
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

type Props = {|
  +threadIndex: ThreadIndex,
  +windowId: string,
|};

export function TimelineTrackScreenshots({ threadIndex, windowId }: Props) {
  // Selectors
  const selectors = getThreadSelectors(threadIndex);
  const { start: rangeStart, end: rangeEnd } = useSelector(getCommittedRange);
  const isMakingPreviewSelection = useSelector(getIsMakingPreviewSelection);
  const thread = useSelector(selectors.getRangeFilteredThread);
  const screenshotsById = useSelector(
    selectors.getRangeFilteredScreenshotsById
  );
  const trackHeight = useSelector(getScreenshotTrackHeight);
  const screenshots = screenshotsById.get(windowId) || EMPTY_SCREENSHOTS_TRACK;

  // Hooks
  const dispatch = useDispatch<Dispatch>();
  const {
    ref,
    dimensions: { width },
  } = useDimensions();

  // State
  const [pageX, setPageX] = useState<CssPixels | null>(null);
  const [offsetX, setOffsetX] = useState<CssPixels | null>(null);
  const [containerTop, setContainerTop] = useState<CssPixels | null>(null);

  function handleMouseLeave() {
    setPageX(null);
    setOffsetX(null);
    setContainerTop(null);
  }

  function handleMouseMove(event: SyntheticMouseEvent<HTMLDivElement>) {
    const { top, left } = event.currentTarget.getBoundingClientRect();
    setPageX(event.pageX);
    setOffsetX(event.pageX - left);
    setContainerTop(top);
  }

  // This selects a screenshot when clicking on the screenshot strip. Note that
  // we use the mouseup event so that isMakingPreviewSelection is still
  // accurate.
  function selectScreenshotOnClick(event: SyntheticMouseEvent<HTMLDivElement>) {
    if (isMakingPreviewSelection) {
      // Avoid reseting the selection if the user is currently selecting one.
      return;
    }

    const { left } = event.currentTarget.getBoundingClientRect();
    const offsetX = event.pageX - left;
    const screenshotIndex = findScreenshotAtMouse(offsetX);
    if (screenshotIndex === null) return;
    const { start, end } = screenshots[screenshotIndex];
    if (end === null) return;
    dispatch(
      updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: start,
        selectionEnd: end,
      })
    );
  }

  function findScreenshotAtMouse(offsetX: number): number | null {
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

  let payload: ScreenshotPayload | null = null;

  if (offsetX !== null) {
    const screenshotIndex = findScreenshotAtMouse(offsetX);
    if (screenshotIndex !== null) {
      payload = (screenshots[screenshotIndex].data: any);
    }
  }

  return (
    <div
      className="timelineTrackScreenshot"
      ref={ref}
      style={{ height: trackHeight }}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
      onMouseUp={selectScreenshotOnClick}
    >
      <ScreenshotStrip
        thread={thread}
        width={width}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        screenshots={screenshots}
        trackHeight={trackHeight}
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
          trackHeight={trackHeight}
          payload={payload}
        />
      ) : null}
    </div>
  );
}

type ScreenshotStripProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +screenshots: Marker[],
  +width: number,
  +trackHeight: number,
|};

class ScreenshotStrip extends PureComponent<ScreenshotStripProps> {
  render() {
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
      const scaledImageWidth = (trackHeight * windowWidth) / windowHeight;
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
              height: trackHeight,
            }}
          />
        </div>
      );
    }
    return images;
  }
}
