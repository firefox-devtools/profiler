// @flow
import React, { PureComponent } from 'react';
import withTimelineViewport from './TimelineViewport';
import TimelineCanvas from './TimelineCanvas';
import TextMeasurement from '../../utils/text-measurement';

import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type {
  TracingMarker,
  MarkerTimingRows,
  IndexIntoMarkerTiming,
} from '../../types/profile-derived';
import type { Action, ProfileSelection } from '../../types/actions';

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
  isDragging: boolean,
};

const ROW_HEIGHT = 16;
const TEXT_OFFSET_TOP = 11;
const TWO_PI = Math.PI * 2;
const MARKER_DOT_RADIUS = 0.25;
const TEXT_OFFSET_START = 3;

class TimelineMarkerCanvas extends PureComponent {
  _requestedAnimationFrame: boolean;
  _devicePixelRatio: number;
  _ctx: null | CanvasRenderingContext2D;
  _textMeasurement: null | TextMeasurement;

  props: Props;

  state: {
    hoveredItem: null | number,
  };

  constructor(props: Props) {
    super(props);
    (this: any).onDoubleClickMarker = this.onDoubleClickMarker.bind(this);
    (this: any).getHoveredMarkerInfo = this.getHoveredMarkerInfo.bind(this);
    (this: any).drawCanvas = this.drawCanvas.bind(this);
    (this: any).hitTest = this.hitTest.bind(this);
  }

  drawCanvas(
    ctx: CanvasRenderingContext2D,
    hoveredItem: IndexIntoMarkerTiming | null
  ) {
    const {
      viewportTop,
      viewportBottom,
      rowHeight,
      containerWidth,
      containerHeight,
      markerTimingRows,
    } = this.props;
    // Convert CssPixels to Stack Depth
    const startRow = Math.floor(viewportTop / rowHeight);
    const endRow = Math.min(
      Math.ceil(viewportBottom / rowHeight),
      markerTimingRows.length
    );

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    this.drawMarkers(ctx, hoveredItem, startRow, endRow);
    this.drawSeparatorsAndLabels(ctx, startRow, endRow);
  }

  drawMarkers(
    ctx: CanvasRenderingContext2D,
    hoveredItem: IndexIntoMarkerTiming | null,
    startRow: number,
    endRow: number
  ) {
    const {
      rangeStart,
      rangeEnd,
      containerWidth,
      markerTimingRows,
      viewportLeft,
      viewportRight,
      viewportTop,
    } = this.props;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx.
    if (!this._textMeasurement) {
      this._textMeasurement = new TextMeasurement(ctx);
    }
    const textMeasurement = this._textMeasurement;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // Only draw the stack frames that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const markerTiming = markerTimingRows[rowIndex];

      if (!markerTiming) {
        continue;
      }

      // Decide which samples to actually draw
      const timeAtViewportLeft: Milliseconds =
        rangeStart + rangeLength * viewportLeft;
      const timeAtViewportRight: Milliseconds =
        rangeStart + rangeLength * viewportRight;

      ctx.lineWidth = 1;
      for (let i = 0; i < markerTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          markerTiming.end[i] > timeAtViewportLeft &&
          markerTiming.start[i] < timeAtViewportRight
        ) {
          const startTime: UnitIntervalOfProfileRange =
            (markerTiming.start[i] - rangeStart) / rangeLength;
          const endTime: UnitIntervalOfProfileRange =
            (markerTiming.end[i] - rangeStart) / rangeLength;

          const x: CssPixels =
            (startTime - viewportLeft) * containerWidth / viewportLength;
          const y: CssPixels = rowIndex * ROW_HEIGHT - viewportTop;
          const w: CssPixels = Math.max(
            10,
            (endTime - startTime) * containerWidth / viewportLength
          );
          const h: CssPixels = ROW_HEIGHT - 1;

          if (w < 2) {
            // Skip sending draw calls for sufficiently small boxes.
            continue;
          }

          const tracingMarkerIndex = markerTiming.index[i];
          const isHovered = hoveredItem === tracingMarkerIndex;
          ctx.fillStyle = isHovered ? 'Highlight' : '#8296cb';

          if (w >= h) {
            this.drawRoundedRect(ctx, x, y + 1, w, h - 1, 1);

            const text = markerTiming.label[i];
            // Draw the text label
            // TODO - L10N RTL.
            // Constrain the x coordinate to the leftmost area.
            const x2: CssPixels = Math.max(x, 0) + TEXT_OFFSET_START;
            const w2: CssPixels = Math.max(0, w - (x2 - x));

            if (w2 > textMeasurement.minWidth) {
              const fittedText = textMeasurement.getFittedText(text, w2);
              if (fittedText) {
                ctx.fillStyle = isHovered ? 'HighlightText' : '#ffffff';
                ctx.fillText(fittedText, x2, y + TEXT_OFFSET_TOP);
              }
            }
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

  drawSeparatorsAndLabels(
    ctx: CanvasRenderingContext2D,
    startRow: number,
    endRow: number
  ) {
    const {
      markerTimingRows,
      rowHeight,
      viewportTop,
      containerWidth,
    } = this.props;

    // Draw separators
    ctx.fillStyle = '#eee';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
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
      const y = rowIndex * rowHeight - viewportTop;
      ctx.fillRect(0, y, 150, rowHeight);
    }

    // Draw the text
    ctx.fillStyle = '#000000';
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of stack frames.
      const { name } = markerTimingRows[rowIndex];
      if (rowIndex > 0 && name === markerTimingRows[rowIndex - 1].name) {
        continue;
      }
      const y = rowIndex * rowHeight - viewportTop;
      ctx.fillText(name, 5, y + TEXT_OFFSET_TOP);
    }
  }

  hitTest(x: CssPixels, y: CssPixels): IndexIntoMarkerTiming | null {
    const {
      rangeStart,
      rangeEnd,
      markerTimingRows,
      viewportLeft,
      viewportRight,
      viewportTop,
      containerWidth,
      rowHeight,
    } = this.props;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft + viewportLength * (x / containerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const rowIndex = Math.floor((y + viewportTop) / rowHeight);
    const minDuration =
      rangeLength *
      viewportLength *
      (rowHeight * 2 * MARKER_DOT_RADIUS / containerWidth);
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

  onDoubleClickMarker(markerIndex: IndexIntoMarkerTiming | null) {
    if (markerIndex === null) {
      return;
    }
    const { markers, updateProfileSelection } = this.props;
    const marker = markers[markerIndex];
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.start + marker.dur,
    });
  }

  drawRoundedRect(
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

  getHoveredMarkerInfo(hoveredItem: IndexIntoMarkerTiming): React$Element<*> {
    const { name, dur, data } = this.props.markers[hoveredItem];
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

    let tooltipName = name;
    if (data) {
      switch (data.type) {
        case 'UserTiming': {
          tooltipName = data.name;
          break;
        }
        default:
      }
    }

    return (
      <div className="tooltipOneLine">
        <div className="tooltipTiming">
          {duration}ms
        </div>
        <div className="tooltipName">
          {tooltipName}
        </div>
      </div>
    );
  }

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props;

    return (
      <TimelineCanvas
        className="timelineMarkerCanvas"
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this.onDoubleClickMarker}
        getHoveredItemInfo={this.getHoveredMarkerInfo}
        drawCanvas={this.drawCanvas}
        hitTest={this.hitTest}
      />
    );
  }
}

export default withTimelineViewport(TimelineMarkerCanvas);
