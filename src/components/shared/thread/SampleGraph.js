/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { InView } from 'react-intersection-observer';
import { timeCode } from 'firefox-profiler/utils/time-code';
import { getSampleIndexClosestToCenteredTime } from 'firefox-profiler/profile-logic/profile-data';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import { BLUE_70, BLUE_40 } from 'photon-colors';
import {
  Tooltip,
  MOUSE_OFFSET,
} from 'firefox-profiler/components/tooltip/Tooltip';
import { SampleTooltipContents } from 'firefox-profiler/components/shared/SampleTooltipContents';

import './SampleGraph.css';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  Milliseconds,
  SelectedState,
  CssPixels,
  TimelineType,
  ImplementationFilter,
} from 'firefox-profiler/types';
import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { CpuRatioInTimeRange } from './ActivityGraphFills';

export type HoveredPixelState = {|
  +sample: IndexIntoSamplesTable | null,
  +cpuRatioInTimeRange: CpuRatioInTimeRange | null,
|};

type Props = {|
  +className: string,
  +thread: Thread,
  +samplesSelectedStates: null | SelectedState[],
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +categories: CategoryList,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable | null
  ) => void,
  +trackName: string,
  +timelineType: TimelineType,
  implementationFilter: ImplementationFilter,
  ...SizeProps,
|};

type State = {
  hoveredPixelState: null | HoveredPixelState,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

export class ThreadSampleGraphImpl extends PureComponent<Props, State> {
  _canvas: null | HTMLCanvasElement = null;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) =>
    (this._canvas = canvas);
  _canvasState: {| renderScheduled: boolean, inView: boolean |} = {
    renderScheduled: false,
    inView: false,
  };
  state = {
    hoveredPixelState: null,
    mouseX: 0,
    mouseY: 0,
  };

  _renderCanvas() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

    const canvas = this._canvas;
    if (canvas !== null) {
      timeCode('ThreadSampleGraph render', () => {
        this.drawCanvas(canvas);
      });
    }
  }

  _observerCallback = (inView: boolean, _entry: IntersectionObserverEntry) => {
    this._canvasState.inView = inView;
    if (!this._canvasState.renderScheduled) {
      // Skip if render is not scheduled.
      return;
    }

    this._renderCanvas();
  };

  componentDidMount() {
    this._renderCanvas();
  }

  componentDidUpdate() {
    this._renderCanvas();
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      thread,
      interval,
      rangeStart,
      rangeEnd,
      samplesSelectedStates,
      categories,
      width,
      height,
    } = this.props;

    const devicePixelRatio = canvas.ownerDocument
      ? canvas.ownerDocument.defaultView.devicePixelRatio
      : 1;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    const range = [rangeStart, rangeEnd];
    const rangeLength = range[1] - range[0];
    const xPixelsPerMs = canvas.width / rangeLength;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );
    const drawnSampleWidth = Math.min(drawnIntervalWidth, 10);

    const firstDrawnSampleTime = range[0] - drawnIntervalWidth / xPixelsPerMs;
    const lastDrawnSampleTime = range[1];

    const firstDrawnSampleIndex = bisectionRight(
      thread.samples.time,
      firstDrawnSampleTime
    );
    const afterLastDrawnSampleIndex = bisectionRight(
      thread.samples.time,
      lastDrawnSampleTime,
      firstDrawnSampleIndex
    );

    // Do one pass over the samples array to gather the samples we want to draw.
    const regularSamples = [];
    const idleSamples = [];
    const highlightedSamples = [];
    // Enforce a minimum distance so that we don't draw more than 4 samples per
    // pixel.
    const minGapMs = 0.25 / xPixelsPerMs;
    let nextMinTime = -Infinity;
    for (let i = firstDrawnSampleIndex; i < afterLastDrawnSampleIndex; i++) {
      const sampleTime = thread.samples.time[i];
      if (sampleTime < nextMinTime) {
        continue;
      }
      const stackIndex = thread.samples.stack[i];
      if (stackIndex === null) {
        continue;
      }
      const xPos =
        (sampleTime - range[0]) * xPixelsPerMs - drawnSampleWidth / 2;
      let samplesBucket;
      if (
        samplesSelectedStates !== null &&
        samplesSelectedStates[i] === 'SELECTED'
      ) {
        samplesBucket = highlightedSamples;
      } else {
        const categoryIndex = thread.stackTable.category[stackIndex];
        const category = categories[categoryIndex];
        if (category.name === 'Idle') {
          samplesBucket = idleSamples;
        } else {
          samplesBucket = regularSamples;
        }
      }
      samplesBucket.push(xPos);
      nextMinTime = sampleTime + minGapMs;
    }

    function drawSamples(samplePositions: number[], color: string) {
      if (samplePositions.length === 0) {
        return;
      }
      ctx.fillStyle = color;
      for (let i = 0; i < samplePositions.length; i++) {
        const startY = 0;
        const xPos = samplePositions[i];
        ctx.fillRect(xPos, startY, drawnSampleWidth, canvas.height);
      }
    }

    // Draw the samples in multiple passes, separated by color. This reduces the calls
    // to ctx.fillStyle, which saves on time that's spent parsing color strings.
    const lighterBlue = '#c5e1fe';
    drawSamples(regularSamples, BLUE_40);
    drawSamples(highlightedSamples, BLUE_70);
    drawSamples(idleSamples, lighterBlue);
  }

  _onClick = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const hoveredSample = this._getSampleAtMouseEvent(event);
    this.props.onSampleClick(event, hoveredSample?.sample ?? null);
  };

  _onMouseLeave = () => {
    this.setState({ hoveredPixelState: null });
  };

  _onMouseMove = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    this.setState({
      hoveredPixelState: this._getSampleAtMouseEvent(event),
      mouseX: event.pageX,
      // Have the tooltip align to the bottom of the track.
      mouseY: rect.bottom - MOUSE_OFFSET,
    });
  };

  _getSampleAtMouseEvent(
    event: SyntheticMouseEvent<HTMLCanvasElement>
  ): null | HoveredPixelState {
    const canvas = this._canvas;
    if (!canvas) {
      return null;
    }

    const { rangeStart, rangeEnd, thread, interval } = this.props;
    const r = canvas.getBoundingClientRect();

    const x = event.pageX - r.left;
    const time = rangeStart + (x / r.width) * (rangeEnd - rangeStart);

    const range = [rangeStart, rangeEnd];
    const rangeLength = range[1] - range[0];
    const xPixelsPerMs = canvas.width / rangeLength;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );
    const drawnSampleWidth = Math.min(drawnIntervalWidth, 10) / 2;

    const maxTimeDistance =
      (drawnSampleWidth / 2 / r.width) * (rangeEnd - rangeStart);

    const sampleIndex = getSampleIndexClosestToCenteredTime(
      thread.samples,
      time,
      maxTimeDistance
    );

    if (sampleIndex === null) {
      // No sample that is close enough found. Mouse doesn't hover any of the
      // sample boxes in the sample graph.
      return null;
    }

    if (thread.samples.stack[sampleIndex] === null) {
      // If the sample index refers to a null sample, that sample
      // has been filtered out and means that there was no stack bar
      // drawn at the place where the user clicked. Do nothing here.
      return null;
    }

    return {
      sample: sampleIndex,
      cpuRatioInTimeRange: null,
    };
  }

  render() {
    const {
      className,
      trackName,
      timelineType,
      categories,
      implementationFilter,
      thread,
    } = this.props;
    const { hoveredPixelState, mouseX, mouseY } = this.state;

    return (
      <div
        className={className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <InView onChange={this._observerCallback}>
          <canvas
            className={classNames(
              `${this.props.className}Canvas`,
              'threadSampleGraphCanvas'
            )}
            ref={this._takeCanvasRef}
            onClick={this._onClick}
          >
            <h2>Stack Graph for {trackName}</h2>
            <p>This graph charts the stack height of each sample.</p>
          </canvas>
          {hoveredPixelState === null ? null : (
            <Tooltip mouseX={mouseX} mouseY={mouseY}>
              <SampleTooltipContents
                sampleIndex={hoveredPixelState.sample}
                cpuRatioInTimeRange={
                  timelineType === 'cpu-category'
                    ? hoveredPixelState.cpuRatioInTimeRange
                    : null
                }
                rangeFilteredThread={thread}
                categories={categories}
                implementationFilter={implementationFilter}
              />
            </Tooltip>
          )}
        </InView>
      </div>
    );
  }
}

export const ThreadSampleGraph = withSize<Props>(ThreadSampleGraphImpl);
