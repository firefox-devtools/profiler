/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import classNames from 'classnames';

import { ActivityGraphCanvas } from './ActivityGraphCanvas';
import {
  Tooltip,
  MOUSE_OFFSET,
} from 'firefox-profiler/components/tooltip/Tooltip';
import { SampleTooltipContents } from 'firefox-profiler/components/shared/SampleTooltipContents';
import { withSize } from 'firefox-profiler/components/shared/WithSize';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';

import './ActivityGraph.css';

import type {
  Thread,
  CategoryList,
  ImplementationFilter,
  IndexIntoSamplesTable,
  SelectedState,
  Milliseconds,
  CssPixels,
  TimelineType,
} from 'firefox-profiler/types';
import type {
  ActivityFillGraphQuerier,
  CpuRatioInTimeRange,
} from './ActivityGraphFills';

export type Props = {|
  +className: string,
  +trackName: string,
  +fullThread: Thread,
  +rangeFilteredThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +sampleIndexOffset: number,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable | null
  ) => void,
  +categories: CategoryList,
  +samplesSelectedStates: null | SelectedState[],
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +enableCPUUsage: boolean,
  +implementationFilter: ImplementationFilter,
  +timelineType: TimelineType,
  +zeroAt: Milliseconds,
  +profileTimelineUnit: string,
  ...SizeProps,
|};

export type HoveredPixelState = {|
  +sample: IndexIntoSamplesTable | null,
  +cpuRatioInTimeRange: CpuRatioInTimeRange | null,
|};

type State = {
  hoveredPixelState: null | HoveredPixelState,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class ThreadActivityGraphImpl extends React.PureComponent<Props, State> {
  _fillsQuerier: null | ActivityFillGraphQuerier = null;

  state = {
    hoveredPixelState: null,
    mouseX: 0,
    mouseY: 0,
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

  // This setter function gets the value of fillsQuerier from
  // the passFillsQuerier prop of ActivityGraphCanvas and assign it to this._fillsQuerier
  _setFillsQuerier = (fillsQuerier: ActivityFillGraphQuerier) => {
    this._fillsQuerier = fillsQuerier;
  };

  _getSampleAtMouseEvent(
    event: SyntheticMouseEvent<HTMLCanvasElement>
  ): null | HoveredPixelState {
    const { width } = this.props;
    // Create local variables so that Flow can refine the following to be non-null.
    const fillsQuerier = this._fillsQuerier;
    const canvas = event.currentTarget;
    if (!canvas || !fillsQuerier) {
      return null;
    }
    // Re-measure the canvas and get the coordinates and time for the click.
    const { rangeStart, rangeEnd } = this.props;
    const x = event.nativeEvent.offsetX;
    const y = event.nativeEvent.offsetY;
    const time = rangeStart + (x / width) * (rangeEnd - rangeStart);

    return fillsQuerier.getSampleAndCpuRatioAtClick(x, y, time);
  }

  _onClick = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const sampleState = this._getSampleAtMouseEvent(event);
    this.props.onSampleClick(event, sampleState ? sampleState.sample : null);
  };

  render() {
    const {
      fullThread,
      rangeFilteredThread,
      categories,
      trackName,
      interval,
      rangeStart,
      rangeEnd,
      sampleIndexOffset,
      samplesSelectedStates,
      treeOrderSampleComparator,
      enableCPUUsage,
      implementationFilter,
      width,
      height,
      timelineType,
      zeroAt,
      profileTimelineUnit,
    } = this.props;
    const { hoveredPixelState, mouseX, mouseY } = this.state;
    return (
      <div
        className={this.props.className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
      >
        <ActivityGraphCanvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadActivityGraphCanvas'
          )}
          trackName={trackName}
          fullThread={fullThread}
          rangeFilteredThread={rangeFilteredThread}
          interval={interval}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          sampleIndexOffset={sampleIndexOffset}
          samplesSelectedStates={samplesSelectedStates}
          treeOrderSampleComparator={treeOrderSampleComparator}
          categories={categories}
          passFillsQuerier={this._setFillsQuerier}
          onClick={this._onClick}
          enableCPUUsage={enableCPUUsage}
          width={width}
          height={height}
        />
        {hoveredPixelState === null ? null : (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <SampleTooltipContents
              sampleIndex={hoveredPixelState.sample}
              cpuRatioInTimeRange={
                timelineType === 'cpu-category'
                  ? hoveredPixelState.cpuRatioInTimeRange
                  : null
              }
              rangeFilteredThread={rangeFilteredThread}
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

export const ThreadActivityGraph = withSize<Props>(ThreadActivityGraphImpl);
