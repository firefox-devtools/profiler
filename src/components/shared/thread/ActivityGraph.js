/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';
import { ActivityGraphCanvas } from './ActivityGraphCanvas';
import classNames from 'classnames';
import {
  Tooltip,
  MOUSE_OFFSET,
} from 'firefox-profiler/components/tooltip/Tooltip';
import { SampleTooltipContents } from 'firefox-profiler/components/shared/SampleTooltipContents';

import './ActivityGraph.css';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  SelectedState,
  Milliseconds,
  CssPixels,
} from 'firefox-profiler/types';
import type {
  ActivityFillGraphQuerier,
  CpuRatioInTimeRange,
} from './ActivityGraphFills';

export type Props = {|
  +className: string,
  +trackName: string,
  +fullThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable
  ) => void,
  +categories: CategoryList,
  +samplesSelectedStates: null | SelectedState[],
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +enableCPUUsage: boolean,
  +maxThreadCPUDelta: number,
|};

export type HoveredPixelState = {|
  +sample: IndexIntoSamplesTable,
  +cpuRatioInTimeRange: CpuRatioInTimeRange | null,
|};

type State = {
  hoveredPixelState: null | HoveredPixelState,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

function _stopPropagation(e: TransitionEvent) {
  e.stopPropagation();
}

export class ThreadActivityGraph extends React.PureComponent<Props, State> {
  _resizeListener = () => this.forceUpdate();
  _fillsQuerier: null | ActivityFillGraphQuerier = null;
  _container: HTMLElement | null = null;

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

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
    const container = this._container;
    if (container !== null) {
      // Stop the propagation of transitionend so we won't fire multiple events
      // on the active tab resource track `transitionend` event.
      container.addEventListener('transitionend', _stopPropagation);
    }
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
    const container = this._container;
    if (container !== null) {
      container.removeEventListener('transitionend', _stopPropagation);
    }
  }

  _getSampleAtMouseEvent(
    event: SyntheticMouseEvent<HTMLCanvasElement>
  ): null | HoveredPixelState {
    // Create local variables so that Flow can refine the following to be non-null.
    const fillsQuerier = this._fillsQuerier;
    const canvas = event.currentTarget;
    if (!canvas || !fillsQuerier) {
      return null;
    }
    // Re-measure the canvas and get the coordinates and time for the click.
    const { rangeStart, rangeEnd } = this.props;
    const rect = canvas.getBoundingClientRect();
    const x = event.pageX - rect.left;
    const y = event.pageY - rect.top;
    const time = rangeStart + (x / rect.width) * (rangeEnd - rangeStart);

    return fillsQuerier.getSampleAndCpuRatioAtClick(x, y, time, rect);
  }

  _onMouseUp = (event: SyntheticMouseEvent<HTMLCanvasElement>) => {
    const sampleState = this._getSampleAtMouseEvent(event);
    if (sampleState !== null) {
      this.props.onSampleClick(event, sampleState.sample);
    }
  };

  _takeContainerRef = (el: HTMLElement | null) => {
    this._container = el;
  };

  render() {
    const {
      fullThread,
      categories,
      trackName,
      interval,
      rangeStart,
      rangeEnd,
      samplesSelectedStates,
      treeOrderSampleComparator,
      maxThreadCPUDelta,
      enableCPUUsage,
    } = this.props;
    const { hoveredPixelState, mouseX, mouseY } = this.state;
    return (
      <div
        className={this.props.className}
        onMouseMove={this._onMouseMove}
        onMouseLeave={this._onMouseLeave}
        ref={this._takeContainerRef}
      >
        <ActivityGraphCanvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadActivityGraphCanvas'
          )}
          trackName={trackName}
          fullThread={fullThread}
          interval={interval}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          samplesSelectedStates={samplesSelectedStates}
          treeOrderSampleComparator={treeOrderSampleComparator}
          categories={categories}
          passFillsQuerier={this._setFillsQuerier}
          onMouseUp={this._onMouseUp}
          enableCPUUsage={enableCPUUsage}
          maxThreadCPUDelta={maxThreadCPUDelta}
        />
        {hoveredPixelState === null ? null : (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <SampleTooltipContents
              sampleIndex={hoveredPixelState.sample}
              cpuRatioInTimeRange={hoveredPixelState.cpuRatioInTimeRange}
              fullThread={fullThread}
              categories={categories}
            />
          </Tooltip>
        )}
      </div>
    );
  }
}
