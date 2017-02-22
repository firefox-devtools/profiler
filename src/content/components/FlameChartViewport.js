// @flow
import React, { Component } from 'react';
import FlameChartCanvas from './FlameChartCanvas';
import type { Thread } from '../../common/types/profile';
import type { Milliseconds, CssPixels, UnitIntervalOfProfileRange } from '../../common/types/units';
import type { StackTimingByDepth } from '../stack-timing';

type Props = {
  thread: Thread,
  maxStackDepth: number,
  stackTimingByDepth: StackTimingByDepth,
  isSelected: boolean,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  maxViewportHeight: number,
  rowHeight: number,
};

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
 *        0.0     0.1                         0.6                              1.0
 *
 *
 * viewportLeft = 0.1
 * viewportRight = 0.6
 * viewportTop = 30 (in pixels)
 * viewportLength = viewportRight - viewportLeft
 * screenWidth = 1000
 * unitPixel = viewportLength / screenWidth
 * viewportRight += mouseMoveDelta * unitPixel
 * viewportLeft += mouseMoveDelta * unitPixel
 **/
class FlameChartViewport extends Component {

  props: Props

  state: {
    containerWidth: CssPixels,
    containerHeight: CssPixels,
    containerLeft: CssPixels,
    viewportLeft: UnitIntervalOfProfileRange,
    viewportRight: UnitIntervalOfProfileRange,
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
    this.state = {
      containerWidth: 0,
      containerHeight: 0,
      containerLeft: 0,
      // Unit interval of the profile range.
      viewportLeft: 0,
      viewportRight: 1,
      // Positioning in pixels.
      viewportTop: 0,
      viewportBottom: 0,
      dragX: 0,
      dragY: 0,
      isDragging: false,
    };
  }

  _setSize() {
    const rect = this.refs.container.getBoundingClientRect();
    if (this.state.containerWidth !== rect.width || this.state.containerHeight !== rect.height) {
      this.setState({
        containerWidth: rect.width,
        containerHeight: rect.height,
        containerLeft: rect.left,
        viewportBottom: this.state.viewportTop + rect.height,
      });
    }
  }

  _mouseWheelListener(event: SyntheticWheelEvent) {
    event.preventDefault();
    const { containerLeft, containerWidth } = this.state;
    const mouseCenter = (event.clientX - containerLeft) / containerWidth;
    const deltaY = event.deltaMode === LINE_SCROLL_MODE
      ? event.deltaY * SCROLL_LINE_SIZE
      : event.deltaY;

    const { viewportLeft, viewportRight } = this.state;
    const viewportLength:CssPixels = viewportRight - viewportLeft;
    const scale = viewportLength - viewportLength / (1 + deltaY * 0.001);
    const newBoundsLeft:UnitIntervalOfProfileRange = clamp(0, 1, viewportLeft - scale * mouseCenter);
    const newBoundsRight:UnitIntervalOfProfileRange = clamp(0, 1, viewportRight + scale * (1 - mouseCenter));

    if (newBoundsLeft === 0 && newBoundsRight === 1) {
      if (viewportLeft === 0 && viewportRight === 1) {
        // Do not update if at the maximum bounds.
        return;
      }
    }
    this.setState({
      viewportLeft: newBoundsLeft,
      viewportRight: newBoundsRight,
    });
  }

  _mouseDownListener(event: SyntheticMouseEvent) {
    this.setState({
      dragX: event.clientX,
      dragY: event.clientY,
      isDragging: true,
    });
  }

  _mouseMoveListener(event: SyntheticMouseEvent) {
    if (this.state.isDragging) {
      event.stopPropagation();
      const { maxViewportHeight } = this.props;
      const { dragX, dragY, containerWidth, containerHeight, viewportLeft, viewportRight,
              viewportTop } = this.state;

      // Calculate left and right in terms of the unit interval of the profile range.
      const viewportLength: CssPixels = viewportRight - viewportLeft;
      const unitOffsetX: UnitIntervalOfProfileRange = viewportLength * (event.clientX - dragX) / containerWidth;
      let newViewportLeft: CssPixels = viewportLeft - unitOffsetX;
      let newViewportRight: CssPixels = viewportRight - unitOffsetX;
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

      this.setState({
        dragX: event.clientX,
        dragY: event.clientY,
        viewportLeft: newViewportLeft,
        viewportRight: newViewportRight,
        viewportTop: newViewportTop,
        viewportBottom: newViewportBottom,
      });
    }
  }

  _mouseUpListener(event: SyntheticMouseEvent) {
    if (this.state.isDragging) {
      event.stopPropagation();
      this.setState({
        isDragging: false,
      });
    }
  }

  componentDidMount() {
    window.addEventListener('resize', this._setSize, false);
    window.addEventListener('mousemove', this._mouseMoveListener, true);
    window.addEventListener('mouseup', this._mouseUpListener, true);

    this._setSize();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._setSize, false);
    window.removeEventListener('mousemove', this._mouseMoveListener, true);
    window.removeEventListener('mouseup', this._mouseUpListener, true);
  }

  render() {
    const {
      thread, interval, timeRange, maxStackDepth, stackTimingByDepth, rowHeight,
    } = this.props;

    const { containerWidth, containerHeight, viewportLeft, viewportRight, viewportTop,
            viewportBottom, isDragging } = this.state;

    return (
      <div className={'flameChartViewport ' + (isDragging ? 'dragging' : '')}
           onWheel={this._mouseWheelListener}
           onMouseDown={this._mouseDownListener}
           ref='container'>
        <FlameChartCanvas interval={interval}
                          thread={thread}
                          className='flameChart'
                          rangeStart={timeRange.start}
                          rangeEnd={timeRange.end}
                          stackTimingByDepth={stackTimingByDepth}
                          containerWidth={containerWidth}
                          containerHeight={containerHeight}
                          viewportLeft={viewportLeft}
                          viewportRight={viewportRight}
                          viewportTop={viewportTop}
                          viewportBottom={viewportBottom}
                          maxStackDepth={maxStackDepth}
                          rowHeight={rowHeight} />
      </div>
    );
  }
}

export default FlameChartViewport;

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}
