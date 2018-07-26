/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import { timeCode } from '../../utils/time-code';
import { withSize } from '../shared/WithSize';
import Tooltip from '../shared/Tooltip';
import MarkerTooltipContents from '../shared/MarkerTooltipContents';
import {
  styles,
  overlayFills,
} from '../../profile-logic/interval-marker-styles';
import explicitConnect from '../../utils/connect';
import { selectorsForThread, getSelection } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import './TracingMarkers.css';

import type { Milliseconds, CssPixels } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';
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
|};

export type StateProps = {|
  +intervalMarkers: TracingMarker[],
  +isSelected: boolean,
  +styles: any,
  +overlayFills: {
    +HOVERED: string,
    +PRESSED: string,
  },
  +isModifyingSelection: boolean,
|};

type Props = ConnectedProps<SizeProps, OwnProps, StateProps>;

type State = {
  hoveredItem: TracingMarker | null,
  mouseDownItem: TracingMarker | null,
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
    hoveredItem: null,
    mouseDownItem: null,
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

  _hitTest(e): TracingMarker | null {
    const c = this._canvas;
    if (c === null) {
      return null;
    }

    const r = c.getBoundingClientRect();
    const { width, rangeStart, rangeEnd, intervalMarkers, styles } = this.props;
    const x = e.pageX - r.left;
    const y = e.pageY - r.top;
    const time = rangeStart + x / width * (rangeEnd - rangeStart);

    // Markers are drawn in array order; the one drawn last is on top. So if
    // there are multiple markers under the mouse, we want to find the one
    // with the highest array index. So we walk the list of intervalMarkers
    // from high index to low index, which is front to back in z-order.
    for (let i = intervalMarkers.length - 1; i >= 0; i--) {
      const { start, dur, name } = intervalMarkers[i];
      if (time < start || time >= start + dur) {
        continue;
      }
      const style = name in styles ? styles[name] : styles.default;
      if (y >= style.top && y < style.top + style.height) {
        return intervalMarkers[i];
      }
    }
    return null;
  }

  _onMouseMove = (event: SyntheticMouseEvent<>) => {
    const hoveredItem = this._hitTest(event);
    if (hoveredItem !== null) {
      this.setState({
        hoveredItem,
        mouseX: event.pageX,
        mouseY: event.pageY,
      });
    } else if (this.state.hoveredItem !== null) {
      this.setState({
        hoveredItem: null,
      });
    }
  };

  _onMouseDown = e => {
    const mouseDownItem = this._hitTest(e);
    this.setState({ mouseDownItem });
    if (mouseDownItem !== null) {
      if (e.target.setCapture) {
        e.target.setCapture();
      }
      e.stopPropagation();
    }
  };

  _onMouseUp = e => {
    const { mouseDownItem } = this.state;
    if (mouseDownItem !== null) {
      const mouseUpItem = this._hitTest(e);
      if (
        mouseDownItem === mouseUpItem &&
        mouseUpItem !==
          null /* extra null check because flow doesn't realize it's unnecessary */
      ) {
        const { onSelect, threadIndex } = this.props;
        onSelect(
          threadIndex,
          mouseUpItem.start,
          mouseUpItem.start + mouseUpItem.dur
        );
      }
      this.setState({
        hoveredItem: mouseUpItem,
        mouseDownItem: null,
      });
    }
  };

  _onMouseOut = () => {
    this.setState({
      hoveredItem: null,
    });
  };

  componentDidUpdate(prevProps: Props, prevState: State) {
    if (
      prevProps !== this.props ||
      prevState.hoveredItem !== this.state.hoveredItem
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    const {
      className,
      isSelected,
      isModifyingSelection,
      threadIndex,
    } = this.props;

    const { mouseDownItem, hoveredItem, mouseX, mouseY } = this.state;
    const shouldShowTooltip = !isModifyingSelection && !mouseDownItem;

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
        {shouldShowTooltip && hoveredItem ? (
          <Tooltip mouseX={mouseX} mouseY={mouseY}>
            <MarkerTooltipContents
              marker={hoveredItem}
              threadIndex={threadIndex}
            />
          </Tooltip>
        ) : null}
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
      intervalMarkers,
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

    intervalMarkers.forEach(marker => {
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

  _getMarkerState(marker): MarkerState {
    const { hoveredItem, mouseDownItem } = this.state;
    if (mouseDownItem !== null) {
      if (marker === mouseDownItem && marker === hoveredItem) {
        return 'PRESSED';
      }
      return 'NONE';
    }
    if (marker === hoveredItem) {
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
      intervalMarkers: selectors.getJankInstances(state),
      isSelected: threadIndex === selectedThread,
      styles: styles,
      overlayFills: overlayFills,
      isModifyingSelection: getSelection(state).isModifying,
    };
  },
  component: TimelineTracingMarkers,
};

export const TimelineTracingMarkersJank = explicitConnect(jankOptions);

/**
 * Create a connected component for all tracing markers.
 */
const tracingOptions: ExplicitConnectOptions<OwnProps, StateProps, {||}> = {
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = selectorsForThread(threadIndex);
    const selectedThread = getSelectedThreadIndex(state);
    const intervalMarkers = selectors.getRangeSelectionFilteredTracingMarkersForHeader(
      state
    );
    return {
      intervalMarkers,
      isSelected: threadIndex === selectedThread,
      styles,
      overlayFills,
      isModifyingSelection: getSelection(state).isModifying,
    };
  },
  component: TimelineTracingMarkers,
};

export const TimelineTracingMarkersOverview = explicitConnect(tracingOptions);
