/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import clamp from 'clamp';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getCommittedRange,
} from '../../reducers/profile-view';

import type { ThreadIndex } from '../../types/profile';
import type {} from '../../types/markers';
import type { Milliseconds } from '../../types/units';
import type { SizeProps } from '../shared/WithSize';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './TrackNetwork.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  ...SizeProps,
|};

type StateProps = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +networkMarkers: *,
  +networkTiming: *,
  +containerHeight: number,
|};
type DispatchProps = {||};
type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = void;

export const ROW_HEIGHT = 5;
export const ROW_REPEAT = 7;
export const MIN_ROW_REPEAT = 5;

class Network extends PureComponent<Props, State> {
  _canvas: null | HTMLCanvasElement = null;
  _requestedAnimationFrame: boolean = false;

  _resizeListener = () => {
    this.forceUpdate();
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

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

  componentDidMount() {
    window.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(canvas: HTMLCanvasElement) {
    const {
      rangeStart,
      rangeEnd,
      networkTiming,
      width: containerWidth,
      containerHeight,
    } = this.props;

    const rangeLength = rangeEnd - rangeStart;

    const devicePixelRatio = window.devicePixelRatio;
    const rowHeight = ROW_HEIGHT * devicePixelRatio;
    canvas.width = Math.round(containerWidth * devicePixelRatio);
    canvas.height = Math.round(containerHeight * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 127, 255, 0.3)';

    ctx.lineCap = 'round';
    ctx.lineWidth = rowHeight * 0.75;
    for (let rowIndex = 0; rowIndex < networkTiming.length; rowIndex++) {
      const timing = networkTiming[rowIndex];
      for (let timingIndex = 0; timingIndex < timing.length; timingIndex++) {
        const start =
          canvas.width / rangeLength * (timing.start[timingIndex] - rangeStart);
        const end =
          canvas.width / rangeLength * (timing.end[timingIndex] - rangeStart);
        const y = (rowIndex % ROW_REPEAT) * rowHeight + rowHeight * 0.5;
        ctx.beginPath();
        ctx.moveTo(start, y);
        ctx.lineTo(end, y);
        ctx.stroke();
      }
    }
  }

  render() {
    const { containerHeight } = this.props;
    this._scheduleDraw();

    return (
      <div
        className="timelineTrackNetwork"
        style={{
          height: containerHeight,
        }}
      >
        <canvas
          className="timelineTrackNetworkCanvas"
          ref={this._takeCanvasRef}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const selectors = selectorsForThread(threadIndex);
    const { start, end } = getCommittedRange(state);
    const networkTiming = selectors.getNetworkTrackTiming(state);
    return {
      networkMarkers: selectors.getNetworkTracingMarkers(state),
      networkTiming: networkTiming,
      rangeStart: start,
      rangeEnd: end,
      containerHeight:
        ROW_HEIGHT * clamp(networkTiming.length, MIN_ROW_REPEAT, ROW_REPEAT),
    };
  },
  component: Network,
};

export default withSize(explicitConnect(options));
