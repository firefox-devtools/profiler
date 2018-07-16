/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import bisection from 'bisection';
import { timeCode } from '../../utils/time-code';
import { getSampleCallNodes } from '../../profile-logic/profile-data';
import { BLUE_70, BLUE_40 } from 'photon-colors';

import type { Thread } from '../../types/profile';
import type { Milliseconds } from '../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';

type Props = {|
  +thread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onStackClick: (time: Milliseconds) => void,
|};

class ThreadStackGraph extends PureComponent<Props> {
  _canvas: null | HTMLCanvasElement;
  _requestedAnimationFrame: boolean;
  _resizeListener: () => void;
  _takeCanvasRef = (canvas: HTMLCanvasElement | null) =>
    (this._canvas = canvas);

  constructor(props: Props) {
    super(props);
    this._resizeListener = () => this.forceUpdate();
    this._requestedAnimationFrame = false;
    this._canvas = null;
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        const canvas = this._canvas;
        if (canvas) {
          timeCode('ThreadStackGraph render', () => {
            this.drawCanvas(canvas);
          });
        }
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
    let selectedCallNodeDepth = 0;
    if (selectedCallNodeIndex !== -1 && selectedCallNodeIndex !== null) {
      selectedCallNodeDepth = callNodeTable.depth[selectedCallNodeIndex];
    }
    function hasSelectedCallNodePrefix(callNodePrefix) {
      let callNodeIndex = callNodePrefix;
      if (callNodeIndex === null) {
        return false;
      }
      for (
        let depth = callNodeTable.depth[callNodeIndex];
        depth > selectedCallNodeDepth;
        depth--
      ) {
        callNodeIndex = callNodeTable.prefix[callNodeIndex];
      }
      return callNodeIndex === selectedCallNodeIndex;
    }

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
      if (hasSelectedCallNodePrefix(callNodeIndex)) {
        highlightedSamples.height.push(height);
        highlightedSamples.xPos.push(xPos);
      } else {
        regularSamples.height.push(height);
        regularSamples.xPos.push(xPos);
      }
      nextMinTime = sampleTime + minGapMs;
    }

    // Draw the regular samples first, and then the highlighted samples.
    // This means that we only set ctx.fillStyle twice, which saves on time
    // that's spent parsing color strings.
    ctx.fillStyle = BLUE_40;
    for (let i = 0; i < regularSamples.height.length; i++) {
      const height = regularSamples.height[i];
      const startY = canvas.height - height;
      const xPos = regularSamples.xPos[i];
      ctx.fillRect(xPos, startY, drawnIntervalWidth, height);
    }
    ctx.fillStyle = BLUE_70;
    for (let i = 0; i < highlightedSamples.height.length; i++) {
      const height = highlightedSamples.height[i];
      const startY = canvas.height - height;
      const xPos = highlightedSamples.xPos[i];
      ctx.fillRect(xPos, startY, drawnIntervalWidth, height);
    }
  }

  _onMouseUp = (e: SyntheticMouseEvent<>) => {
    const canvas = this._canvas;
    if (canvas) {
      const { rangeStart, rangeEnd } = this.props;
      const r = canvas.getBoundingClientRect();

      const x = e.pageX - r.left;
      const time = rangeStart + x / r.width * (rangeEnd - rangeStart);
      this.props.onStackClick(time);
    }
  };

  render() {
    this._scheduleDraw();
    return (
      <div className="threadStackGraph">
        <canvas
          className="threadStackGraphCanvas"
          ref={this._takeCanvasRef}
          onMouseUp={this._onMouseUp}
        />
      </div>
    );
  }
}

export default ThreadStackGraph;
