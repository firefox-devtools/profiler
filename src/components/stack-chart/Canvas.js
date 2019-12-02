/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { GREY_30 } from 'photon-colors';
import * as React from 'react';
import memoize from 'memoize-immutable';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import {
  withChartViewport,
  type WithChartViewport,
} from '../shared/chart/Viewport';
import ChartCanvas from '../shared/chart/Canvas';
import { FastFillStyle } from '../../utils';
import TextMeasurement from '../../utils/text-measurement';
import { formatMilliseconds } from '../../utils/format-numbers';
import { updatePreviewSelection } from '../../actions/profile-view';
import { mapCategoryColorNameToStackChartStyles } from '../../utils/colors';
import { TooltipCallNode } from '../tooltip/CallNode';
import { TooltipMarker } from '../tooltip/Marker';
import { TooltipReactEvent, TooltipReactWork } from '../tooltip/React';
import reactProfilerProcessor from './reactProfilerProcessor';

import type {
  Thread,
  CategoryList,
  PageList,
  ThreadIndex,
} from '../../types/profile';
import type { UserTimingMarkerPayload } from '../../types/markers';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CombinedTimingRows,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  CssPixels,
  DevicePixels,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type {
  StackTimingDepth,
  IndexIntoStackTiming,
} from '../../profile-logic/stack-timing';
import type { Viewport } from '../shared/chart/Viewport';
import type { WrapFunctionInDispatch } from '../../utils/connect';

type OwnProps = {|
  +thread: Thread,
  +pages: PageList | null,
  +threadIndex: ThreadIndex,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +combinedTimingRows: CombinedTimingRows,
  +stackFrameHeight: CssPixels,
  +updatePreviewSelection: WrapFunctionInDispatch<
    typeof updatePreviewSelection
  >,
  +getMarker: Function,
  +categories: CategoryList,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
  +onRightClick: (IndexIntoCallNodeTable | null) => void,
  +shouldDisplayTooltips: () => boolean,
  +scrollToSelectionGeneration: number,
|};

type Props = $ReadOnly<{|
  ...OwnProps,
  +viewport: Viewport,
|}>;

type HoveredStackTiming = {|
  +depth: StackTimingDepth,
  +stackTimingIndex: IndexIntoStackTiming,
|};

require('./Canvas.css');

const ROW_CSS_PIXELS_HEIGHT = 16;
const TEXT_CSS_PIXELS_OFFSET_START = 3;
const TEXT_CSS_PIXELS_OFFSET_TOP = 11;
const FONT_SIZE = 10;
const BORDER_OPACITY = 0.4;

const REACT_DEVTOOLS_FONT_SIZE = 12;
const REACT_GUTTER_SIZE = 4;
const REACT_EVENT_SIZE = 4;
const REACT_WORK_SIZE = 8;
const REACT_BORDER_SIZE = 1;
const REACT_DEVTOOLS_PRIORITY_SIZE =
  REACT_GUTTER_SIZE * 3 +
  REACT_EVENT_SIZE +
  REACT_WORK_SIZE +
  REACT_BORDER_SIZE;
const REACT_PRIORITIES = ['unscheduled', 'high', 'normal', 'low'];
const REACT_DEVTOOLS_CANVAS_HEIGHT =
  REACT_DEVTOOLS_PRIORITY_SIZE * REACT_PRIORITIES.length;
const REACT_DEVTOOLS_COLORS = {
  BACKGROUND: '#ffffff',
  PRIORITY_BACKGROUND: '#ededf0',
  PRIORITY_BORDER: '#d7d7db',
  PRIORITY_LABEL: '#272727',
  REACT_IDLE: '#f0f0f1',
  REACT_IDLE_HOVER: '#d7d7db',
  REACT_RENDER: '#9fc3f3',
  REACT_RENDER_HOVER: '#298ff6',
  REACT_COMMIT: '#ff718e',
  REACT_COMMIT_HOVER: '#ff335f',
  REACT_SCHEDULE: '#a6e59f',
  REACT_SCHEDULE_HOVER: '#13bc00',
  REACT_SUSPEND: '#c49edd',
  REACT_SUSPEND_HOVER: '#6200a4',
};

class StackChartCanvas extends React.PureComponent<Props> {
  _leftMarginGradient: null | CanvasGradient = null;
  _rightMarginGradient: null | CanvasGradient = null;

  state = {
    rawData: null,
    reactProfilerData: null,
  };

  // TODO (bvaughn) This should be moved into a selector to better fit the architecture.
  static getDerivedStateFromProps(nextProps, prevState) {
    if (prevState.rawData === nextProps.thread.markers.data) {
      return prevState;
    }

    const rawData = nextProps.thread.markers.data;
    const reactProfilerData = reactProfilerProcessor(rawData);

    return {
      rawData,
      reactProfilerData,
    };
  }

  componentDidUpdate(prevProps) {
    // We want to scroll the selection into view when this component
    // is mounted, but using componentDidMount won't work here as the
    // viewport will not have completed setting its size by
    // then. Instead, look for when the viewport's isSizeSet prop
    // changes to true.
    if (!this.props.viewport.isSizeSet) {
      return;
    }
    const viewportDidMount = !prevProps.viewport.isSizeSet;

    if (
      viewportDidMount ||
      this.props.scrollToSelectionGeneration >
        prevProps.scrollToSelectionGeneration
    ) {
      this._scrollSelectionIntoView();
    }
  }

  _scrollSelectionIntoView = () => {
    const {
      selectedCallNodeIndex,
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) {
      return;
    }

    const depth = callNodeTable.depth[selectedCallNodeIndex];
    const y = depth * ROW_CSS_PIXELS_HEIGHT;

    if (y < this.props.viewport.viewportTop) {
      this.props.viewport.moveViewport(0, this.props.viewport.viewportTop - y);
    } else if (y + ROW_CSS_PIXELS_HEIGHT > this.props.viewport.viewportBottom) {
      this.props.viewport.moveViewport(
        0,
        this.props.viewport.viewportBottom - (y + ROW_CSS_PIXELS_HEIGHT)
      );
    }
  };

  _drawCanvasReact = (
    ctx: CanvasRenderingContext2D,
    hoveredItem: Object | null
  ) => {
    const {
      rangeStart,
      rangeEnd,
      viewport: { containerWidth, viewportLeft, viewportRight },
    } = this.props;

    const { devicePixelRatio } = window;

    const devicePixelsWidth = containerWidth * devicePixelRatio;
    const devicePixelsHeight = REACT_DEVTOOLS_CANVAS_HEIGHT * devicePixelRatio;

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;

    const innerContainerWidth =
      containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;
    const innerDevicePixelsWidth = innerContainerWidth * devicePixelRatio;

    const pixelAtViewportPosition = (
      viewportPosition: UnitIntervalOfProfileRange
    ): DevicePixels =>
      devicePixelRatio *
      // The right hand side of this formula is all in CSS pixels.
      (TIMELINE_MARGIN_LEFT +
        ((viewportPosition - viewportLeft) * innerContainerWidth) /
          viewportLength);

    ctx.fillStyle = REACT_DEVTOOLS_COLORS.BACKGROUND;
    ctx.fillRect(0, 0, devicePixelsWidth, devicePixelsHeight);

    //
    // Draw markers
    //

    const pixelsInViewport = viewportLength * innerDevicePixelsWidth;
    const timePerPixel = rangeLength / pixelsInViewport;

    // Decide which samples to actually draw
    const timeAtStart: Milliseconds =
      rangeStart +
      rangeLength * viewportLeft -
      timePerPixel * TIMELINE_MARGIN_LEFT;
    const timeAtEnd: Milliseconds = rangeStart + rangeLength * viewportRight;

    const { reactProfilerData } = this.state;
    if (reactProfilerData !== null) {
      REACT_PRIORITIES.forEach((priority, priorityIndex) => {
        const currentPriority = reactProfilerData[priority];
        currentPriority.reactEvents.forEach(event => {
          this._renderReactEvent({
            ctx,
            event,
            isHovered: false,
            pixelAtViewportPosition,
            priorityIndex,
            rangeLength,
            rangeStart,
            timeAtStart,
            timeAtEnd,
          });
        });
        currentPriority.reactWork.forEach(event => {
          this._renderReactWork({
            ctx,
            event,
            isHovered: false,
            pixelAtViewportPosition,
            priorityIndex,
            rangeLength,
            rangeStart,
            timeAtStart,
            timeAtEnd,
          });
        });

        if (hoveredItem !== undefined && hoveredItem !== null) {
          const { event, priorityIndex } = hoveredItem;

          switch (event.type) {
            case 'commit-work':
            case 'render-idle':
            case 'render-work':
              this._renderReactWork({
                ctx,
                event,
                isHovered: true,
                pixelAtViewportPosition,
                priorityIndex,
                rangeLength,
                rangeStart,
                timeAtStart,
                timeAtEnd,
              });
              break;
            case 'schedule-render':
            case 'schedule-state-update':
            case 'suspend':
              this._renderReactEvent({
                ctx,
                event,
                isHovered: true,
                pixelAtViewportPosition,
                priorityIndex,
                rangeLength,
                rangeStart,
                timeAtStart,
                timeAtEnd,
              });
              break;
            default:
              console.warn(`Unexpected type "${event.type}"`);
              break;
          }
        }
      });
    }

    //
    // Draw fixed left priority labels
    //

    ctx.fillStyle = REACT_DEVTOOLS_COLORS.PRIORITY_BACKGROUND;
    ctx.fillRect(
      0,
      0,
      TIMELINE_MARGIN_LEFT * devicePixelRatio,
      devicePixelsHeight
    );

    ctx.fillStyle = REACT_DEVTOOLS_COLORS.PRIORITY_BORDER;
    ctx.fillRect(
      TIMELINE_MARGIN_LEFT * devicePixelRatio,
      0,
      devicePixelRatio,
      devicePixelsHeight
    );

    REACT_PRIORITIES.forEach((priority, priorityIndex) => {
      ctx.fillStyle = REACT_DEVTOOLS_COLORS.PRIORITY_BORDER;
      ctx.fillRect(
        0,
        (REACT_DEVTOOLS_PRIORITY_SIZE * (priorityIndex + 1) -
          REACT_BORDER_SIZE) *
          devicePixelRatio,
        devicePixelsWidth,
        REACT_BORDER_SIZE * devicePixelRatio
      );

      ctx.fillStyle = REACT_DEVTOOLS_COLORS.PRIORITY_LABEL;
      ctx.textBaseline = 'middle';
      ctx.font = `${REACT_DEVTOOLS_FONT_SIZE * devicePixelRatio}px sans-serif`;
      ctx.fillText(
        priority,
        10 * devicePixelRatio,
        REACT_DEVTOOLS_PRIORITY_SIZE * devicePixelRatio * priorityIndex +
          12 * devicePixelRatio
      );
    });
  };

  _renderReactEvent({
    ctx,
    event,
    isHovered,
    pixelAtViewportPosition,
    priorityIndex,
    rangeLength,
    rangeStart,
    timeAtStart,
    timeAtEnd,
  }) {
    const { timestamp, type } = event;

    const time: UnitIntervalOfProfileRange =
      (timestamp - rangeStart) / rangeLength;
    const x = pixelAtViewportPosition(time);

    if (timestamp < timeAtStart || timestamp > timeAtEnd) {
      return; // Not in view
    }

    let fillStyle = null;
    const strokeStyle = null;
    switch (type) {
      case 'schedule-render':
      case 'schedule-state-update':
        fillStyle = isHovered
          ? REACT_DEVTOOLS_COLORS.REACT_SCHEDULE_HOVER
          : REACT_DEVTOOLS_COLORS.REACT_SCHEDULE;
        // strokeStyle = event === selectedEvent ? REACT_DEVTOOLS_COLORS.REACT_SCHEDULE_HOVER : null;
        break;
      case 'suspend':
        fillStyle = isHovered
          ? REACT_DEVTOOLS_COLORS.REACT_SUSPEND_HOVER
          : REACT_DEVTOOLS_COLORS.REACT_SUSPEND;
        // strokeStyle = event === selectedEvent ? REACT_DEVTOOLS_COLORS.REACT_SUSPEND_HOVER : null;
        break;
      default:
        console.warn(`Unexpected event type "${type}"`);
        break;
    }

    if (fillStyle !== null) {
      const y =
        REACT_DEVTOOLS_PRIORITY_SIZE * priorityIndex * devicePixelRatio +
        (REACT_GUTTER_SIZE + REACT_EVENT_SIZE / 2) * devicePixelRatio;

      ctx.beginPath();
      ctx.fillStyle = fillStyle;
      ctx.arc(x, y, REACT_EVENT_SIZE, 0, 2 * Math.PI);
      ctx.fill();
      if (strokeStyle !== null) {
        ctx.beginPath();
        ctx.lineWidth = 2;
        ctx.strokeStyle = strokeStyle;
        ctx.arc(x, y, REACT_EVENT_SIZE / 2, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }

  _renderReactWork({
    ctx,
    event,
    isHovered,
    pixelAtViewportPosition,
    priorityIndex,
    rangeLength,
    rangeStart,
    timeAtStart,
    timeAtEnd,
  }) {
    const { duration, timestamp, type } = event;

    const startTime: UnitIntervalOfProfileRange =
      (timestamp - rangeStart) / rangeLength;
    const endTime: UnitIntervalOfProfileRange =
      (timestamp + duration - rangeStart) / rangeLength;
    const x = pixelAtViewportPosition(startTime);
    const width = pixelAtViewportPosition(endTime) - x;

    if (timestamp + duration < timeAtStart || timestamp > timeAtEnd) {
      return; // Not in view
    }

    let fillStyle = null;
    const strokeStyle = null;
    switch (type) {
      case 'commit-work':
        fillStyle = isHovered
          ? REACT_DEVTOOLS_COLORS.REACT_COMMIT_HOVER
          : REACT_DEVTOOLS_COLORS.REACT_COMMIT;
        //strokeStyle = event === selectedEvent ? REACT_DEVTOOLS_COLORS.REACT_COMMIT_HOVER : null;
        break;
      case 'render-idle':
        // We could render idle time as diagonal hashes.
        // This looks nicer when zoomed in, but not so nice when zoomed out.
        // color = ctx.createPattern(getIdlePattern(), 'repeat');
        fillStyle = isHovered
          ? REACT_DEVTOOLS_COLORS.REACT_IDLE_HOVER
          : REACT_DEVTOOLS_COLORS.REACT_IDLE;
        //strokeStyle = event === selectedEvent ? REACT_DEVTOOLS_COLORS.REACT_IDLE_HOVER : null;
        break;
      case 'render-work':
        fillStyle = isHovered
          ? REACT_DEVTOOLS_COLORS.REACT_RENDER_HOVER
          : REACT_DEVTOOLS_COLORS.REACT_RENDER;
        //strokeStyle = event === selectedEvent ? REACT_DEVTOOLS_COLORS.REACT_RENDER_HOVER : null;
        break;
      default:
        console.warn(`Unexpected work type "${type}"`);
        break;
    }

    const y =
      REACT_DEVTOOLS_PRIORITY_SIZE * priorityIndex * devicePixelRatio +
      (REACT_GUTTER_SIZE + REACT_EVENT_SIZE + REACT_GUTTER_SIZE) *
        devicePixelRatio;

    ctx.fillStyle = fillStyle;
    ctx.fillRect(
      Math.floor(x),
      Math.floor(y),
      Math.floor(width),
      Math.floor(REACT_WORK_SIZE * devicePixelRatio)
    );
    if (strokeStyle !== null) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = strokeStyle;
      ctx.strokeRect(
        Math.floor(x + 1),
        Math.floor(y + 1),
        Math.floor(width - 2),
        Math.floor(REACT_WORK_SIZE * devicePixelRatio - 2)
      );
    }
  }

  /**
   * Draw the canvas.
   *
   * Note that most of the units are not absolute values, but unit intervals ranged from
   * 0 - 1. This was done to make the calculations easier for computing various zoomed
   * and translated views independent of any particular scale. See
   * src/components/shared/chart/Viewport.js for a diagram detailing the various
   * components of this set-up.
   */
  _drawCanvas = (
    ctx: CanvasRenderingContext2D,
    hoveredItem: HoveredStackTiming | null
  ) => {
    const {
      thread,
      rangeStart,
      rangeEnd,
      combinedTimingRows,
      stackFrameHeight,
      selectedCallNodeIndex,
      categories,
      callNodeInfo: { callNodeTable },
      getMarker,
      viewport: {
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
        viewportTop,
        viewportBottom,
      },
    } = this.props;
    const fastFillStyle = new FastFillStyle(ctx);

    const { devicePixelRatio } = window;

    // Set the font size before creating a text measurer.
    ctx.font = `${FONT_SIZE * devicePixelRatio}px sans-serif`;
    const textMeasurement = new TextMeasurement(ctx);

    const devicePixelsWidth = containerWidth * devicePixelRatio;
    const devicePixelsHeight =
      (containerHeight - REACT_DEVTOOLS_CANVAS_HEIGHT) * devicePixelRatio;

    fastFillStyle.set('#ffffff');
    ctx.fillRect(0, 0, devicePixelsWidth, devicePixelsHeight);

    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const viewportDevicePixelsTop = viewportTop * devicePixelRatio;

    // Convert CssPixels to Stack Depth
    const startDepth = Math.floor(viewportTop / stackFrameHeight);
    const endDepth = Math.ceil(viewportBottom / stackFrameHeight);

    const innerContainerWidth =
      containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;
    const innerDevicePixelsWidth = innerContainerWidth * devicePixelRatio;

    const pixelAtViewportPosition = (
      viewportPosition: UnitIntervalOfProfileRange
    ): DevicePixels =>
      devicePixelRatio *
      // The right hand side of this formula is all in CSS pixels.
      (TIMELINE_MARGIN_LEFT +
        ((viewportPosition - viewportLeft) * innerContainerWidth) /
          viewportLength);

    // Apply the device pixel ratio to various CssPixel constants.
    const rowDevicePixelsHeight = ROW_CSS_PIXELS_HEIGHT * devicePixelRatio;
    const oneCssPixelInDevicePixels = 1 * devicePixelRatio;
    const textDevicePixelsOffsetStart =
      TEXT_CSS_PIXELS_OFFSET_START * devicePixelRatio;
    const textDevicePixelsOffsetTop =
      TEXT_CSS_PIXELS_OFFSET_TOP * devicePixelRatio;

    // Only draw the stack frames that are vertically within view.
    for (let depth = startDepth; depth < endDepth; depth++) {
      // Get the timing information for a row of stack frames.
      const stackTiming = combinedTimingRows[depth];

      if (!stackTiming) {
        continue;
      }
      /*
       * TODO - Do an O(log n) binary search to find the only samples in range rather than
       * linear O(n) search for loops. Profile the results to see if this helps at all.
       *
       * const startSampleIndex = binarySearch(stackTiming.start, rangeStart + rangeLength * viewportLeft);
       * const endSampleIndex = binarySearch(stackTiming.end, rangeStart + rangeLength * viewportRight);
       */

      const pixelsInViewport = viewportLength * innerDevicePixelsWidth;
      const timePerPixel = rangeLength / pixelsInViewport;

      // Decide which samples to actually draw
      const timeAtStart: Milliseconds =
        rangeStart +
        rangeLength * viewportLeft -
        timePerPixel * TIMELINE_MARGIN_LEFT;
      const timeAtEnd: Milliseconds = rangeStart + rangeLength * viewportRight;

      let lastDrawnPixelX = 0;
      for (let i = 0; i < stackTiming.length; i++) {
        // Only draw samples that are in bounds.
        if (
          stackTiming.end[i] > timeAtStart &&
          stackTiming.start[i] < timeAtEnd
        ) {
          // Draw a box, but increase the size by a small portion in order to draw
          // a single pixel at the end with a slight opacity.
          //
          // Legend:
          // |======|  A stack frame's timing.
          // |O|       A single fully opaque pixel.
          // |.|       A slightly transparent pixel.
          // | |       A fully transparent pixel.
          //
          // Drawing strategy:
          //
          // Frame timing   |=====||========|    |=====|    |=|     |=|=|=|=|
          // Device Pixels  |O|O|.|O|O|O|O|.| | |O|O|O|.| | |O|.| | |O|.|O|.|
          // CSS Pixels     |   |   |   |   |   |   |   |   |   |   |   |   |

          // First compute the left and right sides of the box.
          const viewportAtStartTime: UnitIntervalOfProfileRange =
            (stackTiming.start[i] - rangeStart) / rangeLength;
          const viewportAtEndTime: UnitIntervalOfProfileRange =
            (stackTiming.end[i] - rangeStart) / rangeLength;
          const floatX = pixelAtViewportPosition(viewportAtStartTime);
          const floatW: DevicePixels =
            ((viewportAtEndTime - viewportAtStartTime) *
              innerDevicePixelsWidth) /
              viewportLength -
            1;

          // Determine if there is enough pixel space to draw this box, and snap the
          // box to the pixels.
          let snappedFloatX = floatX;
          let snappedFloatW = floatW;
          let skipDraw = true;
          if (floatX >= lastDrawnPixelX) {
            // The x value is past the last lastDrawnPixelX, so it can be drawn.
            skipDraw = false;
          } else if (floatX + floatW > lastDrawnPixelX) {
            // The left side of the box is before the lastDrawnPixelX value, but the
            // right hand side is within a range to be drawn. Truncate the box a little
            // bit in order to draw it to the screen in the free space.
            snappedFloatW = floatW - (lastDrawnPixelX - floatX);
            snappedFloatX = lastDrawnPixelX;
            skipDraw = false;
          }

          if (skipDraw) {
            // This box didn't satisfy the constraints in the above if checks, so skip it.
            continue;
          }

          // Convert or compute all of the integer values for drawing the box.
          // Note, this should all be Math.round instead of floor and ceil, but some
          // off by one errors appear to be creating gaps where there shouldn't be any.
          const intX = Math.floor(snappedFloatX);
          const intY = Math.round(
            depth * rowDevicePixelsHeight - viewportDevicePixelsTop
          );
          const intW = Math.ceil(Math.max(1, snappedFloatW));
          const intH = Math.round(
            rowDevicePixelsHeight - oneCssPixelInDevicePixels
          );

          // Look up information about this stack frame.
          let funcIndex,
            funcNameIndex,
            text,
            categoryIndex,
            category,
            isSelected;
          if (stackTiming.callNode) {
            const callNodeIndex = stackTiming.callNode[i];
            funcIndex = callNodeTable.func[callNodeIndex];
            funcNameIndex = thread.funcTable.name[funcIndex];
            text = thread.stringTable.getString(funcNameIndex);
            categoryIndex = callNodeTable.category[callNodeIndex];
            category = categories[categoryIndex];
            isSelected = selectedCallNodeIndex === categoryIndex;
          } else {
            const markerIndex = stackTiming.index[i];
            const markerPayload = ((getMarker(markerIndex)
              .data: any): UserTimingMarkerPayload);
            text = markerPayload.name;
            categoryIndex = 0;
            category = categories[categoryIndex];
            isSelected = selectedCallNodeIndex === markerIndex;
          }

          const isHovered =
            hoveredItem &&
            depth === hoveredItem.depth &&
            i === hoveredItem.stackTimingIndex;

          const colorStyles = this._mapCategoryColorNameToStyles(
            category.color
          );
          // Draw the box.
          fastFillStyle.set(
            isHovered || isSelected
              ? colorStyles.selectedFillStyle
              : colorStyles.unselectedFillStyle
          );
          ctx.fillRect(
            intX,
            intY,
            // Add on a bit of BORDER_OPACITY to the end of the width, to draw a partial
            // pixel. This will effectively draw a transparent version of the fill color
            // without having to change the fill color. At the time of this writing it
            // was the same performance cost as only providing integer values here.
            intW + BORDER_OPACITY,
            intH
          );
          lastDrawnPixelX =
            intX +
            intW +
            // The border on the right is 1 device pixel wide.
            1;

          // Draw the text label if it fits. Use the original float values here so that
          // the text doesn't snap around when moving. Only the boxes should snap.
          const textX: DevicePixels =
            // Constrain the x coordinate to the leftmost area.
            Math.max(floatX, 0) + textDevicePixelsOffsetStart;
          const textW: DevicePixels = Math.max(0, floatW - (textX - floatX));

          if (textW > textMeasurement.minWidth) {
            const fittedText = textMeasurement.getFittedText(text, textW);
            if (fittedText) {
              fastFillStyle.set(
                isHovered || isSelected
                  ? colorStyles.selectedTextColor
                  : '#000000'
              );
              ctx.fillText(fittedText, textX, intY + textDevicePixelsOffsetTop);
            }
          }
        }
      }
    }

    // Draw the borders on the left and right.
    fastFillStyle.set(GREY_30);
    ctx.fillRect(
      pixelAtViewportPosition(0),
      0,
      oneCssPixelInDevicePixels,
      devicePixelsHeight
    );
    ctx.fillRect(
      pixelAtViewportPosition(1),
      0,
      oneCssPixelInDevicePixels,
      devicePixelsHeight
    );
  };

  _hitTestReact = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      rangeStart,
      rangeEnd,
      viewport: { containerWidth, viewportLeft, viewportRight },
    } = this.props;

    const innerDevicePixelsWidth =
      containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;
    const rangeLength = rangeEnd - rangeStart;
    const viewportLength = viewportRight - viewportLeft;

    const { reactProfilerData } = this.state;
    if (reactProfilerData !== null) {
      const priorityIndex = Math.floor(y / REACT_DEVTOOLS_PRIORITY_SIZE);
      const priority = REACT_PRIORITIES[priorityIndex];
      const baseY = REACT_DEVTOOLS_PRIORITY_SIZE * priorityIndex;
      const eventMinY = baseY + REACT_GUTTER_SIZE / 2;
      const eventMaxY = eventMinY + REACT_EVENT_SIZE + REACT_GUTTER_SIZE;
      const workMinY = eventMaxY;
      const workMaxY = workMinY + REACT_WORK_SIZE + REACT_GUTTER_SIZE;

      let events = null;
      if (y >= eventMinY && y <= eventMaxY) {
        events = reactProfilerData[priority].reactEvents;
      } else if (y >= workMinY && y <= workMaxY) {
        events = reactProfilerData[priority].reactWork;
      }

      if (events !== null) {
        const positionToTime = x =>
          rangeStart +
          (viewportLeft +
            viewportLength *
              ((x - TIMELINE_MARGIN_LEFT) / innerDevicePixelsWidth)) *
            rangeLength;

        const pointerTime = positionToTime(x);

        let startIndex = 0;
        let stopIndex = events.length - 1;
        while (startIndex <= stopIndex) {
          const index = Math.floor((startIndex + stopIndex) / 2);

          const event = events[index];
          const { duration, timestamp } = event;

          if (duration === undefined || duration === null) {
            const timeToPosition = time =>
              Math.round(
                (((time - rangeStart) / rangeLength - viewportLeft) /
                  viewportLength) *
                  innerDevicePixelsWidth +
                  TIMELINE_MARGIN_LEFT
              );

            const eventX = timeToPosition(timestamp);
            const startX = eventX - REACT_EVENT_SIZE / 2;
            const stopX = eventX + REACT_EVENT_SIZE / 2;
            if (x >= startX && x <= stopX) {
              return { event, priorityIndex };
            }
          } else {
            if (
              pointerTime >= timestamp &&
              pointerTime <= timestamp + duration
            ) {
              return { event, priorityIndex };
            }
          }

          if (timestamp < pointerTime) {
            startIndex = index + 1;
          } else {
            stopIndex = index - 1;
          }
        }
      }
    }

    return null;
  };

  _getHoveredStackInfoReact = data => {
    if (data !== undefined && data !== null) {
      const { event } = data;
      const { type } = event;
      switch (type) {
        case 'commit-work':
        case 'render-idle':
        case 'render-work':
          return <TooltipReactWork work={event} />;
        case 'schedule-render':
        case 'schedule-state-update':
        case 'suspend':
          return <TooltipReactEvent event={event} />;
        default:
          console.warn(`Unexpected type "${type}"`);
          break;
      }
    }

    return null;
  };

  // Provide a memoized function that maps the category color names to specific color
  // choices that are used across this project's charts.
  _mapCategoryColorNameToStyles = memoize(
    mapCategoryColorNameToStackChartStyles,
    {
      // Memoize every color that is seen.
      limit: Infinity,
    }
  );

  _getHoveredStackInfo = ({
    depth,
    stackTimingIndex,
  }: HoveredStackTiming): React.Node | null => {
    const {
      thread,
      threadIndex,
      combinedTimingRows,
      categories,
      callNodeInfo,
      getMarker,
      shouldDisplayTooltips,
      interval,
      pages,
    } = this.props;

    if (!shouldDisplayTooltips()) {
      return null;
    }

    const stackTiming = combinedTimingRows[depth];

    if (stackTiming.index) {
      const markerIndex = stackTiming.index[stackTimingIndex];

      return (
        <TooltipMarker
          marker={getMarker(markerIndex)}
          threadIndex={threadIndex}
        />
      );
    }

    const callNodeIndex = stackTiming.callNode[stackTimingIndex];
    const duration =
      stackTiming.end[stackTimingIndex] - stackTiming.start[stackTimingIndex];

    return (
      <TooltipCallNode
        thread={thread}
        pages={pages}
        interval={interval}
        callNodeIndex={callNodeIndex}
        callNodeInfo={callNodeInfo}
        categories={categories}
        // The stack chart doesn't support other call tree summary types.
        callTreeSummaryStrategy="timing"
        durationText={formatMilliseconds(duration)}
      />
    );
  };

  _onDoubleClickStack = (hoveredItem: HoveredStackTiming | null) => {
    if (hoveredItem === null) {
      return;
    }
    const { depth, stackTimingIndex } = hoveredItem;
    const { combinedTimingRows, updatePreviewSelection } = this.props;
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: combinedTimingRows[depth].start[stackTimingIndex],
      selectionEnd: combinedTimingRows[depth].end[stackTimingIndex],
    });
  };

  _getCallNodeIndexOrMarkerIndexFromHoveredItem(
    hoveredItem: HoveredStackTiming | null
  ): {| index: number, type: 'marker' | 'call-node' |} | null {
    if (hoveredItem === null) {
      return null;
    }

    const { depth, stackTimingIndex } = hoveredItem;
    const { combinedTimingRows } = this.props;

    if (combinedTimingRows[depth].callNode) {
      const callNodeIndex =
        combinedTimingRows[depth].callNode[stackTimingIndex];
      return { index: callNodeIndex, type: 'call-node' };
    }

    if (combinedTimingRows[depth].index) {
      const index = combinedTimingRows[depth].index[stackTimingIndex];
      return { index, type: 'marker' };
    }

    return null;
  }

  _onSelectItem = (hoveredItem: HoveredStackTiming | null) => {
    // Change our selection to the hovered item, or deselect (with
    // null) if there's nothing hovered.
    const result = this._getCallNodeIndexOrMarkerIndexFromHoveredItem(
      hoveredItem
    );
    if (result) {
      this.props.onSelectionChange(result.index);
    }
  };

  _onRightClick = (hoveredItem: HoveredStackTiming | null) => {
    const result = this._getCallNodeIndexOrMarkerIndexFromHoveredItem(
      hoveredItem
    );
    if (result) {
      this.props.onRightClick(result.index);
    }
  };

  _hitTest = (x: CssPixels, y: CssPixels): HoveredStackTiming | null => {
    const {
      rangeStart,
      rangeEnd,
      combinedTimingRows,
      viewport: { viewportLeft, viewportRight, viewportTop, containerWidth },
    } = this.props;

    const innerDevicePixelsWidth =
      containerWidth - TIMELINE_MARGIN_LEFT - TIMELINE_MARGIN_RIGHT;
    const rangeLength: Milliseconds = rangeEnd - rangeStart;
    const viewportLength: UnitIntervalOfProfileRange =
      viewportRight - viewportLeft;
    const unitIntervalTime: UnitIntervalOfProfileRange =
      viewportLeft +
      viewportLength * ((x - TIMELINE_MARGIN_LEFT) / innerDevicePixelsWidth);
    const time: Milliseconds = rangeStart + unitIntervalTime * rangeLength;
    const depth = Math.floor((y + viewportTop) / ROW_CSS_PIXELS_HEIGHT);
    const stackTiming = combinedTimingRows[depth];

    if (!stackTiming) {
      return null;
    }

    for (let i = 0; i < stackTiming.length; i++) {
      const start = stackTiming.start[i];
      const end = stackTiming.end[i];
      if (start < time && end > time) {
        return { depth, stackTimingIndex: i };
      }
    }

    return null;
  };

  _noop = () => {};

  render() {
    const { containerWidth, containerHeight, isDragging } = this.props.viewport;

    return (
      <React.Fragment>
        <ChartCanvas
          scaleCtxToCssPixels={false}
          className="stackChartCanvas"
          containerWidth={containerWidth}
          containerHeight={REACT_DEVTOOLS_CANVAS_HEIGHT}
          isDragging={isDragging}
          onDoubleClickItem={this._noop}
          getHoveredItemInfo={this._getHoveredStackInfoReact}
          drawCanvas={this._drawCanvasReact}
          hitTest={this._hitTestReact}
          onSelectItem={this._noop}
          onRightClick={this._noop}
        />
        <ChartCanvas
          scaleCtxToCssPixels={false}
          className="stackChartCanvas"
          containerWidth={containerWidth}
          containerHeight={containerHeight - REACT_DEVTOOLS_CANVAS_HEIGHT}
          isDragging={isDragging}
          onDoubleClickItem={this._onDoubleClickStack}
          getHoveredItemInfo={this._getHoveredStackInfo}
          drawCanvas={this._drawCanvas}
          hitTest={this._hitTest}
          onSelectItem={this._onSelectItem}
          onRightClick={this._onRightClick}
          style={{ top: REACT_DEVTOOLS_CANVAS_HEIGHT }}
        />
      </React.Fragment>
    );
  }
}

export default (withChartViewport: WithChartViewport<OwnProps, Props>)(
  StackChartCanvas
);
