/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

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

export type HoveredPixelState = {
  readonly sample: IndexIntoSamplesTable | null;
  readonly cpuRatioInTimeRange: CpuRatioInTimeRange | null;
};

type Props = {
  readonly className: string;
  readonly thread: Thread;
  readonly samplesSelectedStates: null | SelectedState[];
  readonly interval: Milliseconds;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly categories: CategoryList;
  readonly onSampleClick: (
    event: React.MouseEvent<HTMLElement>,
    sampleIndex: IndexIntoSamplesTable | null
  ) => void;
  readonly trackName: string;
  readonly timelineType: TimelineType;
  readonly implementationFilter: ImplementationFilter;
  readonly zeroAt: Milliseconds;
  readonly profileTimelineUnit: string;
} & SizeProps;

type State = {
  hoveredPixelState: null | HoveredPixelState;
  mouseX: CssPixels;
  mouseY: CssPixels;
};

type CanvasProps = {
  readonly className: string;
  readonly thread: Thread;
  readonly samplesSelectedStates: null | SelectedState[];
  readonly interval: Milliseconds;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly categories: CategoryList;
  readonly trackName: string;
} & SizeProps;

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class ThreadSampleGraphCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) =>
    (this._canvas = canvas);
  _canvasState: { renderScheduled: boolean; inView: boolean } = {
    renderScheduled: false,
    inView: false,
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

  override componentDidMount() {
    this._renderCanvas();
  }

  override componentDidUpdate() {
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
      ? canvas.ownerDocument.defaultView?.devicePixelRatio || 1
      : 1;
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    const ctx = canvas.getContext('2d')!;
    const rangeLength = rangeEnd - rangeStart;
    const xPixelsPerMs = canvas.width / rangeLength;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );
    const drawnSampleWidth = Math.min(drawnIntervalWidth, 10);

    const firstDrawnSampleTime = rangeStart - drawnIntervalWidth / xPixelsPerMs;
    const lastDrawnSampleTime = rangeEnd;

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
    const regularSamples: number[] = [];
    const idleSamples: number[] = [];
    const highlightedSamples: number[] = [];
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
        (sampleTime - rangeStart) * xPixelsPerMs - drawnSampleWidth / 2;
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

  override render() {
    const { trackName } = this.props;

    return (
      <InView onChange={this._observerCallback}>
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadSampleGraphCanvas'
          )}
          ref={this._takeCanvasRef}
        >
          <h2>Stack Graph for {trackName}</h2>
          <p>This graph charts the stack height of each sample.</p>
        </canvas>
      </InView>
    );
  }
}

export class ThreadSampleGraphImpl extends PureComponent<Props, State> {
  override state: State = {
    hoveredPixelState: null,
    mouseX: 0,
    mouseY: 0,
  };

  _onClick = (event: React.MouseEvent<HTMLElement>) => {
    const hoveredSample = this._getSampleAtMouseEvent(event);
    this.props.onSampleClick(event, hoveredSample?.sample ?? null);
  };

  _onMouseLeave = () => {
    this.setState({ hoveredPixelState: null });
  };

  _onMouseMove = (event: React.MouseEvent<HTMLElement>) => {
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
    event: React.MouseEvent<HTMLElement>
  ): null | HoveredPixelState {
    const canvas = event.currentTarget as HTMLCanvasElement;
    if (!canvas) {
      return null;
    }

    const { rangeStart, rangeEnd, thread, interval } = this.props;
    const r = canvas.getBoundingClientRect();

    const x = event.nativeEvent.offsetX;
    const time = rangeStart + (x / r.width) * (rangeEnd - rangeStart);

    // These values are copied from the `drawCanvas` method to compute the
    // `drawnSampleWidth` instead of extracting into a new function. Extracting
    // into a new function is not really idea for performance reasons since we
    // need these values for other values in `drawCanvas`.
    const rangeLength = rangeEnd - rangeStart;
    const xPixelsPerMs = r.width / rangeLength;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );
    const drawnSampleWidth = Math.min(drawnIntervalWidth, 10) / 2;

    const maxTimeDistance = (drawnSampleWidth / 2 / r.width) * rangeLength;

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

  override render() {
    const {
      className,
      trackName,
      timelineType,
      categories,
      implementationFilter,
      thread,
      interval,
      rangeStart,
      rangeEnd,
      samplesSelectedStates,
      width,
      height,
      zeroAt,
      profileTimelineUnit,
    } = this.props;
    const { hoveredPixelState, mouseX, mouseY } = this.state;

    return (
      <div
        className={className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        onClick={this._onClick}
      >
        <ThreadSampleGraphCanvas
          className={className}
          trackName={trackName}
          interval={interval}
          thread={thread}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          samplesSelectedStates={samplesSelectedStates}
          categories={categories}
          width={width}
          height={height}
        />

        {hoveredPixelState === null ? null : (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <SampleTooltipContents
              sampleIndex={(hoveredPixelState as HoveredPixelState).sample}
              cpuRatioInTimeRange={
                timelineType === 'cpu-category'
                  ? (hoveredPixelState as HoveredPixelState).cpuRatioInTimeRange
                  : null
              }
              rangeFilteredThread={thread}
              categories={categories}
              implementationFilter={implementationFilter}
              zeroAt={zeroAt}
              profileTimelineUnit={profileTimelineUnit}
              interval={interval}
            />
          </Tooltip>
        )}
      </div>
    );
  }
}

export const ThreadSampleGraph = withSize(ThreadSampleGraphImpl);
