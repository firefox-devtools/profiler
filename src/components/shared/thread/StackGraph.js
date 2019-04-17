/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import bisection from 'bisection';
import classNames from 'classnames';
import { ensureExists } from '../../../utils/flow';
import { timeCode } from '../../../utils/time-code';
import {
  getSampleCallNodes,
  getSamplesSelectedStates,
  getSampleIndexClosestToTime,
} from '../../../profile-logic/profile-data';
import { BLUE_70, BLUE_40 } from 'photon-colors';
import './StackGraph.css';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
} from '../../../types/profile';
import type { Milliseconds } from '../../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../../types/profile-derived';

type Props = {|
  +className: string,
  +thread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +categories: CategoryList,
  +onSampleClick: (sampleIndex: IndexIntoSamplesTable) => void,
  // Decide which way the stacks grow up from the floor, or down from the ceiling.
  +stacksGrowFromCeiling?: boolean,
|};

class StackGraph extends PureComponent<Props> {
  _canvas: null | HTMLCanvasElement = null;
  _resizeListener: () => void;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) =>
    (this._canvas = canvas);
  _resizeListener = () => this.forceUpdate();

  _renderCanvas() {
    const canvas = this._canvas;
    if (canvas !== null) {
      timeCode('ThreadStackGraph render', () => {
        this.drawCanvas(canvas);
      });
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      thread,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      categories,
      stacksGrowFromCeiling,
    } = this.props;

    const devicePixelRatio = canvas.ownerDocument
      ? canvas.ownerDocument.defaultView.devicePixelRatio
      : 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * devicePixelRatio);
    canvas.height = Math.round(rect.height * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    let maxDepth = 0;
    const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
    const sampleCallNodes = getSampleCallNodes(
      thread.samples,
      stackIndexToCallNodeIndex
    );
    const samplesSelectedStates = getSamplesSelectedStates(
      callNodeTable,
      sampleCallNodes,
      selectedCallNodeIndex
    );
    for (let i = 0; i < callNodeTable.depth.length; i++) {
      if (callNodeTable.depth[i] > maxDepth) {
        maxDepth = callNodeTable.depth[i];
      }
    }
    const range = [rangeStart, rangeEnd];
    const rangeLength = range[1] - range[0];
    const xPixelsPerMs = canvas.width / rangeLength;
    const yPixelsPerDepth = canvas.height / maxDepth;
    const trueIntervalPixelWidth = interval * xPixelsPerMs;
    const multiplier = trueIntervalPixelWidth < 2.0 ? 1.2 : 1.0;
    const drawnIntervalWidth = Math.max(
      0.8,
      trueIntervalPixelWidth * multiplier
    );

    const firstDrawnSampleTime = range[0] - drawnIntervalWidth / xPixelsPerMs;
    const lastDrawnSampleTime = range[1];

    const firstDrawnSampleIndex = bisection.right(
      thread.samples.time,
      firstDrawnSampleTime
    );
    const afterLastDrawnSampleIndex = bisection.right(
      thread.samples.time,
      lastDrawnSampleTime,
      firstDrawnSampleIndex
    );

    // Do one pass over the samples array to gather the samples we want to draw.
    const regularSamples = {
      height: [],
      xPos: [],
    };
    const idleSamples = {
      height: [],
      xPos: [],
    };
    const highlightedSamples = {
      height: [],
      xPos: [],
    };
    // Enforce a minimum distance so that we don't draw more than 4 samples per
    // pixel.
    const minGapMs = 0.25 / xPixelsPerMs;
    let nextMinTime = -Infinity;
    for (let i = firstDrawnSampleIndex; i < afterLastDrawnSampleIndex; i++) {
      const sampleTime = thread.samples.time[i];
      if (sampleTime < nextMinTime) {
        continue;
      }
      const callNodeIndex = sampleCallNodes[i];
      if (callNodeIndex === null) {
        continue;
      }
      const height = callNodeTable.depth[callNodeIndex] * yPixelsPerDepth;
      const xPos = (sampleTime - range[0]) * xPixelsPerMs;
      let samplesBucket;
      if (samplesSelectedStates[i] === 'SELECTED') {
        samplesBucket = highlightedSamples;
      } else {
        const stackIndex = ensureExists(
          thread.samples.stack[i],
          'A stack must exist for this sample, since a callNodeIndex exists.'
        );
        const categoryIndex = thread.stackTable.category[stackIndex];
        const category = categories[categoryIndex];
        if (category.name === 'Idle') {
          samplesBucket = idleSamples;
        } else {
          samplesBucket = regularSamples;
        }
      }
      samplesBucket.height.push(height);
      samplesBucket.xPos.push(xPos);
      nextMinTime = sampleTime + minGapMs;
    }

    type SamplesBucket = {
      height: number[],
      xPos: number[],
    };
    function drawSamples(samplesBucket: SamplesBucket, color: string) {
      ctx.fillStyle = color;
      for (let i = 0; i < samplesBucket.height.length; i++) {
        const height = samplesBucket.height[i];
        const startY = stacksGrowFromCeiling ? 0 : canvas.height - height;
        const xPos = samplesBucket.xPos[i];
        ctx.fillRect(xPos, startY, drawnIntervalWidth, height);
      }
    }

    // Draw the samples in multiple passes, separated by color. This reduces the calls
    // to ctx.fillStyle, which saves on time that's spent parsing color strings.
    const lighterBlue = '#c5e1fe';
    drawSamples(regularSamples, BLUE_40);
    drawSamples(highlightedSamples, BLUE_70);
    drawSamples(idleSamples, lighterBlue);
  }

  _onMouseUp = (e: SyntheticMouseEvent<>) => {
    const canvas = this._canvas;
    if (canvas) {
      const { rangeStart, rangeEnd, thread, interval } = this.props;
      const r = canvas.getBoundingClientRect();

      const x = e.pageX - r.left;
      const time = rangeStart + (x / r.width) * (rangeEnd - rangeStart);

      const sampleIndex = getSampleIndexClosestToTime(
        thread.samples,
        time,
        interval
      );

      this.props.onSampleClick(sampleIndex);
    }
  };

  render() {
    this._renderCanvas();
    return (
      <div className={this.props.className}>
        <canvas
          className={classNames(
            `${this.props.className}Canvas`,
            'threadStackGraphCanvas'
          )}
          ref={this._takeCanvasRef}
          onMouseUp={this._onMouseUp}
        />
      </div>
    );
  }
}

export default StackGraph;
