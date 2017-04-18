// @flow
import React, { Component } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import { timeCode } from '../../common/time-code';
import withTimelineViewport from './TimelineViewport';
import classNames from 'classnames';

import type { Milliseconds, CssPixels, UnitIntervalOfProfileRange, DevicePixels } from '../../common/types/units';
import type { TracingMarker, MarkerTimingRows } from '../../common/types/profile-derived';
import type { Action, ProfileSelection } from '../actions/types';

type Props = {
  interval: Milliseconds,
  rangeStart: Milliseconds,
  rangeEnd: Milliseconds,
  containerWidth: CssPixels,
  containerHeight: CssPixels,
  viewportLeft: UnitIntervalOfProfileRange,
  viewportRight: UnitIntervalOfProfileRange,
  viewportTop: CssPixels,
  viewportBottom: CssPixels,
  markerTimingRows: MarkerTimingRows,
  rowHeight: CssPixels,
  markers: TracingMarker[],
  updateProfileSelection: ProfileSelection => Action,
};

require('./TimelineMarkerCanvas.css');

const ROW_HEIGHT = 16;
const TEXT_OFFSET_START = 3;
const TEXT_OFFSET_TOP = 11;
const TWO_PI = Math.PI * 2;
const MARKER_DOT_RADIUS = 0.25;

class TimelineMarkerCanvas extends Component {

  _requestedAnimationFrame: boolean
  _devicePixelRatio: number
  _ctx: null|CanvasRenderingContext2D

  props: Props

  state: {
    hoveredItem: null | number;
  }

  constructor(props: Props) {
    super(props);
    this._requestedAnimationFrame = false;
    this._devicePixelRatio = 1;
    this.state = { hoveredItem: null };

    (this: any).onMouseMove = this.onMouseMove.bind(this);
    (this: any).onMouseOut = this.onMouseOut.bind(this);
    (this: any).onDoubleClick = this.onDoubleClick.bind(this);
  }

  _scheduleDraw() {
    if (!this._requestedAnimationFrame) {
      this._requestedAnimationFrame = true;
      window.requestAnimationFrame(() => {
        this._requestedAnimationFrame = false;
        if (this.refs.canvas) {
          timeCode('TimelineMarkerCanvas render', () => {
            this.drawCanvas();
          });
        }
      });
    }
  }

  shouldComponentUpdate(nextProps: Props) {
    return shallowCompare(this, nextProps);
  }

  _prepCanvas() {
    const {canvas} = this.refs;
    const {containerWidth, containerHeight} = this.props;
    const {devicePixelRatio} = window;
    const pixelWidth: DevicePixels = containerWidth * devicePixelRatio;
    const pixelHeight: DevicePixels = containerHeight * devicePixelRatio;
    if (!this._ctx) {
      this._ctx = canvas.getContext('2d');
    }
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = containerWidth + 'px';
      canvas.style.height = containerHeight + 'px';
      this._ctx.scale(this._devicePixelRatio, this._devicePixelRatio);
    }
    if (this._devicePixelRatio !== devicePixelRatio) {
      // Make sure and multiply by the inverse of the previous ratio, as the scaling
      // operates off of the previous set scale.
      const scale = (1 / this._devicePixelRatio) * devicePixelRatio;
      this._ctx.scale(scale, scale);
      this._devicePixelRatio = devicePixelRatio;
    }
    return this._ctx;
  }

  drawCanvas() {
    const ctx = this._prepCanvas();
    const {
      viewportTop, viewportBottom, rowHeight, containerWidth, containerHeight, markerTimingRows,
    } = this.props;
    // Convert CssPixels to Stack Depth
    const startRow = Math.floor(viewportTop / rowHeight);
    const endRow = Math.min(Math.ceil(viewportBottom / rowHeight), markerTimingRows.length);

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    this.drawMarkers(ctx, startRow, endRow);
    this.drawSeparatorsAndLabels(ctx, startRow, endRow);
  }

  drawMarkers(ctx, startRow, endRow) {
    const { rangeStart, rangeEnd, containerWidth, markers,
            containerHeight, markerTimingRows, rowHeight,
            viewportLeft, viewportRight, viewportTop, viewportBottom } = this.props;
    const { hoveredItem } = this.state;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange = viewportRight - viewportLeft;

    // Only draw the stack frames that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const markerTiming = markerTimingRows[rowIndex];

      if (!markerTiming) {
        continue;
      }

      // Decide which samples to actually draw
      const timeAtViewportLeft: Milliseconds = rangeStart + rangeLength * viewportLeft;
      const timeAtViewportRight: Milliseconds = rangeStart + rangeLength * viewportRight;

      ctx.lineWidth = 1;
      for (let i = 0; i < markerTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (markerTiming.end[i] > timeAtViewportLeft && markerTiming.start[i] < timeAtViewportRight) {
          const startTime: UnitIntervalOfProfileRange = (markerTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange = (markerTiming.end[i] - rangeStart) / rangeLength;

          const x: CssPixels = ((startTime - viewportLeft) * containerWidth / viewportLength);
          const y: CssPixels = rowIndex * ROW_HEIGHT - viewportTop;
          const w: CssPixels = Math.max(10, ((endTime - startTime) * containerWidth / viewportLength));
          const h: CssPixels = ROW_HEIGHT - 1;

          if (w < 2) {
            // Skip sending draw calls for sufficiently small boxes.
            continue;
          }

          const markerIndex = markerTiming.index[i];
          const marker = markers[markerIndex];
          const text = marker.name;

          ctx.fillStyle = hoveredItem === markerIndex ? '#38445F' : '#8296cb';

          if (w >= h) {
            this.drawRoundedRect(ctx, x, y + 1, w, h - 1, 1);
          } else {
            ctx.beginPath();
            ctx.arc(
              x + w / 2, // x
              y + h / 2, // y
              h * MARKER_DOT_RADIUS, // radius
              0, // arc start
              TWO_PI // arc end
            );
            ctx.fill();
          }
        }
      }
    }
  }

  drawSeparatorsAndLabels(ctx, startRow, endRow) {
    const { markerTimingRows, rowHeight, viewportTop, containerWidth } = this.props;

    // Draw separators
    ctx.fillStyle = '#eee';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const markerTiming = markerTimingRows[rowIndex];
      const y = (rowIndex + 1) * rowHeight - viewportTop;
      ctx.fillRect(0, y, containerWidth, 1);
    }

    // Fill in behind text
    const gradient = ctx.createLinearGradient(0, 0, 150, 0);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = gradient;
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const { name } = markerTimingRows[rowIndex];
      const y = rowIndex * rowHeight - viewportTop;
      const textWidth = ctx.measureText(name);
      ctx.fillRect(0, y, 150, rowHeight);
    }

    // Draw the text
    ctx.fillStyle = '#000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const { name } = markerTimingRows[rowIndex];
      const y = rowIndex * rowHeight - viewportTop;
      ctx.fillText(name, 5, y + TEXT_OFFSET_TOP);
    }
  }

  hitTest(event): number|null {
    const { canvas } = this.refs;
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const {
      rangeStart, rangeEnd, markerTimingRows, viewportLeft, viewportRight,
      containerWidth, rowHeight, markers,
    } = this.props;
    const x: CssPixels = event.pageX - rect.left;
    const y: CssPixels = event.pageY - rect.top;


    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange = viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange = viewportLeft + viewportLength * (x / containerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const rowIndex = Math.floor(y / rowHeight);
    const minDuration = rangeLength * viewportLength * (rowHeight * 2 * MARKER_DOT_RADIUS / containerWidth);
    const markerTiming = markerTimingRows[rowIndex];

    if (!markerTiming) {
      return null;
    }

    for (let i = 0; i < markerTiming.length; i++) {
      const start = markerTiming.start[i];
      // Ensure that really small markers are hoverable with a minDuration.
      const end = Math.max(start + minDuration, markerTiming.end[i]);
      if (start < time && end > time) {
        return markerTiming.index[i];
      }
    }
    return null;
  }

  onMouseMove(event: SyntheticMouseEvent) {
    const hoveredItem = this.hitTest(event);
    if (this.state.hoveredItem !== hoveredItem) {
      this.setState({ hoveredItem });
    }
  }

  onMouseOut() {
    if (this.state.hoveredItem !== null) {
      this.setState({ hoveredItem: null });
    }
  }

  onDoubleClick() {
    const { hoveredItem } = this.state;
    if (hoveredItem === null) {
      return;
    }
    const { markers, updateProfileSelection } = this.props;
    const marker = markers[hoveredItem];
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.start + marker.dur,
    });
  }

  drawRoundedRect(ctx: CanvasRenderingContext2D,
                   x: CssPixels, y: CssPixels, width: CssPixels, height: CssPixels,
                   cornerSize: CssPixels) {
    // Cut out c x c -sized squares in the corners.
    const c = Math.min(width / 2, Math.min(height / 2, cornerSize));
    const bottom = y + height;
    ctx.fillRect(x + c, y, width - 2 * c, c);
    ctx.fillRect(x, y + c, width, height - 2 * c);
    ctx.fillRect(x + c, bottom - c, width - 2 * c, c);
  }

  getHoveredMarkerInfo(): null | string {
    const { hoveredItem } = this.state;
    if (hoveredItem === null) {
      return null;
    }

    const { name, dur } = this.props.markers[hoveredItem];
    let duration;
    if (dur >= 10) {
      duration = dur.toFixed(0);
    } else if (dur >= 1) {
      duration = dur.toFixed(1);
    } else if (dur >= 0.1) {
      duration = dur.toFixed(2);
    } else {
      duration = dur.toFixed(3);
    }
    return `${name} - ${duration}ms`;
  }

  render() {
    const { hoveredItem } = this.state;
    this._scheduleDraw();

    const className = classNames({
      timelineMarkerCanvas: true,
      hover: hoveredItem !== null,
    });

    return <canvas className={className}
                   ref='canvas'
                   onMouseMove={this.onMouseMove}
                   onMouseOut={this.onMouseOut}
                   onDoubleClick={this.onDoubleClick}
                   title={this.getHoveredMarkerInfo()} />;
  }
}

export default withTimelineViewport(TimelineMarkerCanvas);
