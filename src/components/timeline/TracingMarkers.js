/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';
import { withSize } from '../shared/WithSize';
import { viewTooltip, dismissTooltip } from '../../actions/app';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import {
  styles,
  overlayFills,
} from '../../profile-logic/interval-marker-styles';
import explicitConnect from '../../utils/connect';
import {
  selectorsForThread,
  getPreviewSelection,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import './TracingMarkers.css';

import type { Milliseconds, CssPixels } from '../../types/units';
import type {
  TracingMarker,
  IndexIntoTracingMarkers,
} from '../../types/profile-derived';
import type { SizeProps } from '../shared/WithSize';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { ThreadIndex } from '../../types/profile';

type MarkerState = 'PRESSED' | 'HOVERED' | 'NONE';

/**
 * The TimelineTracingMarkers component is built up of several nested components,
 * and they are all collected in this file. In pseudo-code, they take
 * the following forms:
 *
 * export const TimelineTracingMarkersJank = (
 *  <Connect markers={JankMarkers}>
 *    <WithSize>
 *      <TimelineTracingMarkers />
 *    </WithSize>
 *  </Connect>
 * );
 *
 * export const TimelineTracingMarkersOverview = (
 *   <Connect markers={AllMarkers}>
 *     <WithSize>
 *       <TimelineTracingMarkers />
 *     </WithSize>
 *   </Connect>
 * );
 */

export type OwnProps = {|
  +className: string,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +threadIndex: ThreadIndex,
  +onSelect: any,
  ...SizeProps,
|};

export type StateProps = {|
  +tracingMarkers: TracingMarker[],
  +isSelected: boolean,
  +styles: any,
  +overlayFills: {
    +HOVERED: string,
    +PRESSED: string,
  },
|};

type DispatchProps = {|
  viewTooltip: typeof viewTooltip,
  dismissTooltip: typeof dismissTooltip,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {
  hoveredMarkerIndex: IndexIntoTracingMarkers | null,
  mouseDownIndex: IndexIntoTracingMarkers | null,
  mouseX: CssPixels,
  mouseY: CssPixels,
};

class TimelineTracingMarkersImplementation extends React.PureComponent<
  Props,
  State
> {
  _canvas: HTMLCanvasElement | null = null;
  _requestedAnimationFrame: boolean = false;
  state = {
    hoveredMarkerIndex: null,
    mouseDownIndex: null,
    mouseX: 0,
    mouseY: 0,
  };

  _takeCanvasRef = (c: HTMLCanvasElement | null) => {
    this._canvas = c;
  };

  _scheduleDraw() {
    window.requestAnimationFrame(() => {
      const c = this._canvas;
      if (c) {
        timeCode('IntervalMarkerTimeline render', () => {
          this.drawCanvas(c);
        });
      }
    });
  }

  _hitTest(e): IndexIntoTracingMarkers | null {
    const c = this._canvas;
    if (c === null) {
      return null;
    }

    const r = c.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, tracingMarkers, styles } = this.props;
    const x = e.pageX - r.left;
    const y = e.pageY - r.top;
    const time = rangeStart + x / width * (rangeEnd - rangeStart);

    // Markers are drawn in array order; the one drawn last is on top. So if
    // there are multiple markers under the mouse, we want to find the one
    // with the highest array index. So we walk the list of tracingMarkers
    // from high index to low index, which is front to back in z-order.
    for (let i = tracingMarkers.length - 1; i >= 0; i--) {
      const { start, dur, name } = tracingMarkers[i];
      if (time < start || time >= start + dur) {
        continue;
      }
      const style = name in styles ? styles[name] : styles.default;
      if (y >= style.top && y < style.top + style.height) {
        return i;
      }
    }
    return null;
  }

  _onMouseMove = (event: SyntheticMouseEvent<>) => {
    const { threadIndex, viewTooltip, dismissTooltip } = this.props;
    const hoveredMarkerIndex = this._hitTest(event);
    if (hoveredMarkerIndex !== null) {
      viewTooltip(event.pageX, event.pageY, {
        type: 'tracing-marker',
        threadIndex,
        tracingMarkerIndex: hoveredMarkerIndex,
      });
    } else if (this.state.hoveredMarkerIndex !== null) {
      dismissTooltip();
    }
  };

  _onMouseDown = e => {
    const mouseDownIndex = this._hitTest(e);
    this.setState({ mouseDownIndex });
    if (mouseDownIndex !== null) {
      if (e.target.setCapture) {
        e.target.setCapture();
      }
      e.stopPropagation();
    }
  };

  _onMouseUp = e => {
    const { mouseDownIndex } = this.state;
    if (mouseDownIndex !== null) {
      const mouseUpIndex = this._hitTest(e);
      if (
        mouseDownIndex === mouseUpIndex &&
        mouseUpIndex !==
          null /* extra null check because flow doesn't realize it's unnecessary */
      ) {
        const { onSelect, threadIndex, tracingMarkers } = this.props;
        const { start, dur } = tracingMarkers[mouseUpIndex];
        onSelect(threadIndex, start, start + dur);
      }
      this.setState({
        hoveredMarkerIndex: mouseUpIndex,
        mouseDownIndex: null,
      });
    }
  };

  _onMouseOut = () => {
    this.setState({
      hoveredMarkerIndex: null,
    });
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      prevProps !== this.props ||
      prevState.hoveredMarkerIndex !== this.state.hoveredMarkerIndex
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    // TODO - Reviewers stop me.
    const {
      className,
      isSelected,
      // threadIndex,
      // tracingMarkers
    } = this.props;

    // const { mouseDownIndex, hoveredMarkerIndex, mouseX, mouseY } = this.state;
    // const shouldShowTooltip = !mouseDownIndex;

    return (
      <div className={classNames(className, isSelected ? 'selected' : null)}>
        <canvas
          className="timelineTracingMarkersCanvas"
          ref={this._takeCanvasRef}
          onMouseDown={this._onMouseDown}
          onMouseMove={this._onMouseMove}
          onMouseUp={this._onMouseUp}
          onMouseOut={this._onMouseOut}
        />
        {/* {shouldShowTooltip && hoveredMarkerIndex !== null ? (
          <Tooltip
            mouseX={mouseX}
            mouseY={mouseY}
            tooltipKey={hoveredMarkerIndex}
          >
            <MarkerTooltipContents
              marker={tracingMarkers[hoveredMarkerIndex]}
              threadIndex={threadIndex}
            />
          </Tooltip>
        ) : null} */}
      </div>
    );
  }

  _drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: CssPixels,
    y: CssPixels,
    width: CssPixels,
    height: CssPixels,
    cornerSize: CssPixels
  ) {
    // Cut out c x c -sized squares in the corners.
    const c = Math.min(width / 2, Math.min(height / 2, cornerSize));
    const bottom = y + height;
    ctx.fillRect(x + c, y, width - 2 * c, c);
    ctx.fillRect(x, y + c, width, height - 2 * c);
    ctx.fillRect(x + c, bottom - c, width - 2 * c, c);
  }

  drawCanvas(c: HTMLCanvasElement) {
    const {
      rangeStart,
      rangeEnd,
      width,
      tracingMarkers,
      styles,
      overlayFills,
    } = this.props;

    const devicePixelRatio = c.ownerDocument
      ? c.ownerDocument.defaultView.devicePixelRatio
      : 1;
    const height = c.getBoundingClientRect().height;
    const pixelWidth = Math.round(width * devicePixelRatio);
    const pixelHeight = Math.round(height * devicePixelRatio);

    if (c.width !== pixelWidth || c.height !== pixelHeight) {
      c.width = pixelWidth;
      c.height = pixelHeight;
    }
    const ctx = c.getContext('2d');
    if (ctx === null || ctx === undefined) {
      return;
    }

    ctx.clearRect(0, 0, pixelWidth, pixelHeight);
    ctx.scale(devicePixelRatio, devicePixelRatio);

    tracingMarkers.forEach(marker => {
      const { start, dur, name } = marker;
      const pos = (start - rangeStart) / (rangeEnd - rangeStart) * width;
      const itemWidth = Number.isFinite(dur)
        ? dur / (rangeEnd - rangeStart) * width
        : Number.MAX_SAFE_INTEGER;
      const style = name in styles ? styles[name] : styles.default;
      ctx.fillStyle = style.background;
      if (style.squareCorners) {
        ctx.fillRect(pos, style.top, itemWidth, style.height);
      } else {
        this._drawRoundedRect(
          ctx,
          pos,
          style.top,
          itemWidth,
          style.height,
          1 / devicePixelRatio
        );
      }
      if (style.borderLeft !== null) {
        ctx.fillStyle = style.borderLeft;
        ctx.fillRect(pos, style.top, 1, style.height);
      }
      if (style.borderRight !== null) {
        ctx.fillStyle = style.borderRight;
        ctx.fillRect(pos + itemWidth - 1, style.top, 1, style.height);
      }
      const markerState = this._getMarkerState(marker);
      if (markerState === 'HOVERED' || markerState === 'PRESSED') {
        ctx.fillStyle = overlayFills[markerState];
        if (style.squareCorners) {
          ctx.fillRect(pos, style.top, itemWidth, style.height);
        } else {
          this._drawRoundedRect(
            ctx,
            pos,
            style.top,
            itemWidth,
            style.height,
            1 / devicePixelRatio
          );
        }
      }
    });
    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
  }

  _getMarkerState(marker: TracingMarker): MarkerState {
    const { hoveredMarkerIndex, mouseDownIndex } = this.state;
    if (mouseDownIndex !== null) {
      if (marker === mouseDownIndex && marker === hoveredMarkerIndex) {
        return 'PRESSED';
      }
      return 'NONE';
    }
    if (marker === hoveredMarkerIndex) {
      return 'HOVERED';
    }
    return 'NONE';
  }
}

/**
 * Combine the base implementation of the TimelineTracingMarkers with the
 * WithSize component.
 */
export const TimelineTracingMarkers = withSize(
  TimelineTracingMarkersImplementation
);

/**
 * Create a special connected component for Jank instances.
 */
const jankOptions: ExplicitConnectOptions<OwnProps, StateProps, {||}> = {
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = selectorsForThread(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);

    return {
      tracingMarkers: selectors.getJankInstances(state),
      isSelected: threadIndex === selectedThread,
      styles: styles,
      overlayFills: overlayFills,
    };
  },
  component: TimelineTracingMarkers,
};

export const TimelineTracingMarkersJank = explicitConnect(jankOptions);

/**
 * Create a connected component for all tracing markers.
 */

const tracingOptions: ExplicitConnectOptions<
  OwnProps,
  StateProps,
  DispatchProps
> = {
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = selectorsForThread(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const tracingMarkers = selectors.getCommittedRangeFilteredTracingMarkersForHeader(
      state
    );
    return {
      tracingMarkers,
      isSelected: threadIndex === selectedThread,
      styles,
      overlayFills,
    };
  },
  mapDispatchToProps: { viewTooltip, dismissTooltip },
  component: TimelineTracingMarkers,
};

export const TimelineTracingMarkersOverview = explicitConnect(tracingOptions);
