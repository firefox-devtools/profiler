/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { InView } from 'react-intersection-observer';
import { Localized } from '@fluent/react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import {
  getStrokeColor,
  getFillColor,
  getDotColor,
} from 'firefox-profiler/profile-logic/graph-color';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  formatBytes,
  formatNumber,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import { bisectionRight } from 'firefox-profiler/utils/bisect';
import {
  getCommittedRange,
  getCounterSelectors,
  getPreviewSelection,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { TooltipTrackPower } from 'firefox-profiler/components/tooltip/TrackPower';
import {
  TooltipDetails,
  TooltipDetail,
  TooltipDetailSeparator,
} from 'firefox-profiler/components/tooltip/TooltipDetails';
import { EmptyThreadIndicator } from './EmptyThreadIndicator';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import { co2 } from '@tgwf/co2';

import type {
  CounterIndex,
  Counter,
  Thread,
  ThreadIndex,
  AccumulatedCounterSamples,
  Milliseconds,
  PreviewSelection,
  CssPixels,
  StartEndRange,
  IndexIntoSamplesTable,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackCounter.css';

/**
 * When adding properties to these props, please consider the comment above `TrackCounterCanvas`.
 */
type CanvasProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly counter: Counter;
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable];
  readonly accumulatedSamples: AccumulatedCounterSamples;
  readonly maxCounterSampleCountPerMs: number;
  readonly interval: Milliseconds;
  readonly width: CssPixels;
  readonly height: CssPixels;
  readonly lineWidth: CssPixels;
};

/**
 * This component controls the rendering of the canvas. Every render call through
 * React triggers a new canvas render. Because of this, it's important to only pass
 * in the props that are needed for the canvas draw call.
 */
class TrackCounterCanvas extends React.PureComponent<CanvasProps> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;
  _canvasState: { renderScheduled: boolean; inView: boolean } = {
    renderScheduled: false,
    inView: false,
  };

  drawCanvas(canvas: HTMLCanvasElement): void {
    const {
      rangeStart,
      rangeEnd,
      counter,
      height,
      width,
      lineWidth,
      interval,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
      counterSampleRange,
    } = this.props;
    const { display } = counter;
    if (width === 0) {
      // Attempt to draw before the canvas was laid out.
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
    const intervalWidth = interval * millisecondWidth;

    // Resize and clear the canvas.
    canvas.width = Math.round(deviceWidth);
    canvas.height = Math.round(deviceHeight);
    ctx.clearRect(0, 0, deviceWidth, deviceHeight);

    const samples = counter.samples;
    if (samples.length === 0) {
      // There's no reason to draw the samples, there are none.
      return;
    }

    // Take the sample information, and convert it into chart coordinates. Use a slightly
    // smaller space than the deviceHeight, so that the stroke will be fully visible
    // both at the top and bottom of the chart.
    const [sampleStart, sampleEnd] = counterSampleRange;

    {
      // Draw the chart.
      //
      //                 ...--`
      //  1 ...---```..--      `--. 2
      //    |_____________________|
      //  4                        3
      //
      // Start by drawing from 1 to 2. This will be the top of all the peaks of the
      // counter graph.

      ctx.lineWidth = deviceLineWidth;
      ctx.lineJoin = 'bevel';
      ctx.strokeStyle = getStrokeColor(display.color);
      ctx.fillStyle = getFillColor(display.color);
      ctx.beginPath();

      switch (display.graphType) {
        case 'line-accumulated': {
          // Accumulated graph: plot the running total.
          const { minCount, countRange, accumulatedCounts } =
            accumulatedSamples;

          // The x and y are used after the loop.
          let x = 0;
          let y = 0;
          let firstX = 0;
          for (let i = sampleStart; i < sampleEnd; i++) {
            // Create a path for the top of the chart. This is the line that will have
            // a stroke applied to it.
            x = (samples.time[i] - rangeStart) * millisecondWidth;
            // Add on half the stroke's line width so that it won't be cut off the edge
            // of the graph.
            const unitGraphCount =
              (accumulatedCounts[i] - minCount) / countRange;
            y =
              innerDeviceHeight -
              innerDeviceHeight * unitGraphCount +
              deviceLineHalfWidth;
            if (i === sampleStart) {
              // This is the first iteration, only move the line, do not draw it. Also
              // remember this first X, as the bottom of the graph will need to connect
              // back up to it.
              firstX = x;
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          // The samples range ends at the time of the last sample, plus the interval.
          // Draw this last bit.
          ctx.lineTo(x + intervalWidth, y);

          // Don't do the fill yet, just stroke the top line. This will draw a line from
          // point 1 to 2 in the diagram above.
          ctx.stroke();

          // After doing the stroke, continue the path to complete the fill to the bottom
          // of the canvas. This continues the path to point 3 and then 4.

          // Create a line from 2 to 3.
          ctx.lineTo(x + intervalWidth, deviceHeight);

          // Create a line from 3 to 4.
          ctx.lineTo(firstX, deviceHeight);

          // The line from 4 to 1 will be implicitly filled in.
          ctx.fill();
          break;
        }
        case 'line-rate': {
          // Rate graph: plot count / timeDelta with min-max decimation.
          const countRangePerMs = maxCounterSampleCountPerMs;

          const getX = (i: number) =>
            Math.round((samples.time[i] - rangeStart) * millisecondWidth);
          const getY = (rawY: number) => {
            if (!rawY) {
              // Make the 0 values invisible so that 'almost 0' is noticeable.
              return deviceHeight + deviceLineHalfWidth;
            }
            const unitGraphCount = rawY / countRangePerMs;
            return (
              innerDeviceHeight -
              innerDeviceHeight * unitGraphCount +
              // Add on half the stroke's line width so that it won't be cut off the edge
              // of the graph.
              deviceLineHalfWidth
            );
          };

          const getRate = (i: number) => {
            const sampleTimeDeltaInMs =
              i === 0 ? interval : samples.time[i] - samples.time[i - 1];
            return samples.count[i] / sampleTimeDeltaInMs;
          };

          // The x and y are used after the loop.
          const firstX = getX(sampleStart);
          let x = firstX;
          let y = getY(getRate(sampleStart));

          // For the first sample, only move the line, do not draw it. Also
          // remember this first X, as the bottom of the graph will need to connect
          // back up to it.
          ctx.moveTo(x, y);

          // Create a path for the top of the chart. This is the line that will have
          // a stroke applied to it.
          for (let i = sampleStart + 1; i < sampleEnd; i++) {
            const rateValues = [getRate(i)];
            x = getX(i);
            y = getY(rateValues[0]);
            ctx.lineTo(x, y);

            // If we have multiple samples to draw on the same horizontal pixel,
            // we process all of them together with a max-min decimation algorithm
            // to save time:
            // - We draw the first and last samples to ensure the display is
            //   correct if there are sampling gaps.
            // - For the values in between, we only draw the min and max values,
            //   to draw a vertical line covering all the other sample values.
            while (i + 1 < sampleEnd && getX(i + 1) === x) {
              rateValues.push(getRate(++i));
            }

            // Looking for the min and max only makes sense if we have more than 2
            // samples to draw.
            if (rateValues.length > 2) {
              const minY = getY(Math.min(...rateValues));
              if (minY !== y) {
                y = minY;
                ctx.lineTo(x, y);
              }
              const maxY = getY(Math.max(...rateValues));
              if (maxY !== y) {
                y = maxY;
                ctx.lineTo(x, y);
              }
            }

            const lastY = getY(rateValues[rateValues.length - 1]);
            if (lastY !== y) {
              y = lastY;
              ctx.lineTo(x, y);
            }
          }

          // The samples range ends at the time of the last sample, plus the interval.
          // Draw this last bit.
          ctx.lineTo(x + intervalWidth, y);

          // Don't do the fill yet, just stroke the top line. This will draw a line from
          // point 1 to 2 in the diagram above.
          ctx.stroke();

          // After doing the stroke, continue the path to complete the fill to the bottom
          // of the canvas. This continues the path to point 3 and then 4.

          // Create a line from 2 to 3.
          ctx.lineTo(x + intervalWidth, deviceHeight);

          // Create a line from 3 to 4.
          ctx.lineTo(firstX, deviceHeight);

          // The line from 4 to 1 will be implicitly filled in.
          ctx.fill();
          break;
        }
        default:
          throw assertExhaustiveCheck(display.graphType);
      }
    }
  }

  _scheduleDraw() {
    if (!this._canvasState.inView) {
      // Canvas is not in the view. Schedule the render for a later intersection
      // observer callback.
      this._canvasState.renderScheduled = true;
      return;
    }

    // Canvas is in the view. Render the canvas and reset the schedule state.
    this._canvasState.renderScheduled = false;

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

  _observerCallback = (inView: boolean, _entry: IntersectionObserverEntry) => {
    this._canvasState.inView = inView;
    if (!this._canvasState.renderScheduled) {
      // Skip if render is not scheduled.
      return;
    }

    this._scheduleDraw();
  };

  override componentDidMount() {
    this._scheduleDraw();
  }

  override componentDidUpdate() {
    this._scheduleDraw();
  }

  override render() {
    return (
      <InView onChange={this._observerCallback}>
        <canvas
          className="timelineTrackCounterCanvas"
          ref={this._takeCanvasRef}
        />
      </InView>
    );
  }
}

type OwnProps = {
  readonly counterIndex: CounterIndex;
  readonly lineWidth: CssPixels;
  readonly graphHeight: CssPixels;
};

type StateProps = {
  readonly threadIndex: ThreadIndex;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly counter: Counter;
  readonly counterSampleRange: [IndexIntoSamplesTable, IndexIntoSamplesTable];
  readonly accumulatedSamples: AccumulatedCounterSamples;
  readonly maxCounterSampleCountPerMs: number;
  readonly interval: Milliseconds;
  readonly filteredThread: Thread;
  readonly unfilteredSamplesRange: StartEndRange | null;
  readonly previewSelection: PreviewSelection | null;
};

type DispatchProps = {};

type Props = SizeProps & ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  hoveredCounter: null | number;
  mouseX: CssPixels;
  mouseY: CssPixels;
};

/**
 * The generic counter track graph component. It renders information from any counters
 * (eg, Memory, Power, etc.) as a graph in the timeline. It branches on
 * `display.graphType` for drawing, and on `counter.category`/`counter.name`
 * for tooltip rendering of known counter types.
 */
class TrackCounterGraphImpl extends React.PureComponent<Props, State> {
  override state = {
    hoveredCounter: null,
    mouseX: 0,
    mouseY: 0,
  };

  _co2: InstanceType<typeof co2> | null = null;

  _onMouseLeave = () => {
    // This persistTooltips property is part of the web console API. It helps
    // in being able to inspect and debug tooltips.
    if (window.persistTooltips) {
      return;
    }

    this.setState({ hoveredCounter: null });
  };

  _onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    const { pageX: mouseX, pageY: mouseY } = event;
    // Get the offset from here, and apply it to the time lookup.
    const { left } = event.currentTarget.getBoundingClientRect();
    const {
      width,
      rangeStart,
      rangeEnd,
      counter,
      interval,
      counterSampleRange,
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const timeAtMouse = rangeStart + ((mouseX - left) / width) * rangeLength;

    if (counter.samples.length === 0) {
      throw new Error('No sample group found for counter');
    }
    const { samples } = counter;

    if (
      timeAtMouse < samples.time[0] ||
      timeAtMouse > samples.time[samples.length - 1] + interval
    ) {
      // We are outside the range of the samples, do not display hover information.
      this.setState({ hoveredCounter: null });
    } else {
      // When the mouse pointer hovers between two points, select the point that's closer.
      let hoveredCounter;
      const [sampleStart, sampleEnd] = counterSampleRange;
      const bisectionCounter = bisectionRight(
        samples.time,
        timeAtMouse,
        sampleStart,
        sampleEnd
      );
      if (bisectionCounter > 0 && bisectionCounter < samples.time.length) {
        const leftDistance = timeAtMouse - samples.time[bisectionCounter - 1];
        const rightDistance = samples.time[bisectionCounter] - timeAtMouse;
        if (leftDistance < rightDistance) {
          // Left point is closer
          hoveredCounter = bisectionCounter - 1;
        } else {
          // Right point is closer
          hoveredCounter = bisectionCounter;
        }

        // For rate-based graphs with decimation, find the sample with the
        // highest value at the same pixel position.
        if (this.props.counter.display.graphType === 'line-rate') {
          const mouseAtTime = (t: number) =>
            Math.round(((t - rangeStart) / rangeLength) * width + left);
          for (
            let currentIndex = hoveredCounter - 1;
            mouseAtTime(samples.time[currentIndex]) === mouseX &&
            currentIndex > 0;
            --currentIndex
          ) {
            if (samples.count[currentIndex] > samples.count[hoveredCounter]) {
              hoveredCounter = currentIndex;
            }
          }
          for (
            let currentIndex = hoveredCounter + 1;
            mouseAtTime(samples.time[currentIndex]) === mouseX &&
            currentIndex < samples.time.length;
            ++currentIndex
          ) {
            if (samples.count[currentIndex] > samples.count[hoveredCounter]) {
              hoveredCounter = currentIndex;
            }
          }
        }
      } else {
        hoveredCounter = bisectionCounter;
      }

      if (hoveredCounter === samples.length) {
        // When hovering the last sample, it's possible the mouse is past the time.
        // In this case, hover over the last sample. This happens because of the
        // ` + interval` line in the `if` condition above.
        hoveredCounter = samples.time.length - 1;
      }

      this.setState({
        mouseX,
        mouseY,
        hoveredCounter,
      });
    }
  };

  _formatDataTransferValue(bytes: number, l10nId: string) {
    if (!this._co2) {
      this._co2 = new co2({ model: 'swd' });
    }
    // By default, when estimating emissions per byte, co2.js takes into account
    // emissions for the user device, the data center and the network.
    // Because we already have power tracks showing the power use and estimated
    // emissions of the device, set the 'device' grid intensity to 0 to avoid
    // double counting.
    const co2eq = this._co2.perByteTrace(bytes, false, {
      gridIntensity: { device: 0 },
    });
    const carbonValue = formatNumber(
      typeof co2eq.co2 === 'number' ? co2eq.co2 : co2eq.co2.total
    );
    const value = formatBytes(bytes);
    return (
      <Localized
        id={l10nId}
        vars={{ value, carbonValue }}
        attrs={{ label: true }}
      >
        <TooltipDetail label="">{value}</TooltipDetail>
      </Localized>
    );
  }

  _renderTooltip(counterIndex: number): React.ReactNode {
    const {
      accumulatedSamples,
      counter,
      rangeStart,
      rangeEnd,
      interval,
      maxCounterSampleCountPerMs,
      previewSelection,
    } = this.props;
    const { display } = counter;
    const { mouseX, mouseY } = this.state;
    const { samples } = counter;

    if (samples.length === 0) {
      throw new Error('No sample found for counter');
    }

    const sampleTime = samples.time[counterIndex];
    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the tooltip if it will be rendered outside the timeline.
      // This could happen when a sample time is outside the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    const { category, name } = counter;

    // Power tooltip — delegate to the dedicated component.
    if (category === 'power') {
      return (
        <Tooltip mouseX={mouseX} mouseY={mouseY}>
          <TooltipTrackPower
            counter={counter}
            counterSampleIndex={counterIndex}
          />
        </Tooltip>
      );
    }

    // Process CPU tooltip.
    if (category === 'CPU' && name === 'processCPU') {
      const cpuUsage = samples.count[counterIndex];
      const sampleTimeDeltaInMs =
        counterIndex === 0
          ? interval
          : samples.time[counterIndex] - samples.time[counterIndex - 1];
      const cpuRatio =
        cpuUsage / sampleTimeDeltaInMs / maxCounterSampleCountPerMs;
      return (
        <Tooltip mouseX={mouseX} mouseY={mouseY}>
          <div className="timelineTrackCounterTooltip">
            <div className="timelineTrackCounterTooltipLine">
              CPU:{' '}
              <span className="timelineTrackCounterTooltipNumber">
                {formatPercent(cpuRatio)}
              </span>
            </div>
          </div>
        </Tooltip>
      );
    }

    // Bandwidth tooltip — bytes with rate, CO2, and accumulated total.
    if (category === 'Bandwidth') {
      const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
      const bytes = accumulatedCounts[counterIndex] - minCount;
      const operations =
        samples.number !== undefined ? samples.number[counterIndex] : null;

      const sampleTimeDeltaInMs =
        counterIndex === 0
          ? interval
          : samples.time[counterIndex] - samples.time[counterIndex - 1];
      const unitGraphCount = samples.count[counterIndex] / sampleTimeDeltaInMs;

      let rangeTotal = 0;
      if (previewSelection) {
        const [beginIndex, endIndex] = getSampleIndexRangeForSelection(
          samples,
          previewSelection.selectionStart,
          previewSelection.selectionEnd
        );

        for (
          let counterSampleIndex = beginIndex;
          counterSampleIndex < endIndex;
          counterSampleIndex++
        ) {
          rangeTotal += samples.count[counterSampleIndex];
        }
      }

      let ops;
      if (operations !== null) {
        ops = formatNumber(operations, 2, 0);
      }

      return (
        <Tooltip mouseX={mouseX} mouseY={mouseY}>
          <div className="timelineTrackCounterTooltip">
            <TooltipDetails>
              {this._formatDataTransferValue(
                unitGraphCount * 1000 /* ms -> s */,
                'TrackBandwidthGraph--speed'
              )}
              {operations !== null ? (
                <Localized
                  id="TrackBandwidthGraph--read-write-operations-since-the-previous-sample"
                  vars={{ value: ops || '' }}
                  attrs={{ label: true }}
                >
                  <TooltipDetail label="">{ops}</TooltipDetail>
                </Localized>
              ) : null}
              <TooltipDetailSeparator />
              {this._formatDataTransferValue(
                bytes,
                'TrackBandwidthGraph--cumulative-bandwidth-at-this-time'
              )}
              {this._formatDataTransferValue(
                countRange,
                'TrackBandwidthGraph--total-bandwidth-in-graph'
              )}
              {previewSelection
                ? this._formatDataTransferValue(
                    rangeTotal,
                    'TrackBandwidthGraph--total-bandwidth-in-range'
                  )
                : null}
            </TooltipDetails>
          </div>
        </Tooltip>
      );
    }

    // Memory tooltip — accumulated bytes with operations count.
    if (category === 'Memory') {
      const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
      const bytes = accumulatedCounts[counterIndex] - minCount;
      const operations =
        samples.number !== undefined ? samples.number[counterIndex] : null;
      return (
        <Tooltip mouseX={mouseX} mouseY={mouseY}>
          <div className="timelineTrackCounterTooltip">
            <div className="timelineTrackCounterTooltipLine">
              <span className="timelineTrackCounterTooltipNumber">
                {formatBytes(bytes)}
              </span>
              <Localized id="TrackMemoryGraph--relative-memory-at-this-time">
                relative memory at this time
              </Localized>
            </div>

            <div className="timelineTrackCounterTooltipLine">
              <span className="timelineTrackCounterTooltipNumber">
                {formatBytes(countRange)}
              </span>
              <Localized id="TrackMemoryGraph--memory-range-in-graph">
                memory range in graph
              </Localized>
            </div>
            {operations !== null ? (
              <div className="timelineTrackCounterTooltipLine">
                <span className="timelineTrackCounterTooltipNumber">
                  {formatNumber(operations, 2, 0)}
                </span>
                <Localized id="TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample">
                  allocations and deallocations since the previous sample
                </Localized>
              </div>
            ) : null}
          </div>
        </Tooltip>
      );
    }

    // Generic tooltip for unknown counter types - format the value based on
    // the counter's unit.
    const value = samples.count[counterIndex];
    let formattedValue;
    if (display.unit === 'bytes') {
      formattedValue = formatBytes(value);
    } else if (display.unit === 'percent') {
      formattedValue = formatPercent(value);
    } else if (display.unit) {
      // Bypasses i18n but this is hit only for unknown counters.
      formattedValue = `${formatNumber(value)} ${display.unit}`;
    } else {
      formattedValue = formatNumber(value);
    }
    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <div className="timelineTrackCounterTooltip">
          <div className="timelineTrackCounterTooltipLine">
            <span className="timelineTrackCounterTooltipNumber">
              {formattedValue}
            </span>
            {display.label || name}
          </div>
        </div>
      </Tooltip>
    );
  }

  /**
   * Create a div that is a dot on top of the graph representing the current
   * height of the graph.
   */
  _renderDot(counterIndex: number): React.ReactNode {
    const {
      counter,
      rangeStart,
      rangeEnd,
      graphHeight,
      width,
      lineWidth,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
      interval,
    } = this.props;

    const { samples, display } = counter;
    if (samples.length === 0) {
      throw new Error('No sample found for counter');
    }
    const rangeLength = rangeEnd - rangeStart;
    const sampleTime = samples.time[counterIndex];

    if (sampleTime < rangeStart || sampleTime > rangeEnd) {
      // Do not draw the dot if it will be rendered outside the timeline.
      // This could happen when a sample time is outside the time range.
      // While range filtering the counters, we add the sample before start and
      // after end, so charts will not be cut off at the edges.
      return null;
    }

    const left = (width * (sampleTime - rangeStart)) / rangeLength;
    const innerTrackHeight = graphHeight - lineWidth / 2;
    let top;

    switch (display.graphType) {
      case 'line-accumulated': {
        const { minCount, countRange, accumulatedCounts } = accumulatedSamples;
        const unitSampleCount =
          (accumulatedCounts[counterIndex] - minCount) / countRange;
        top =
          innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;
        break;
      }
      case 'line-rate': {
        const sampleTimeDeltaInMs =
          counterIndex === 0
            ? interval
            : samples.time[counterIndex] - samples.time[counterIndex - 1];
        const unitSampleCount =
          samples.count[counterIndex] /
          sampleTimeDeltaInMs /
          maxCounterSampleCountPerMs;
        top =
          innerTrackHeight - unitSampleCount * innerTrackHeight + lineWidth / 2;
        break;
      }
      default:
        throw assertExhaustiveCheck(display.graphType);
    }

    return (
      <div
        style={{
          left,
          top,
          backgroundColor: getDotColor(display.color),
        }}
        className="timelineTrackCounterGraphDot"
      />
    );
  }

  override render() {
    const { hoveredCounter } = this.state;
    const {
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      unfilteredSamplesRange,
      counter,
      counterSampleRange,
      graphHeight,
      width,
      lineWidth,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
    } = this.props;

    return (
      <div
        className="timelineTrackCounterGraph"
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <TrackCounterCanvas
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          counter={counter}
          counterSampleRange={counterSampleRange}
          height={graphHeight}
          width={width}
          lineWidth={lineWidth}
          interval={interval}
          accumulatedSamples={accumulatedSamples}
          maxCounterSampleCountPerMs={maxCounterSampleCountPerMs}
        />
        {hoveredCounter === null ? null : (
          <>
            {this._renderDot(hoveredCounter)}
            {this._renderTooltip(hoveredCounter)}
          </>
        )}
        <EmptyThreadIndicator
          thread={filteredThread}
          interval={interval}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          unfilteredSamplesRange={unfilteredSamplesRange}
        />
      </div>
    );
  }
}

export const TrackCounterGraph = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state, ownProps) => {
    const { counterIndex } = ownProps;
    const counterSelectors = getCounterSelectors(counterIndex);
    const counter = counterSelectors.getCounter(state);
    const { start, end } = getCommittedRange(state);
    const counterSampleRange =
      counterSelectors.getCommittedRangeCounterSampleRange(state);
    const selectors = getThreadSelectors(counter.mainThreadIndex);
    return {
      counter,
      threadIndex: counter.mainThreadIndex,
      accumulatedSamples: counterSelectors.getAccumulateCounterSamples(state),
      maxCounterSampleCountPerMs:
        counterSelectors.getMaxRangeCounterSampleCountPerMs(state),
      rangeStart: start,
      rangeEnd: end,
      counterSampleRange,
      interval: getProfileInterval(state),
      filteredThread: selectors.getFilteredThread(state),
      unfilteredSamplesRange: selectors.unfilteredSamplesRange(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  component: withSize(TrackCounterGraphImpl),
});
