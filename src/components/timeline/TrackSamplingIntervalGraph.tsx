/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import { formatMilliseconds } from 'firefox-profiler/utils/format-numbers';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getProfile,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { BLUE_50 } from 'photon-colors';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';

import type {
  Pid,
  Profile,
  Thread,
  Milliseconds,
  CssPixels,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackSamplingInterval.css';

type SamplingData = {
  time: Milliseconds[];
  interval: Milliseconds[];
};

/**
 * Collect all sampling intervals from all threads in a process
 */
function collectSamplingIntervalsForPid(
  profile: Profile,
  pid: Pid
): SamplingData {
  const allTimes: Array<{ time: Milliseconds; threadIndex: number }> = [];

  // Collect all sample times from all threads in this process
  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    const thread = profile.threads[threadIndex];

    if (thread.pid !== pid || thread.samples.length === 0) {
      continue;
    }

    // Get absolute times from either the time column or timeDeltas
    let sampleTimes: Milliseconds[];
    if (thread.samples.time) {
      sampleTimes = thread.samples.time;
    } else if (thread.samples.timeDeltas) {
      // Convert timeDeltas to absolute times
      sampleTimes = new Array(thread.samples.timeDeltas.length);
      let currentTime = 0;
      for (let i = 0; i < thread.samples.timeDeltas.length; i++) {
        currentTime += thread.samples.timeDeltas[i];
        sampleTimes[i] = currentTime;
      }
    } else {
      // No time data available
      continue;
    }

    for (let i = 0; i < sampleTimes.length; i++) {
      allTimes.push({
        time: sampleTimes[i],
        threadIndex,
      });
    }
  }

  // Sort by time
  allTimes.sort((a, b) => a.time - b.time);

  // Calculate intervals
  const times: Milliseconds[] = [];
  const intervals: Milliseconds[] = [];

  for (let i = 0; i < allTimes.length; i++) {
    times.push(allTimes[i].time);
    if (i > 0) {
      intervals.push(allTimes[i].time - allTimes[i - 1].time);
    } else {
      // First sample uses the profile's default interval
      intervals.push(profile.meta.interval);
    }
  }

  return { time: times, interval: intervals };
}

type CanvasProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly samplingData: SamplingData;
  readonly minInterval: Milliseconds;
  readonly maxInterval: Milliseconds;
  readonly profileInterval: Milliseconds;
  readonly width: CssPixels;
  readonly height: CssPixels;
  readonly lineWidth: CssPixels;
};

class TrackSamplingIntervalCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      samplingData,
      height,
      width,
      lineWidth,
      minInterval,
      maxInterval,
    } = this.props;
    if (width === 0) {
      return;
    }

    const ctx = canvas.getContext('2d')!;
    const devicePixelRatio = window.devicePixelRatio;
    const deviceWidth = width * devicePixelRatio;
    const deviceHeight = height * devicePixelRatio;
    const deviceLineWidth = lineWidth * devicePixelRatio;
    const deviceLineHalfWidth = deviceLineWidth * 0.5;
    const innerDeviceHeight = deviceHeight - deviceLineWidth;
    const rangeLength = rangeEnd - rangeStart;
    const millisecondWidth = deviceWidth / rangeLength;

    // Resize and clear the canvas.
    canvas.width = Math.round(deviceWidth);
    canvas.height = Math.round(deviceHeight);
    ctx.clearRect(0, 0, deviceWidth, deviceHeight);

    if (samplingData.time.length === 0) {
      return;
    }

    // Find sample range within visible time range
    const startIndex = bisectionRight(samplingData.time, rangeStart);
    const endIndex = bisectionRight(samplingData.time, rangeEnd);

    if (startIndex >= endIndex) {
      return;
    }

    ctx.lineWidth = deviceLineWidth;
    ctx.lineJoin = 'bevel';
    ctx.strokeStyle = BLUE_50;
    ctx.fillStyle = BLUE_50 + '44'; // Blue with transparency
    ctx.beginPath();

    const getX = (i: number) =>
      Math.round((samplingData.time[i] - rangeStart) * millisecondWidth);
    const getY = (intervalValue: Milliseconds) => {
      const intervalRange = maxInterval - minInterval;
      const normalizedValue =
        intervalRange > 0 ? (intervalValue - minInterval) / intervalRange : 0;
      return Math.round(
        innerDeviceHeight -
          innerDeviceHeight * normalizedValue +
          deviceLineHalfWidth
      );
    };

    const firstX = getX(startIndex);
    let x = firstX;
    let y = getY(samplingData.interval[startIndex]);

    // Move to the first point
    ctx.moveTo(x, y);

    // Draw the line with optimization for multiple samples per pixel
    for (let i = startIndex + 1; i < endIndex; i++) {
      const intervalValues = [samplingData.interval[i]];
      x = getX(i);
      y = getY(intervalValues[0]);
      ctx.lineTo(x, y);

      // If we have multiple samples to draw on the same horizontal pixel,
      // we process all of them together with a max-min decimation algorithm
      // to save time:
      // - We draw the first and last samples to ensure the display is correct
      // - For the values in between, we only draw the min and max values,
      //   to draw a vertical line covering all the other sample values.
      while (i + 1 < endIndex && getX(i + 1) === x) {
        intervalValues.push(samplingData.interval[++i]);
      }

      // Looking for the min and max only makes sense if we have more than 2 samples
      if (intervalValues.length > 2) {
        const minY = getY(Math.min(...intervalValues));
        if (minY !== y) {
          y = minY;
          ctx.lineTo(x, y);
        }
        const maxY = getY(Math.max(...intervalValues));
        if (maxY !== y) {
          y = maxY;
          ctx.lineTo(x, y);
        }
      }

      const lastY = getY(intervalValues[intervalValues.length - 1]);
      if (lastY !== y) {
        y = lastY;
        ctx.lineTo(x, y);
      }
    }

    // Stroke the line
    ctx.stroke();

    // Fill to bottom
    ctx.lineTo(x, deviceHeight);
    ctx.lineTo(firstX, deviceHeight);
    ctx.fill();
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas;
        if (canvas) {
          this.drawCanvas(canvas);
        }
      });
    }
  }

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  override componentDidMount() {
    this._scheduleDraw();
  }

  override componentDidUpdate() {
    this._scheduleDraw();
  }

  override render() {
    return (
      <canvas
        className="timelineTrackSamplingIntervalCanvas"
        ref={this._takeCanvasRef}
      />
    );
  }
}

type OwnProps = {
  readonly pid: Pid;
  readonly lineWidth: CssPixels;
  readonly graphHeight: CssPixels;
};

type StateProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly samplingData: SamplingData;
  readonly minInterval: Milliseconds;
  readonly maxInterval: Milliseconds;
  readonly profileInterval: Milliseconds;
  readonly profile: Profile;
};

type DispatchProps = {};

type Props = SizeProps & ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  hoveredSample: null | number;
  mouseX: CssPixels;
  mouseY: CssPixels;
};

class TrackSamplingIntervalGraphImpl extends React.PureComponent<Props, State> {
  override state = {
    hoveredSample: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onMouseLeave = () => {
    this.setState({ hoveredSample: null });
  };

  _onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    const { left } = event.currentTarget.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, samplingData } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;

    if (samplingData.time.length === 0) {
      this.setState({ hoveredSample: null });
      return;
    }

    if (
      timeAtMouse < samplingData.time[0] ||
      timeAtMouse > samplingData.time[samplingData.time.length - 1]
    ) {
      this.setState({ hoveredSample: null });
      return;
    }

    // Find the closest sample
    const bisectionIndex = bisectionRight(samplingData.time, timeAtMouse);
    let hoveredSample;

    if (bisectionIndex > 0 && bisectionIndex < samplingData.time.length) {
      const leftDistance = timeAtMouse - samplingData.time[bisectionIndex - 1];
      const rightDistance = samplingData.time[bisectionIndex] - timeAtMouse;
      if (leftDistance < rightDistance) {
        hoveredSample = bisectionIndex - 1;
      } else {
        hoveredSample = bisectionIndex;
      }

      // If there are samples before or after hoveredSample that fall
      // horizontally on the same pixel, move hoveredSample to the sample
      // with the highest interval value.
      const mouseAtTime = (t: number) =>
        Math.round(((t - rangeStart) / rangeLength) * width + left);
      for (
        let currentIndex = hoveredSample - 1;
        currentIndex >= 0 &&
        mouseAtTime(samplingData.time[currentIndex]) === mouseX;
        --currentIndex
      ) {
        if (
          samplingData.interval[currentIndex] >
          samplingData.interval[hoveredSample]
        ) {
          hoveredSample = currentIndex;
        }
      }
      for (
        let currentIndex = hoveredSample + 1;
        currentIndex < samplingData.time.length &&
        mouseAtTime(samplingData.time[currentIndex]) === mouseX;
        ++currentIndex
      ) {
        if (
          samplingData.interval[currentIndex] >
          samplingData.interval[hoveredSample]
        ) {
          hoveredSample = currentIndex;
        }
      }
    } else if (bisectionIndex >= samplingData.time.length) {
      hoveredSample = samplingData.time.length - 1;
    } else {
      hoveredSample = bisectionIndex;
    }

    this.setState({
      mouseX,
      mouseY,
      hoveredSample,
    });
  };

  _renderTooltip(sampleIndex: number): React.ReactNode {
    const { samplingData, profileInterval, rangeStart, rangeEnd } = this.props;
    const { mouseX, mouseY } = this.state;

    const interval = samplingData.interval[sampleIndex];
    const time = samplingData.time[sampleIndex];

    if (time < rangeStart || time > rangeEnd) {
      return null;
    }

    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <div className="timelineTrackSamplingIntervalTooltip">
          <div className="timelineTrackSamplingIntervalTooltipLabel">
            Sampling Interval:
          </div>
          <div className="timelineTrackSamplingIntervalTooltipValue">
            {formatMilliseconds(interval, 3, 1)}
          </div>
          <div className="timelineTrackSamplingIntervalTooltipLabel">
            Expected Interval:
          </div>
          <div className="timelineTrackSamplingIntervalTooltipValue">
            {formatMilliseconds(profileInterval, 3, 1)}
          </div>
        </div>
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * sample being hovered.
   */
  _renderDot(sampleIndex: number): React.ReactNode {
    const {
      samplingData,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      minInterval,
      maxInterval,
    } = this.props;

    const sampleTime = samplingData.time[sampleIndex];
    const intervalValue = samplingData.interval[sampleIndex];

    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      return null;
    }

    const rangeLength = rangeEnd - rangeStart;
    const left = (width * (sampleTime - rangeStart)) / rangeLength;

    const intervalRange = maxInterval - minInterval;
    const normalizedValue =
      intervalRange > 0 ? (intervalValue - minInterval) / intervalRange : 0;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    const top =
      innerTrackHeight - normalizedValue * innerTrackHeight + lineWidth / 2;

    return (
      <div
        style={{
          left,
          top,
          backgroundColor: BLUE_50,
        }}
        className="timelineTrackSamplingIntervalGraphDot"
      />
    );
  }

  override render() {
    const { samplingData, profileInterval } = this.props;
    const { hoveredSample } = this.state;

    if (samplingData.time.length === 0) {
      return (
        <EmptyThreadIndicator
          thread={
            {
              name: 'Empty',
              samples: { length: 0 },
            } as unknown as Thread
          }
          interval={profileInterval}
          rangeStart={this.props.rangeStart}
          rangeEnd={this.props.rangeEnd}
          unfilteredSamplesRange={null}
        />
      );
    }

    const {
      rangeStart,
      rangeEnd,
      minInterval,
      maxInterval,
      lineWidth,
      graphHeight,
      width,
    } = this.props;

    return (
      <div
        className="timelineTrackSamplingIntervalGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackSamplingIntervalCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          samplingData={samplingData}
          minInterval={minInterval}
          maxInterval={maxInterval}
          profileInterval={profileInterval}
          width={width}
          height={graphHeight}
          lineWidth={lineWidth}
        />
        {hoveredSample === null ? null : (
          <>
            {this._renderDot(hoveredSample)}
            {this._renderTooltip(hoveredSample)}
          </>
        )}
      </div>
    );
  }
}

const SizedTrackSamplingIntervalGraphImpl = withSize(
  TrackSamplingIntervalGraphImpl
);

export const TrackSamplingIntervalGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { pid } = ownProps;
    const { start, end } = getCommittedRange(state);
    const profile = getProfile(state);
    const profileInterval = getProfileInterval(state);
    const samplingData = collectSamplingIntervalsForPid(profile, pid);

    // Calculate min/max intervals for normalization based on visible range
    let minInterval = 0;
    let maxInterval = profileInterval * 3; // fallback
    if (samplingData.time.length > 0) {
      // Find the range of intervals visible in the committed range
      const startIndex = bisectionRight(samplingData.time, start);
      const endIndex = bisectionRight(samplingData.time, end);

      if (startIndex < endIndex) {
        const visibleIntervals = samplingData.interval.slice(
          startIndex,
          endIndex
        );
        const minVisibleInterval = Math.min(...visibleIntervals);
        const maxVisibleInterval = Math.max(...visibleIntervals);

        // Add 10% padding to avoid having lines at the very edges
        const range = maxVisibleInterval - minVisibleInterval;
        const padding = range * 0.1;
        minInterval = Math.max(0, minVisibleInterval - padding);
        maxInterval = maxVisibleInterval + padding;
      }
    }

    return {
      rangeStart: start,
      rangeEnd: end,
      samplingData,
      minInterval,
      maxInterval,
      profileInterval,
      profile,
    };
  },
  mapDispatchToProps: {},
  component: SizedTrackSamplingIntervalGraphImpl,
});
