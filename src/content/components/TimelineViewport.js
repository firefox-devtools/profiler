// @flow
import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { connect } from 'react-redux';
import { getHasZoomedViaMousewheel } from '../reducers/timeline-view';
import actions from '../actions';

import type {
  CssPixels,
  UnitIntervalOfProfileRange,
  StartEndRange,
} from '../../common/types/units';
import type { UpdateProfileSelection } from '../actions/profile-view';
import type { ProfileSelection } from '../actions/types';

type Props = {
  viewportNeedsUpdate: any,
  timeRange: StartEndRange,
  maxViewportHeight: number,
  isRowExpanded: boolean,
  maximumZoom: UnitIntervalOfProfileRange,
  updateProfileSelection: UpdateProfileSelection,
  selection: ProfileSelection,
  getScrollElement: () => ?HTMLElement,
  hasZoomedViaMousewheel: () => void,
  setHasZoomedViaMousewheel: () => void,
  hasZoomedViaMousewheel: boolean,
};

require('./TimelineViewport.css');

// This is a little hacky, but saves from having to dynamically look up some properties.
const COLLAPSED_ROW_HEIGHT = 34;

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
 *        0.0    0.1                          0.6                              1.0
 *                 ^ viewportLeft               ^ viewportRight
 *
 * viewportLeft = 0.1 <- shared across timelines
 * viewportRight = 0.6 <- shared across timelines
 * viewportLength = viewportRight - viewportLeft
 * viewportTop = 30 (in pixels)
 * screenWidth = 1000
 * unitPixel = viewportLength / screenWidth
 * viewportRight += mouseMoveDelta * unitPixel
 * viewportLeft += mouseMoveDelta * unitPixel
 **/
export default function withTimelineViewport<T>(WrappedComponent: ReactClass<T>) {
  class TimelineViewport extends PureComponent {

    props: Props

    state: {
      containerWidth: CssPixels,
      containerHeight: CssPixels,
      containerLeft: CssPixels,
      viewportTop: CssPixels,
      viewportBottom: CssPixels,
      viewportLeft: UnitIntervalOfProfileRange,
      viewportRight: UnitIntervalOfProfileRange,
      dragX: CssPixels,
      dragY: CssPixels,
      isDragging: boolean,
      isScrolling: boolean,
    }

    scrollId: number

    constructor(props: Props) {
      super(props);

      (this: any)._mouseWheelListener = this._mouseWheelListener.bind(this);
      (this: any)._mouseDownListener = this._mouseDownListener.bind(this);
      (this: any)._mouseMoveListener = this._mouseMoveListener.bind(this);
      (this: any)._mouseUpListener = this._mouseUpListener.bind(this);

      (this: any)._setSize = this._setSize.bind(this);

      this.scrollId = 0;

      /**
       * TODO - Evaluate whether this state should stay in the component, or go out to
       * the redux stores. This state information potentially gets changed very frequently
       * with mouse events.
       */
      this.state = this.getDefaultState(props);
    }

    getHorizontalViewport({ selection, timeRange }: Props) {
      if (selection.hasSelection) {
        const { selectionStart, selectionEnd } = selection;
        const timeRangeLength = timeRange.end - timeRange.start;
        return {
          viewportLeft: (selectionStart - timeRange.start) / timeRangeLength,
          viewportRight: (selectionEnd - timeRange.start) / timeRangeLength,
        };
      }
      return {
        viewportLeft: 0,
        viewportRight: 1,
      };
    }

    getDefaultState(props: Props) {
      const { viewportLeft, viewportRight } = this.getHorizontalViewport(props);
      return {
        containerWidth: 0,
        containerHeight: 0,
        containerLeft: 0,
        viewportTop: 0,
        viewportBottom: 0,
        viewportLeft,
        viewportRight,
        dragX: 0,
        dragY: 0,
        isDragging: false,
        isScrolling: false,
      };
    }

    /**
     * Let the viewport know when we are actively scrolling.
     */
    showShiftScrollingHint() {
      // Only show this message if we haven't shift zoomed yet.
      if (this.props.hasZoomedViaMousewheel) {
        return;
      }

      const scollId = ++this.scrollId;
      if (!this.state.isScrolling) {
        this.setState({ isScrolling: true });
      }
      setTimeout(() => {
        if (scollId === this.scrollId) {
          this.setState({ isScrolling: false });
        }
      }, 1000);
    }

    componentDidUpdate(prevProps: Props) {
      if (this.props.viewportNeedsUpdate(prevProps, this.props)) {
        this.setState({ viewportTop: 0 });
        this._setSize();
      }
    }

    componentWillReceiveProps(newProps: Props) {
      if (this.props.isRowExpanded !== newProps.isRowExpanded) {
        this.setState(this.getDefaultState(newProps));
        return;
      }
      if (
        this.props.selection !== newProps.selection ||
        this.props.timeRange !== newProps.timeRange
      ) {
        this.setState(this.getHorizontalViewport(newProps));
      }
    }

    _setSize() {
      requestAnimationFrame(() => {
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
      });
    }

    _mouseWheelListener(event: SyntheticWheelEvent) {
      if (event.shiftKey) {
        this.zoomRangeSelection(event);
        return;
      }

      if (!this.props.isRowExpanded) {
        return;
      }

      // Only move the viewport if the entire canvas is in frame, otherwise let the
      // TimelineView scrolling element scroll.
      const maybeScrollElement = this.props.getScrollElement();
      const viewScrollTop = maybeScrollElement ? maybeScrollElement.scrollTop : 0;
      const offsetTopAndCollapsedRow = Math.max(0, this.refs.container.offsetTop - COLLAPSED_ROW_HEIGHT);

      // Do not move the contents if the chart is not fully within view.
      if (event.deltaY < 0) {
        // Scrolling up.
        if (viewScrollTop > offsetTopAndCollapsedRow) {
          return;
        }
      } else {
        if (
          // The top of the viewport is not within a single collapsed row height.
          (viewScrollTop < offsetTopAndCollapsedRow) &&
          // Can the scroll element still scroll?
          (maybeScrollElement
            ? maybeScrollElement.scrollTop !== maybeScrollElement.scrollHeight - maybeScrollElement.offsetHeight
            : false)
        ) {
          return;
        }
      }

      this.showShiftScrollingHint();

      // Do the work to move the viewport.
      const { containerHeight } = this.state;
      const didMove = this.moveViewport(
        -getNormalizedScrollDelta(event, containerHeight, 'deltaX'),
        -getNormalizedScrollDelta(event, containerHeight, 'deltaY')
      );
      if (didMove) {
        event.preventDefault();
      }
    }

    zoomRangeSelection(event: SyntheticWheelEvent) {
      if (!this.props.isRowExpanded) {
        // Maybe this should only be listening when expanded.
        return;
      }
      if (!this.props.hasZoomedViaMousewheel) {
        this.props.setHasZoomedViaMousewheel();
      }
      event.preventDefault();
      const { maximumZoom } = this.props;
      const {
        containerLeft,
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
      } = this.state;
      const mouseCenter = (event.clientX - containerLeft) / containerWidth;
      const deltaY = getNormalizedScrollDelta(event, containerHeight, 'deltaY');

      const viewportLength: CssPixels = viewportRight - viewportLeft;
      const scale = viewportLength - viewportLength / (1 + deltaY * 0.001);
      let newViewportLeft: UnitIntervalOfProfileRange = clamp(0, 1, viewportLeft - scale * mouseCenter);
      let newViewportRight: UnitIntervalOfProfileRange = clamp(0, 1, viewportRight + scale * (1 - mouseCenter));

      if (newViewportRight - newViewportLeft < maximumZoom) {
        const newViewportMiddle = (viewportLeft + viewportRight) * 0.5;
        newViewportLeft = newViewportMiddle - maximumZoom * 0.5;
        newViewportRight = newViewportMiddle + maximumZoom * 0.5;
      }

      const { updateProfileSelection, timeRange } = this.props;
      if (newViewportLeft === 0 && newViewportRight === 1) {
        if (viewportLeft === 0 && viewportRight === 1) {
          // Do not update if at the maximum bounds.
          return;
        }
        updateProfileSelection({
          hasSelection: false,
          isModifying: false,
        });
      } else {
        const timeRangeLength = timeRange.end - timeRange.start;
        updateProfileSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: timeRange.start + timeRangeLength * newViewportLeft,
          selectionEnd: timeRange.start + timeRangeLength * newViewportRight,
        });
      }
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

      const { dragX, dragY } = this.state;
      const offsetX = event.clientX - dragX;
      const offsetY = event.clientY - dragY;

      this.setState({
        dragX: event.clientX,
        dragY: event.clientY,
      });

      this.moveViewport(offsetX, offsetY);
    }

    moveViewport(offsetX: CssPixels, offsetY: CssPixels): boolean {
      const { maxViewportHeight, timeRange, updateProfileSelection } = this.props;
      const { containerWidth, containerHeight, viewportTop, viewportLeft, viewportRight } = this.state;

      // Calculate left and right in terms of the unit interval of the profile range.
      const viewportLength: CssPixels = viewportRight - viewportLeft;
      const unitOffsetX: UnitIntervalOfProfileRange = viewportLength * offsetX / containerWidth;
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
      let newViewportTop: CssPixels = viewportTop - offsetY;
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

      const timeRangeLength = timeRange.end - timeRange.start;
      const viewportHorizontalChanged = newViewportLeft !== viewportLeft;
      const viewportVerticalChanged = newViewportTop !== viewportTop;

      if (viewportHorizontalChanged) {
        updateProfileSelection({
          hasSelection: true,
          isModifying: false,
          selectionStart: timeRange.start + timeRangeLength * newViewportLeft,
          selectionEnd: timeRange.start + timeRangeLength * newViewportRight,
        });
      }

      if (viewportVerticalChanged) {
        this.setState({
          viewportTop: newViewportTop,
          viewportBottom: newViewportBottom,
        });
      }

      return viewportVerticalChanged || viewportHorizontalChanged;
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
      const { isRowExpanded, hasZoomedViaMousewheel } = this.props;

      const {
        containerWidth, containerHeight, viewportTop, viewportBottom, viewportLeft,
        viewportRight, isDragging, isScrolling,
      } = this.state;

      const viewportClassName = classNames({
        timelineViewport: true,
        expanded: isRowExpanded,
        collapsed: !isRowExpanded,
        dragging: isDragging,
      });

      const shiftScrollClassName = classNames({
        timelineViewportShiftScroll: true,
        hidden: hasZoomedViaMousewheel || !(isScrolling && isRowExpanded),
      });

      return (
        <div className={viewportClassName}
             onWheel={this._mouseWheelListener}
             onMouseDown={this._mouseDownListener}
             ref='container'>
          <WrappedComponent containerWidth={containerWidth}
                            containerHeight={containerHeight}
                            viewportLeft={viewportLeft}
                            viewportRight={viewportRight}
                            viewportTop={viewportTop}
                            viewportBottom={viewportBottom}
                            {...this.props} />
          <div className={shiftScrollClassName}>Zoom Timeline: <kbd>Shift</kbd> <kbd>Scroll</kbd></div>
        </div>
      );
    }
  }

  // Connect this component so that it knows whether or not to nag the user to use shift
  // for zooming on range selections.
  return connect(state => {
    return {
      hasZoomedViaMousewheel: getHasZoomedViaMousewheel(state),
    };
  }, (actions: Object))(TimelineViewport);
}

function clamp(min, max, value) {
  return Math.max(min, Math.min(max, value));
}

const SCROLL_LINE_SIZE = 15;

/**
 * Scroll wheel events can by of various types. Do the right thing by converting these
 * into CssPixels. https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode
 */
function getNormalizedScrollDelta(
  event: SyntheticWheelEvent,
  pageHeight: number,
  key: 'deltaY' | 'deltaX'
): CssPixels {
  const delta = key === 'deltaY' ? event.deltaY : event.deltaX;
  switch (event.deltaMode) {
    case 0x02: // Scroll by page.
      return delta * pageHeight;
    case 0x01: // Scroll by line.
      return delta * SCROLL_LINE_SIZE;
  }
  // Scroll by pixel.
  return delta;
}
