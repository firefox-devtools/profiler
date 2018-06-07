/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getDisplayRange,
} from '../../reducers/profile-view';

import type { Thread, ThreadIndex } from '../../types/profile';
import type {} from '../../types/markers';
import type { Milliseconds } from '../../types/units';
import type { SizeProps } from '../shared/WithSize';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import './Network.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
  ...SizeProps,
|};

type StateProps = {|
  +thread: Thread,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +networkMarkers: *,
  +networkTiming: *,
  +threadName: string,
  +containerHeight: number,
|};
type DispatchProps = {||};
type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
type State = void;

const ROW_HEIGHT = 5;
const ROW_REPEAT = 7;

class Network extends PureComponent<Props, State> {
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
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 127, 255, 0.2)';
    // ctx.strokeStyle = '#9400ff33';

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
    const { networkMarkers, containerHeight } = this.props;
    if (networkMarkers.length === 0) {
      return null;
    }
    this._scheduleDraw();

    return (
      <div className="headerNetwork">
        <li className="profileThreadHeaderBar">
          <div title="Network" className="profileThreadHeaderBarThreadLabel">
            <h1 className="profileThreadHeaderBarThreadName">Network</h1>
          </div>
          <div
            className="headerNetworkDetails"
            style={{
              height: containerHeight,
            }}
          >
            <canvas className="headerNetworkCanvas" ref={this._takeCanvasRef} />
          </div>
        </li>
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const selectors = selectorsForThread(threadIndex);
    const { start, end } = getDisplayRange(state);
    const networkTiming = selectors.getNetworkTiming(state);
    return {
      thread: selectors.getRangeSelectionFilteredThread(state),
      networkMarkers: selectors.getNetworkTracingMarkers(state),
      networkTiming: networkTiming,
      threadName: selectors.getFriendlyThreadName(state),
      rangeStart: start,
      rangeEnd: end,
      containerHeight: Math.min(
        ROW_REPEAT * ROW_HEIGHT,
        networkTiming.length * ROW_HEIGHT
      ),
    };
  },
  // mapDispatchToProps: {},
  component: Network,
};

export default withSize(explicitConnect(options));
