/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
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
  +selectedCallNodeIndex: IndexIntoCallNodeTable,
  +className: string,
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

    // Draw all of the samples
    for (let i = 0; i < sampleCallNodes.length; i++) {
      const sampleTime = thread.samples.time[i];
      if (
        sampleTime + drawnIntervalWidth / xPixelsPerMs < range[0] ||
        sampleTime > range[1]
      ) {
        continue;
      }
      const callNodeIndex = sampleCallNodes[i];
      if (callNodeIndex === null) {
        continue;
      }
      const isHighlighted = hasSelectedCallNodePrefix(callNodeIndex);
      const sampleHeight = callNodeTable.depth[callNodeIndex] * yPixelsPerDepth;
      const startY = canvas.height - sampleHeight;
      // const responsiveness = thread.samples.responsiveness[i];
      // const jankSeverity = Math.min(1, responsiveness / 100);
      ctx.fillStyle = isHighlighted ? BLUE_70 : BLUE_40;
      ctx.fillRect(
        (sampleTime - range[0]) * xPixelsPerMs,
        startY,
        drawnIntervalWidth,
        sampleHeight
      );
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

ThreadStackGraph.propTypes = {
  thread: PropTypes.shape({
    samples: PropTypes.object.isRequired,
  }).isRequired,
  interval: PropTypes.number.isRequired,
  rangeStart: PropTypes.number.isRequired,
  rangeEnd: PropTypes.number.isRequired,
  callNodeInfo: PropTypes.shape({
    callNodeTable: PropTypes.object.isRequired,
    stackIndexToCallNodeIndex: PropTypes.any.isRequired,
  }).isRequired,
  selectedCallNodeIndex: PropTypes.number,
  className: PropTypes.string,
  onStackClick: PropTypes.func.isRequired,
};

export default ThreadStackGraph;
