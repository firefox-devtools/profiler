// @flow
import React, { Component } from 'react';
import FlameChartCanvas from './FlameChartCanvas';
import type { Thread, IndexIntoStackTable } from '../../common/types/profile';
import type { Milliseconds, CssPixels, UnitIntervalOfProfileRange, HorizontalViewport } from '../../common/types/units';
import type { StackTimingByDepth } from '../stack-timing';
import type { GetCategory } from '../color-categories';
import type { ChangeTimelineHorizontalViewport } from '../actions/timeline';

type Props = {
  thread: Thread,
  maxStackDepth: number,
  stackTimingByDepth: StackTimingByDepth,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  maxViewportHeight: number,
  stackFrameHeight: number,
  getCategory: GetCategory,
  getLabel: (Thread, IndexIntoStackTable) => string,
  isThreadExpanded: boolean,
  maximumZoom: UnitIntervalOfProfileRange,
  horizontalViewport: HorizontalViewport,
  changeTimelineHorizontalViewport: ChangeTimelineHorizontalViewport,
};

require('./FlameChartViewport.css');

const LINE_SCROLL_MODE = 1;
const SCROLL_LINE_SIZE = 15;

/**
 * Viewport terminology:
 *                                                  (this time is relative to current
 *                                                   profile range, not the total profile)
 *                 <------ e.g. 1000px ------>         0.7 - Sample's unit time
 *                 ___________________________          |
 *         _______|___________________________|_________|______________________
 *        |       |                           |         v                      |
 * |<-------------|---------------------------|---------*------- Total profile samples ------>|
 *        |       |                           |                                |
 *        |       |      Screen Viewport      |                                |
 *        |       |                           |         Current profile range  |
 *        |_______|___________________________|________________________________|
 *                |___________________________|
 *        ^       ^                           ^                                ^
 *        0.0    0.1 <- horizontalViewport -> 0.6                              1.0
 *
 *
 * horizontalViewport.left = 0.1 <- shared across timelines
 * horizontalViewport.right = 0.6 <- shared across timelines
 * viewportLength = horizontalViewport.right - horizontalViewport.left
 * viewportTop = 30 (in pixels)
 * screenWidth = 1000
 * unitPixel = viewportLength / screenWidth
 * horizontalViewport.right += mouseMoveDelta * unitPixel
 * horizontalViewport.left += mouseMoveDelta * unitPixel
 **/
class FlameChartViewport extends Component {

  props: Props

  state: {
    containerWidth: CssPixels,
    containerHeight: CssPixels,
    containerLeft: CssPixels,
    viewportTop: CssPixels,
    viewportBottom: CssPixels,
    dragX: CssPixels,
    dragY: CssPixels,
    isDragging: boolean,
  }

  constructor(props: Props) {
    super(props);

    (this: any)._mouseWheelListener = this._mouseWheelListener.bind(this);
    (this: any)._mouseDownListener = this._mouseDownListener.bind(this);
    (this: any)._mouseMoveListener = this._mouseMoveListener.bind(this);
    (this: any)._mouseUpListener = this._mouseUpListener.bind(this);

    (this: any)._setSize = this._setSize.bind(this);

    /**
     * TODO - Evaluate whether this state should stay in the component, or go out to
     * the redux stores. This state information potentially gets changed very frequently
     * with mouse events.
     */
    this.state = this.getDefaultState();
  }

  getDefaultState() {
    return {
      containerWidth: 0,
      containerHeight: 0,
      containerLeft: 0,
      // Positioning in pixels.
      viewportTop: 0,
      viewportBottom: 0,
      dragX: 0,
      dragY: 0,
      isDragging: false,
    };
  }

  componentDidUpdate(prevProps: Props) {
    if (prevProps.stackTimingByDepth !== this.props.stackTimingByDepth) {
      this.setState({ viewportTop: 0 });
      this._setSize();
    }
  }

  _setSize() {
    const rect = this.refs.container.getBoundingClientRect();
    if (this.state.containerWidth !== rect.width || this.state.containerHeight !== rect.height) {
      const style = window.getComputedStyle(this.refs.container);

      // Obey margins of the containing element.
      const containerWidth = rect.width - parseFloat(style.marginLeft) - parseFloat(style.marginRight);
      const containerHeight = rect.height - parseFloat(style.marginTop) - parseFloat(style.marginBottom);
      const containerLeft = rect.left + parseFloat(style.marginLeft);
      const viewportBottom = this.state.viewportTop + containerHeight;

      this.setState({ containerWidth, containerHeight, containerLeft, viewportBottom });
    }
  }

  _mouseWheelListener(event: SyntheticWheelEvent) {
    if (!this.props.isThreadExpanded) {
      // Maybe this should only be listening when expanded.
      return;
    }
    event.preventDefault();
    const { maximumZoom } = this.props;
    const { containerLeft, containerWidth } = this.state;
    const mouseCenter = (event.clientX - containerLeft) / containerWidth;
    const deltaY = event.deltaMode === LINE_SCROLL_MODE
      ? event.deltaY * SCROLL_LINE_SIZE
      : event.deltaY;

    const { horizontalViewport } = this.props;
    const viewportLength: CssPixels = horizontalViewport.right - horizontalViewport.left;
    const scale = viewportLength - viewportLength / (1 + deltaY * 0.001);
    let newViewportLeft: UnitIntervalOfProfileRange = clamp(0, 1, horizontalViewport.left - scale * mouseCenter);
    let newViewportRight: UnitIntervalOfProfileRange = clamp(0, 1, horizontalViewport.right + scale * (1 - mouseCenter));

    if (newViewportRight - newViewportLeft < maximumZoom) {
      const newViewportMiddle = (horizontalViewport.left + horizontalViewport.right) * 0.5;
      newViewportLeft = newViewportMiddle - maximumZoom * 0.5;
      newViewportRight = newViewportMiddle + maximumZoom * 0.5;
    }

    if (newViewportLeft === 0 && newViewportRight === 1) {
      if (horizontalViewport.left === 0 && horizontalViewport.right === 1) {
        // Do not update if at the maximum bounds.
        return;
      }
    }
    this.props.changeTimelineHorizontalViewport(newViewportLeft, newViewportRight);
  }

  _mouseDownListener(event: SyntheticMouseEvent) {
    this.setState({
      dragX: event.clientX,
      dragY: event.clientY,
      isDragging: true,
    });
    event.stopPropagation();
    event.preventDefault();

    window.addEventListener('mousemove', this._mouseMoveListener, true);
    window.addEventListener('mouseup', this._mouseUpListener, true);
  }

  _mouseMoveListener(event: SyntheticMouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    const { maxViewportHeight, horizontalViewport } = this.props;
    const { dragX, dragY, containerWidth, containerHeight, viewportTop } = this.state;

    // Calculate left and right in terms of the unit interval of the profile range.
    const viewportLength: CssPixels = horizontalViewport.right - horizontalViewport.left;
    const unitOffsetX: UnitIntervalOfProfileRange = viewportLength * (event.clientX - dragX) / containerWidth;
    let newViewportLeft: CssPixels = horizontalViewport.left - unitOffsetX;
    let newViewportRight: CssPixels = horizontalViewport.right - unitOffsetX;
    if (newViewportLeft < 0) {
      newViewportLeft = 0;
      newViewportRight = viewportLength;
    }
    if (newViewportRight > 1) {
      newViewportLeft = 1 - viewportLength;
      newViewportRight = 1;
    }

    // Calculate top and bottom in terms of pixels.
    let newViewportTop: CssPixels = viewportTop - (event.clientY - dragY);
    let newViewportBottom: CssPixels = newViewportTop + containerHeight;

    // Constrain the viewport to the bottom.
    if (newViewportBottom > maxViewportHeight) {
      newViewportTop = maxViewportHeight - containerHeight;
      newViewportBottom = maxViewportHeight;
    }

    // Constrain the viewport to the top. This must be after constraining to the bottom
    // so if the view is extra small the content is anchored to the top, and not the bottom.
    if (newViewportTop < 0) {
      newViewportTop = 0;
      newViewportBottom = containerHeight;
    }

    this.props.changeTimelineHorizontalViewport(newViewportLeft, newViewportRight);

    this.setState({
      dragX: event.clientX,
      dragY: event.clientY,
      viewportTop: newViewportTop,
      viewportBottom: newViewportBottom,
    });
  }

  _mouseUpListener(event: SyntheticMouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener('mousemove', this._mouseMoveListener, true);
    window.removeEventListener('mouseup', this._mouseUpListener, true);
    this.setState({
      isDragging: false,
    });
  }

  componentDidMount() {
    window.addEventListener('resize', this._setSize, false);
    this._setSize();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._setSize, false);
    window.removeEventListener('mousemove', this._mouseMoveListener, true);
    window.removeEventListener('mouseup', this._mouseUpListener, true);
  }

  render() {
    const {
      thread, interval, timeRange, maxStackDepth, stackTimingByDepth, getCategory,
      getLabel, stackFrameHeight, isThreadExpanded, horizontalViewport,
    } = this.props;

    const { containerWidth, containerHeight, viewportTop,
            viewportBottom, isDragging } = this.state;

    const viewportClassName = 'flameChartViewport' +
      (isThreadExpanded ? ' expanded' : ' collapsed') +
      (isDragging ? ' dragging' : '');

    return (
      <div className={viewportClassName}
           onWheel={this._mouseWheelListener}
           onMouseDown={this._mouseDownListener}
           ref='container'>
        <FlameChartCanvas interval={interval}
                          thread={thread}
                          rangeStart={timeRange.start}
                          rangeEnd={timeRange.end}
                          stackTimingByDepth={stackTimingByDepth}
                          containerWidth={containerWidth}
                          containerHeight={containerHeight}
                          getCategory={getCategory}
                          getLabel={getLabel}
                          viewportLeft={horizontalViewport.left}
                          viewportRight={horizontalViewport.right}
                          viewportTop={viewportTop}
                          viewportBottom={viewportBottom}
                          maxStackDepth={maxStackDepth}
                          stackFrameHeight={stackFrameHeight} />
      </div>
    );
  }
}

export default FlameChartViewport;

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}
