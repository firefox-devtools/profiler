/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { GREY_20 } from 'photon-colors';
import * as React from 'react';
import classNames from 'classnames';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from 'firefox-profiler/app-logic/constants';
import {
  withChartViewport,
  type Viewport,
} from 'firefox-profiler/components/shared/chart/Viewport';
import { ChartCanvas } from 'firefox-profiler/components/shared/chart/Canvas';
import TextMeasurement from 'firefox-profiler/utils/text-measurement';
import { FastFillStyle } from 'firefox-profiler/utils';
import type { updatePreviewSelection } from 'firefox-profiler/actions/profile-view';
import { BLUE_40 } from 'firefox-profiler/utils/colors';

import type {
  Milliseconds,
  CssPixels,
  UnitIntervalOfProfileRange,
  DevicePixels,
  ThreadsKey,
  IndexIntoJsTracerEvents,
  JsTracerTable,
  JsTracerTiming,
} from 'firefox-profiler/types';

import type {
  ChartCanvasScale,
  ChartCanvasHoverInfo,
} from '../shared/chart/Canvas';

import type { WrapFunctionInDispatch } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly jsTracerTimingRows: JsTracerTiming[];
  readonly jsTracerTable: JsTracerTable;
  readonly rowHeight: CssPixels;
  readonly threadsKey: ThreadsKey;
  readonly doFadeIn: boolean;
  readonly updatePreviewSelection: WrapFunctionInDispatch<
    typeof updatePreviewSelection
  >;
};

type Props = OwnProps & {
  // Bring in the viewport props from the higher order Viewport component.
  readonly viewport: Viewport;
};

type State = {
  // hoveredItem: null | number,
  hasFirstDraw: boolean;
};

/**
 * Collect all of values that are dependent on the current rendering pass.
 * These values will be reset on every draw call.
 */
type RenderPass = {
  readonly ctx: CanvasRenderingContext2D;
  readonly textMeasurement: TextMeasurement;
  readonly fastFillStyle: FastFillStyle;
  readonly startRow: number;
  readonly endRow: number;
  readonly devicePixels: {
    readonly rowHeight: DevicePixels;
    readonly containerWidth: DevicePixels;
    readonly innerContainerWidth: DevicePixels;
    readonly containerHeight: DevicePixels;
    readonly viewportTop: DevicePixels;
    readonly textOffsetStart: DevicePixels;
    readonly textOffsetTop: DevicePixels;
    readonly timelineMarginLeft: DevicePixels;
    readonly timelineMarginRight: DevicePixels;
    readonly oneCssPixel: DevicePixels;
    readonly rowLabelOffsetLeft: DevicePixels;
  };
};

const TEXT_OFFSET_TOP: CssPixels = 11;
const TEXT_OFFSET_START: CssPixels = 3;
const ROW_LABEL_OFFSET_LEFT: CssPixels = 5;
const FONT_SIZE: CssPixels = 10;

class JsTracerCanvasImpl extends React.PureComponent<Props, State> {
  override state: State = {
    hasFirstDraw: false,
  };
  _textMeasurement: TextMeasurement | null = null;
  _textMeasurementCssToDeviceScale: number = 1;

  /**
   * This method is called by the ChartCanvas component whenever the canvas needs to
   * be painted.
   */
  drawCanvas = (
    ctx: CanvasRenderingContext2D,
    scale: ChartCanvasScale,
    hoverInfo: ChartCanvasHoverInfo<IndexIntoJsTracerEvents>
  ) => {
    const {
      rowHeight,
      jsTracerTimingRows,
      viewport: {
        viewportTop,
        viewportBottom,
        containerWidth,
        containerHeight,
      },
    } = this.props;
    const { hoveredItem } = hoverInfo;

    const { cssToDeviceScale, cssToUserScale } = scale;
    if (cssToDeviceScale !== cssToUserScale) {
      throw new Error(
        'JsTracerCanvasImpl sets scaleCtxToCssPixels={false}, so canvas user space units should be equal to device pixels.'
      );
    }

    // Set the font before creating the text renderer. The font property resets
    // automatically whenever the canvas size is changed, so we set it on every
    // call.
    ctx.font = `${FONT_SIZE * cssToDeviceScale}px sans-serif`;

    // Ensure the text measurement tool is created, since this is the first time
    // this class has access to a ctx. We also need to recreate it when the scale
    // changes because we are working with device coordinates.
    if (
      !this._textMeasurement ||
      this._textMeasurementCssToDeviceScale !== cssToDeviceScale
    ) {
      this._textMeasurement = new TextMeasurement(ctx);
      this._textMeasurementCssToDeviceScale = cssToDeviceScale;
    }

    const renderPass: RenderPass = {
      ctx,
      textMeasurement: this._textMeasurement,
      fastFillStyle: new FastFillStyle(ctx),
      // Define a start and end row, so that we only draw the events
      // that are vertically within view.
      startRow: Math.floor(viewportTop / rowHeight),
      endRow: Math.min(
        Math.ceil(viewportBottom / rowHeight),
        jsTracerTimingRows.length
      ),
      devicePixels: {
        // Convert many of the common values provided by the Props into DevicePixels.
        containerWidth: containerWidth * cssToDeviceScale,
        innerContainerWidth:
          (containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT) *
          cssToDeviceScale,
        containerHeight: containerHeight * cssToDeviceScale,
        textOffsetStart: TEXT_OFFSET_START * cssToDeviceScale,
        textOffsetTop: TEXT_OFFSET_TOP * cssToDeviceScale,
        rowHeight: rowHeight * cssToDeviceScale,
        viewportTop: viewportTop * cssToDeviceScale,
        timelineMarginLeft: TIMELINE_MARGIN_LEFT * cssToDeviceScale,
        timelineMarginRight: TIMELINE_MARGIN_RIGHT * cssToDeviceScale,
        oneCssPixel: cssToDeviceScale,
        rowLabelOffsetLeft: ROW_LABEL_OFFSET_LEFT * cssToDeviceScale,
      },
    };

    {
      // Clear out any previous events.
      const { fastFillStyle, devicePixels } = renderPass;
      fastFillStyle.set('#ffffff');
      ctx.fillRect(
        0,
        0,
        devicePixels.containerWidth,
        devicePixels.containerHeight
      );
    }

    this.drawEvents(renderPass, hoveredItem);
    this.drawSeparatorsAndLabels(renderPass);

    this.setState((state) =>
      state.hasFirstDraw ? null : { hasFirstDraw: true }
    );
  };

  /**
   * This method collects the logic to draw a single event to the screen. It is
   * called thousands to millions of time per draw call, so it is an extremely
   * hot function.
   *
   * Note: we used a long argument list instead of an object parameter on
   * purpose, to reduce GC pressure while drawing.
   */
  drawOneEvent(
    renderPass: RenderPass,
    x: DevicePixels,
    y: DevicePixels,
    w: DevicePixels,
    h: DevicePixels,
    uncutWidth: DevicePixels,
    text: string,
    isHovered: boolean
  ) {
    const { ctx, textMeasurement, fastFillStyle, devicePixels } = renderPass;
    const backgroundColor = isHovered ? 'Highlight' : BLUE_40;
    const foregroundColor = isHovered ? 'HighlightText' : 'white';

    fastFillStyle.set(backgroundColor);

    if (uncutWidth >= 1) {
      ctx.fillRect(
        x,
        // Create margin at the top of 1 pixel.
        y + 1,
        w,
        // Account for the top and bottom margin for a combined 2 pixels.
        h - 2
      );

      // Draw the text label
      // TODO - L10N RTL.
      // Constrain the x coordinate to the leftmost area.
      const contentX: DevicePixels = x + devicePixels.textOffsetStart;
      const contentWidth: DevicePixels = Math.max(
        0,
        w - devicePixels.textOffsetStart
      );

      if (contentWidth > textMeasurement.minWidth) {
        const fittedText = textMeasurement.getFittedText(text, contentWidth);
        if (fittedText) {
          fastFillStyle.set(foregroundColor);
          ctx.fillText(fittedText, contentX, y + devicePixels.textOffsetTop);
        }
      }
    } else {
      // Make dimmer rectangles easier to see by providing a minimum brightness value.
      const easedW = w * 0.9 + 0.1;

      // Draw a rect with top and bottom margins of 2px (hence the -4).
      ctx.fillRect(x, y + 2, easedW, h - 4);
    }
  }

  /**
   * This method goes through the tracing information, with the current information
   * from the renderPass, and draws all of the events to the canvas.
   */
  drawEvents(
    renderPass: RenderPass,
    hoveredItem: IndexIntoJsTracerEvents | null
  ) {
    const { startRow, endRow, devicePixels } = renderPass;
    const {
      rangeStart,
      rangeEnd,
      jsTracerTimingRows,
      viewport: { viewportLeft, viewportRight },
    } = this.props;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    // Only draw the events that are vertically within view.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of events.
      const timing = jsTracerTimingRows[rowIndex];

      if (!timing) {
        continue;
      }

      // The following diagram represents a step in the for loop that's further below, not
      // a step in the loop we're in. It is documented here to explain all of the code
      // comments that follow in the loop.
      //
      // A.  |0---1|1---2|2---3|3---4|4---5|
      // B.   XXXXX XXXXX  0.2
      // C.                 [2.9-----4.9]
      //
      // Line "A." is a series of pixels, where the left and right hand side of each pixel
      // is indexed.
      // Line "B.", 1 block of XXXXX represents 1 drawn pixel. 0.2 represents partially
      // applied pixels where events have contributed to that pixel.
      // Line "C." is the current event to apply, with the left hand pixel position, and
      // right hand side pixel position. These are float values.
      //
      // The following variables are used below as well, but are provided as a reference
      // with the example diagram above.
      //
      // currentPixel: |2---3|
      // currentPixelLeftSide: 2
      // currentPixelRightSide: 3
      // currentPixelPartialValue: 0.2

      // Decide which samples to actually draw
      const timeAtViewportLeft: Milliseconds =
        rangeStart + rangeLength * viewportLeft;
      const timeAtViewportRightPlusMargin: Milliseconds =
        rangeStart +
        rangeLength * viewportRight +
        // This represents the amount of seconds in the right margin:
        devicePixels.timelineMarginRight *
          ((viewportLength * rangeLength) / devicePixels.containerWidth);
      const h: DevicePixels = devicePixels.rowHeight - devicePixels.oneCssPixel;
      const y: CssPixels =
        rowIndex * devicePixels.rowHeight - devicePixels.viewportTop;

      let currentPixelLeftSide: DevicePixels = devicePixels.timelineMarginLeft;
      let currentPixelRightSide: DevicePixels = currentPixelLeftSide + 1;
      // This value ranges from 0 to 1:
      let currentPixelPartialValue: DevicePixels = 0;

      const commitAndDrawPartialPixel = (y: number) => {
        if (currentPixelPartialValue > 0) {
          this.drawOneEvent(
            renderPass,
            currentPixelLeftSide,
            y,
            currentPixelPartialValue,
            h,
            currentPixelPartialValue,
            '',
            // Never draw a partial pixel as hovered:
            false // isHovered
          );
          currentPixelLeftSide++;
          currentPixelRightSide++;
          currentPixelPartialValue = 0;
        }
      };

      for (let i = 0; i < timing.length; i++) {
        const eventStartTime = timing.start[i];
        const eventEndTime = timing.end[i];

        // Only draw samples that are in bounds.
        if (
          eventEndTime > timeAtViewportLeft &&
          eventStartTime < timeAtViewportRightPlusMargin
        ) {
          const unitIntervalStartTime: UnitIntervalOfProfileRange =
            (eventStartTime - rangeStart) / rangeLength;
          const unitIntervalEndTime: UnitIntervalOfProfileRange =
            (eventEndTime - rangeStart) / rangeLength;

          let x: DevicePixels =
            ((unitIntervalStartTime - viewportLeft) *
              devicePixels.innerContainerWidth) /
              viewportLength +
            devicePixels.timelineMarginLeft;
          // If a viewport is smaller than the width of a box, it gets cut off so only
          // a smaller box is drawn. This variable holds the width of the event before
          // it is potentially "cut" by a smaller viewport.
          const uncutWidth: DevicePixels =
            ((unitIntervalEndTime - unitIntervalStartTime) *
              devicePixels.innerContainerWidth) /
            viewportLength;
          const text = timing.label[i];
          const isHovered = hoveredItem === timing.index[i];

          // Perform some checks to see if we can skip drawing this event.
          if (uncutWidth === 0) {
            // This event width is 0, so there is nothing to draw. This may not happen
            // in practice with JS tracer data, but perform a check anyway.
            continue;
          }
          if (x + uncutWidth < devicePixels.timelineMarginLeft) {
            // The right hand side of the box is not in the viewport range.
            continue;
          }
          if (
            x >
            devicePixels.containerWidth - devicePixels.timelineMarginRight
          ) {
            // Start of the box is not in the viewport rage.
            continue;
          }

          // Adjust the width if this box is cut by the viewport.
          let w = uncutWidth;
          if (x < devicePixels.timelineMarginLeft) {
            // Adjust events that are before the left margin.
            w = w - (devicePixels.timelineMarginLeft - x);
            x = devicePixels.timelineMarginLeft;
          }

          // Now determine if we can draw the event or commit partial pixels.
          const ceilX = Math.ceil(x);
          if (x + w <= ceilX) {
            // This event does not cross a pixel boundary. It will need to be partially
            // applied, but not drawn.

            if (x >= currentPixelRightSide) {
              // However, this event is in a new pixel, so commit the previous partially
              // applied pixel.
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //                     []
              commitAndDrawPartialPixel(y);
              currentPixelLeftSide = Math.floor(x);
              currentPixelRightSide = currentPixelLeftSide + 1;
              // Now the pixels look like this:
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX XXXXX  0.0
              //                     []
            } else {
              // This `else` block is intentionally blank, but shows the current state
              // of the for loop.
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //               []
            }
            // Partially apply the value.
            currentPixelPartialValue += w;
            continue;
          } else {
            // This event crosses from one pixel, into another pixel. At least some
            // pixels will need to be drawn.

            if (x > currentPixelRightSide) {
              // The current value is located beyond the partial pixel. Commit that
              // last partial pixel.
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //                             [4.9---6.2]
              // or
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //                    [3.1--4.9]
              commitAndDrawPartialPixel(y);
              currentPixelLeftSide = ceilX - 1;
              currentPixelRightSide = ceilX;
              // After this operation, the current state looks like this. We still
              // need to chop off the 4.9 to 5.0 and commit the 0.1 partial pixel.
              // This happens after this if/else block.
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX XXXXX XXXXX  0.0
              //                             [4.9---6.2]
              // or
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX XXXXX
              //                    [3.1--4.9]
            } else {
              // This `else` block is intentionally blank, but the following diagram
              // explains what the state of the loop is inside this block.
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //                 [2.9------6.2]
              //
              // or
              //
              // |0---1|1---2|2---3|3---4|4---5|
              //  XXXXX XXXXX  0.2
              //                   [3------6.2]
            }
            // Cut off the transition to the next pixel, and apply it.
            x = ceilX;
            currentPixelPartialValue += ceilX - x;
            commitAndDrawPartialPixel(y);
          }
          const floorW = Math.floor(w);
          this.drawOneEvent(
            renderPass,
            x,
            y,
            floorW,
            h,
            uncutWidth,
            text,
            isHovered
          );
          currentPixelLeftSide = x + floorW;
          currentPixelRightSide = x + floorW + 1;
          currentPixelPartialValue = w - floorW;
        }

        // Commit the last partial pixel of this row.
        commitAndDrawPartialPixel(y);
      }
    }
  }

  drawSeparatorsAndLabels(renderPass: RenderPass) {
    const {
      ctx,
      textMeasurement,
      fastFillStyle,
      startRow,
      endRow,
      devicePixels,
    } = renderPass;
    const { jsTracerTimingRows } = this.props;

    // Draw a line to separate the left margin.
    fastFillStyle.set(GREY_20);
    ctx.fillRect(
      devicePixels.timelineMarginLeft - devicePixels.oneCssPixel,
      0,
      devicePixels.oneCssPixel,
      devicePixels.containerHeight
    );

    // Draw the row separators.
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Subtract a CSS Pixel at the end, because the top separator is not drawn in the
      // canvas, it's drawn using CSS' border property. And canvas positioning is 0-based.
      const y =
        (rowIndex + 1) * devicePixels.rowHeight -
        devicePixels.viewportTop -
        devicePixels.oneCssPixel;
      ctx.fillRect(0, y, devicePixels.containerWidth, devicePixels.oneCssPixel);
    }

    // Draw the labels for the rows.
    fastFillStyle.set('#000000');
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex++) {
      // Get the timing information for a row of events.
      const { name } = jsTracerTimingRows[rowIndex];
      if (rowIndex > 0 && name === jsTracerTimingRows[rowIndex - 1].name) {
        // Do not draw a label if it's the same as the previous one.
        continue;
      }
      const fittedText = textMeasurement.getFittedText(
        name,
        devicePixels.timelineMarginLeft
      );
      const y = rowIndex * devicePixels.rowHeight - devicePixels.viewportTop;
      ctx.fillText(
        fittedText,
        devicePixels.rowLabelOffsetLeft,
        y + devicePixels.textOffsetTop
      );
    }
  }

  /**
   * TODO - See #1489
   * This function is currently not covered by tests, since it will be easier
   * to get coverage with the tooltip component work.
   */
  hitTest = (x: CssPixels, y: CssPixels): IndexIntoJsTracerEvents | null => {
    if (x < TIMELINE_MARGIN_LEFT) {
      return null;
    }
    const {
      rangeStart,
      rangeEnd,
      jsTracerTimingRows,
      rowHeight,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;
    const innerContainerWidth =
      containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft +
      viewportLength * ((x - TIMELINE_MARGIN_LEFT) / innerContainerWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const rowIndex = Math.floor((y + viewportTop) / rowHeight);
    const timing = jsTracerTimingRows[rowIndex];
    const minDuration: Milliseconds =
      (rangeLength * viewportLength) / innerContainerWidth;

    if (!timing) {
      return null;
    }

    for (let i = 0; i < timing.length; i++) {
      const start = timing.start[i];
      const end = Math.max(start + minDuration, timing.end[i]);
      if (start <= time && time < end) {
        const index = timing.index[i];
        return index;
      }
    }
    return null;
  };

  /**
   * TODO - See #1488
   * The JS tracer panel is not initially including hover or clicking support.
   * These methods were left, but commented out since the intent is to enable them
   * as follow-ups.
   */
  onDoubleClickEvent = (_eventIndex: IndexIntoJsTracerEvents | null) => {
    // if (eventIndex === null) {
    //   return;
    // }
    // const { markers, updatePreviewSelection } = this.props;
    // const marker = markers[eventIndex];
    // updatePreviewSelection({
    //   isModifying: false,
    //   selectionStart: marker.start,
    //   selectionEnd: marker.start + marker.dur,
    // });
  };

  /**
   * TODO - See #1489
   * The JS tracer panel is not initially including hover or clicking support.
   * These methods were left, but commented out since the intent is to enable them
   * as follow-ups.
   */
  getHoveredItemInfo = (
    _hoveredItem: IndexIntoJsTracerEvents
  ): React.ReactNode => {
    return null;
    // return (
    //   <JsTracerTooltipContents
    //     event={hoveredItem}
    //     threadsKey={this.props.threadsKey}
    //   />
    // );
  };

  override render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;
    return (
      <ChartCanvas
        className={classNames({
          jsTracerCanvasFadeIn: this.props.doFadeIn,
          jsTracerCanvas: true,
          jsTracerCanvasDrawn: this.state.hasFirstDraw,
        })}
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        isDragging={isDragging}
        onDoubleClickItem={this.onDoubleClickEvent}
        getHoveredItemInfo={this.getHoveredItemInfo}
        drawCanvas={this.drawCanvas}
        hitTest={this.hitTest}
        scaleCtxToCssPixels={false}
      />
    );
  }
}

export const JsTracerCanvas = withChartViewport<OwnProps>(JsTracerCanvasImpl);
