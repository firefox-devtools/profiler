/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  getCommittedRange,
  getZeroAt,
  getPageList,
} from '../../selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { VerticalIndicators } from './VerticalIndicators';
import {
  TRACK_NETWORK_ROW_HEIGHT,
  TRACK_NETWORK_ROW_REPEAT,
  TRACK_NETWORK_HEIGHT,
} from 'firefox-profiler/app-logic/constants';

import type {
  ThreadIndex,
  PageList,
  Marker,
  MarkerIndex,
  MarkerTiming,
  Milliseconds,
} from 'firefox-profiler/types';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './TrackNetwork.css';

type OwnProps = {|
  +threadIndex: ThreadIndex,
|};

type StateProps = {|
  +pages: PageList | null,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +zeroAt: Milliseconds,
  +getMarker: MarkerIndex => Marker,
  +networkTiming: MarkerTiming[],
  +verticalMarkerIndexes: MarkerIndex[],
|};
type DispatchProps = {||};
type Props = {|
  ...ConnectedProps<OwnProps, StateProps, DispatchProps>,
  ...SizeProps,
|};
type State = void;

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
    } = this.props;

    const rangeLength = rangeEnd - rangeStart;

    const devicePixelRatio = window.devicePixelRatio;
    const rowHeight = TRACK_NETWORK_ROW_HEIGHT * devicePixelRatio;
    canvas.width = Math.round(containerWidth * devicePixelRatio);
    canvas.height = Math.round(TRACK_NETWORK_HEIGHT * devicePixelRatio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(0, 127, 255, 0.3)';

    ctx.lineCap = 'round';
    ctx.lineWidth = rowHeight * 0.75;
    for (let rowIndex = 0; rowIndex < networkTiming.length; rowIndex++) {
      const timing = networkTiming[rowIndex];
      for (let timingIndex = 0; timingIndex < timing.length; timingIndex++) {
        const start =
          (canvas.width / rangeLength) *
          (timing.start[timingIndex] - rangeStart);
        const end =
          (canvas.width / rangeLength) * (timing.end[timingIndex] - rangeStart);
        const y =
          (rowIndex % TRACK_NETWORK_ROW_REPEAT) * rowHeight + rowHeight * 0.5;
        ctx.beginPath();
        ctx.moveTo(start, y);
        ctx.lineTo(end, y);
        ctx.stroke();
      }
    }
  }

  render() {
    const {
      pages,
      rangeStart,
      rangeEnd,
      getMarker,
      verticalMarkerIndexes,
      zeroAt,
    } = this.props;
    this._scheduleDraw();

    return (
      <div
        className="timelineTrackNetwork"
        style={{
          height: TRACK_NETWORK_HEIGHT,
        }}
      >
        <canvas
          className="timelineTrackNetworkCanvas"
          ref={this._takeCanvasRef}
        />
        <VerticalIndicators
          verticalMarkerIndexes={verticalMarkerIndexes}
          getMarker={getMarker}
          pages={pages}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          zeroAt={zeroAt}
        />
      </div>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, ownProps) => {
    const { threadIndex } = ownProps;
    const selectors = getThreadSelectors(threadIndex);
    const { start, end } = getCommittedRange(state);
    const networkTiming = selectors.getNetworkTrackTiming(state);
    return {
      getMarker: selectors.getMarkerGetter(state),
      pages: getPageList(state),
      networkTiming: networkTiming,
      rangeStart: start,
      rangeEnd: end,
      zeroAt: getZeroAt(state),
      verticalMarkerIndexes: selectors.getTimelineVerticalMarkerIndexes(state),
    };
  },
  component: withSize<Props>(Network),
});
