/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from '../../../utils/connect';
import { getHasZoomedViaMousewheel } from '../../../reducers/app';
import { setHasZoomedViaMousewheel } from '../../../actions/stack-chart';
import { updateProfileSelection } from '../../../actions/profile-view';

import type {
  CssPixels,
  UnitIntervalOfProfileRange,
  StartEndRange,
} from '../../../types/units';
import type { ProfileSelection } from '../../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../../utils/connect';

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
 * viewportLeft = 0.1
 * viewportRight = 0.6
 * viewportLength = viewportRight - viewportLeft
 * viewportTop = 30 (in pixels)
 * screenWidth = 1000
 * unitPixel = viewportLength / screenWidth
 * viewportRight += mouseMoveDelta * unitPixel
 * viewportLeft += mouseMoveDelta * unitPixel
 **/

const { DOM_DELTA_PAGE, DOM_DELTA_LINE } =
  typeof window === 'object' && window.WheelEvent
    ? new WheelEvent('mouse')
    : { DOM_DELTA_LINE: 1, DOM_DELTA_PAGE: 2 };

// These viewport values (most of which are computed dynamically by
// the HOC) are passed into the props of the wrapped component.
export type Viewport = {|
  +containerWidth: CssPixels,
  +containerHeight: CssPixels,
  +viewportLeft: UnitIntervalOfProfileRange,
  +viewportRight: UnitIntervalOfProfileRange,
  +viewportTop: CssPixels,
  +viewportBottom: CssPixels,
  +isDragging: boolean,
  +moveViewport: (CssPixels, CssPixels) => void,
  +isSizeSet: boolean,
|};

type ViewportStateProps = {|
  +hasZoomedViaMousewheel?: boolean,
|};

type ViewportDispatchProps = {|
  +updateProfileSelection: typeof updateProfileSelection,
  +setHasZoomedViaMousewheel?: typeof setHasZoomedViaMousewheel,
|};

// These are the props consumed by this Higher-Order Component (HOC), but can be
// optionally used by the wrapped component.
type ViewportOwnProps<ChartProps> = {|
  +viewportProps: {|
    +timeRange: StartEndRange,
    +maxViewportHeight: number,
    +startsAtBottom?: boolean,
    +maximumZoom: UnitIntervalOfProfileRange,
    +selection: ProfileSelection,
    +disableHorizontalMovement?: boolean,
    // These props are defined by the generic variables passed into to the type
    // WithChartViewport when calling withChartViewport. This is how the relationship
    // is guaranteed. e.g. here with OwnProps:
    //
    //   (withChartViewport: WithChartViewport<OwnProps, Props>)(
    //     MarkerChartCanvas
    //   )
    +viewportNeedsUpdate: (
      prevProps: ChartProps,
      nextProps: ChartProps
    ) => boolean,
  |},
  +chartProps: ChartProps,
|};

type HorizontalViewport = {|
  viewportLeft: UnitIntervalOfProfileRange,
  viewportRight: UnitIntervalOfProfileRange,
|};

type State = {|
  containerWidth: CssPixels,
  containerHeight: CssPixels,
  containerLeft: CssPixels,
  viewportTop: CssPixels,
  viewportBottom: CssPixels,
  horizontalViewport: HorizontalViewport,
  dragX: CssPixels,
  dragY: CssPixels,
  isDragging: boolean,
  isShiftScrollHintVisible: boolean,
  isSizeSet: boolean,
|};

require('./Viewport.css');

export function withChartViewport<
  ChartOwnProps: Object,
  // The chart component's props are given the viewport object, as well as the original
  // ChartOwnProps.
  ChartProps: $ReadOnly<{|
    ...ChartOwnProps,
    viewport: Viewport,
  |}>
>(ChartComponent: React.ComponentType<ChartProps>) {
  type ViewportProps = ConnectedProps<
    ViewportOwnProps<ChartOwnProps>,
    ViewportStateProps,
    ViewportDispatchProps
  >;

  class ChartViewport extends React.PureComponent<ViewportProps, State> {
    shiftScrollId: number;
    _pendingProfileSelectionUpdates: Array<
      (HorizontalViewport) => ProfileSelection
    > = [];
    _container: HTMLElement | null;
    _takeContainerRef = container => (this._container = container);

    constructor(props: ViewportProps) {
      super(props);
      (this: any).moveViewport = this.moveViewport.bind(this);
      (this: any)._mouseWheelListener = this._mouseWheelListener.bind(this);
      (this: any)._mouseDownListener = this._mouseDownListener.bind(this);
      (this: any)._mouseMoveListener = this._mouseMoveListener.bind(this);
      (this: any)._mouseUpListener = this._mouseUpListener.bind(this);

      (this: any)._setSize = this._setSize.bind(this);
      (this: any)._setSizeNextFrame = this._setSizeNextFrame.bind(this);

      this.shiftScrollId = 0;
      this._container = null;

      this.state = this.getDefaultState(props);
    }

    getHorizontalViewport(
      selection: ProfileSelection,
      timeRange: StartEndRange
    ) {
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

    getDefaultState(props: ViewportProps) {
      const { selection, timeRange } = props.viewportProps;
      const horizontalViewport = this.getHorizontalViewport(
        selection,
        timeRange
      );
      const { startsAtBottom, maxViewportHeight } = props.viewportProps;
      return {
        containerWidth: 0,
        containerHeight: 0,
        containerLeft: 0,
        viewportTop: 0,
        viewportBottom: startsAtBottom ? maxViewportHeight : 0,
        horizontalViewport,
        dragX: 0,
        dragY: 0,
        isDragging: false,
        isShiftScrollHintVisible: false,
        isSizeSet: false,
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

      const scrollId = ++this.shiftScrollId;
      if (!this.state.isShiftScrollHintVisible) {
        this.setState({ isShiftScrollHintVisible: true });
      }
      setTimeout(() => {
        if (scrollId === this.shiftScrollId) {
          this.setState({ isShiftScrollHintVisible: false });
        }
      }, 1000);
    }

    componentWillReceiveProps(newProps: ViewportProps) {
      if (
        this.props.viewportProps.viewportNeedsUpdate(
          this.props.chartProps,
          newProps.chartProps
        )
      ) {
        this.setState(this.getDefaultState(newProps));
        this._setSizeNextFrame();
      } else if (
        this.props.viewportProps.selection !==
          newProps.viewportProps.selection ||
        this.props.viewportProps.timeRange !== newProps.viewportProps.timeRange
      ) {
        const { selection, timeRange } = newProps.viewportProps;
        const horizontalViewport = this.getHorizontalViewport(
          selection,
          timeRange
        );
        this.setState({
          horizontalViewport,
        });
      }
    }

    _setSize() {
      if (this._container) {
        const rect = this._container.getBoundingClientRect();
        const { startsAtBottom } = this.props.viewportProps;
        if (
          this.state.containerWidth !== rect.width ||
          this.state.containerHeight !== rect.height
        ) {
          this.setState(prevState => ({
            containerWidth: rect.width,
            containerHeight: rect.height,
            containerLeft: rect.left,
            viewportBottom: startsAtBottom
              ? prevState.viewportBottom
              : prevState.viewportTop + rect.height,
            viewportTop: startsAtBottom
              ? prevState.viewportBottom - rect.height
              : prevState.viewportTop,
            isSizeSet: true,
          }));
        }
      }
    }

    _setSizeNextFrame() {
      requestAnimationFrame(this._setSize);
    }

    _mouseWheelListener(event: SyntheticWheelEvent<>) {
      // We handle the wheel event, so disable the browser's handling, such
      // as back/forward swiping or scrolling.
      event.preventDefault();

      const { disableHorizontalMovement } = this.props.viewportProps;
      if (event.shiftKey) {
        if (!disableHorizontalMovement) {
          this.zoomRangeSelection(event);
        }
        return;
      }

      if (!disableHorizontalMovement) {
        this.showShiftScrollingHint();
      }

      // Do the work to move the viewport.
      const { containerHeight } = this.state;

      this.moveViewport(
        -getNormalizedScrollDelta(event, containerHeight, 'deltaX'),
        -getNormalizedScrollDelta(event, containerHeight, 'deltaY')
      );
    }

    _updateProfileSelectionFromHorizontalViewportAsync(
      callback: HorizontalViewport => ProfileSelection
    ) {
      if (this._pendingProfileSelectionUpdates.length === 0) {
        requestAnimationFrame(() =>
          this._flushPendingProfileSelectionUpdates()
        );
      }
      this._pendingProfileSelectionUpdates.push(callback);
    }

    _flushPendingProfileSelectionUpdates() {
      if (this._pendingProfileSelectionUpdates.length !== 0) {
        const pendingUpdates = this._pendingProfileSelectionUpdates;
        this._pendingProfileSelectionUpdates = [];
        const {
          updateProfileSelection,
          viewportProps: { selection, timeRange },
        } = this.props;
        let profileSelection = selection;
        for (const callback of pendingUpdates) {
          const horizontalViewport = this.getHorizontalViewport(
            profileSelection,
            timeRange
          );
          profileSelection = callback(horizontalViewport);
        }
        updateProfileSelection(profileSelection);
      }
    }

    zoomRangeSelection(event: SyntheticWheelEvent<>) {
      const { hasZoomedViaMousewheel, setHasZoomedViaMousewheel } = this.props;
      if (!hasZoomedViaMousewheel && setHasZoomedViaMousewheel) {
        setHasZoomedViaMousewheel();
      }

      // Shift is a modifier that will change some mice to scroll horizontally, check
      // for that here.
      const deltaKey = event.deltaY === 0 ? 'deltaX' : 'deltaY';

      // Accumulate the scroll delta here. Only apply it once per frame to avoid
      // spamming the Redux store with updates.
      const deltaY = getNormalizedScrollDelta(
        event,
        this.state.containerHeight,
        deltaKey
      );

      const mouseX = event.clientX;
      const { containerLeft, containerWidth } = this.state;

      const { maximumZoom } = this.props.viewportProps;

      this._updateProfileSelectionFromHorizontalViewportAsync(
        ({ viewportLeft, viewportRight }) => {
          const mouseCenter = (mouseX - containerLeft) / containerWidth;

          const viewportLength = viewportRight - viewportLeft;
          const zoomFactor = Math.pow(1.0009, deltaY);
          const newViewportLength = clamp(
            maximumZoom,
            1,
            viewportLength * zoomFactor
          );
          const deltaViewportLength = newViewportLength - viewportLength;
          const newViewportLeft = clamp(
            0,
            1 - newViewportLength,
            viewportLeft - deltaViewportLength * mouseCenter
          );
          const newViewportRight = clamp(
            newViewportLength,
            1,
            viewportRight + deltaViewportLength * (1 - mouseCenter)
          );

          const { viewportProps: { timeRange } } = this.props;
          if (newViewportLeft === 0 && newViewportRight === 1) {
            return {
              hasSelection: false,
              isModifying: false,
            };
          }
          const timeRangeLength = timeRange.end - timeRange.start;
          return {
            hasSelection: true,
            isModifying: false,
            selectionStart: timeRange.start + timeRangeLength * newViewportLeft,
            selectionEnd: timeRange.start + timeRangeLength * newViewportRight,
          };
        }
      );
    }

    _mouseDownListener(event: SyntheticMouseEvent<>) {
      event.stopPropagation();
      event.preventDefault();

      window.addEventListener('mousemove', this._mouseMoveListener, true);
      window.addEventListener('mouseup', this._mouseUpListener, true);
    }

    _mouseMoveListener(event: MouseEvent) {
      event.stopPropagation();
      event.preventDefault();

      let { dragX, dragY } = this.state;
      if (!this.state.isDragging) {
        dragX = event.clientX;
        dragY = event.clientY;
      }

      const offsetX = event.clientX - dragX;
      const offsetY = event.clientY - dragY;

      this.setState({
        dragX: event.clientX,
        dragY: event.clientY,
        isDragging: true,
      });

      this.moveViewport(offsetX, offsetY);
    }

    moveViewport(offsetX: CssPixels, offsetY: CssPixels): void {
      const {
        viewportProps: {
          maxViewportHeight,
          timeRange,
          startsAtBottom,
          disableHorizontalMovement,
        },
      } = this.props;
      const { containerWidth, containerHeight, viewportTop } = this.state;

      // Calculate top and bottom in terms of pixels.
      let newViewportTop: CssPixels = viewportTop - offsetY;
      let newViewportBottom: CssPixels = newViewportTop + containerHeight;

      if (maxViewportHeight < containerHeight) {
        // If the view is extra small, anchor content to the top or bottom.
        if (startsAtBottom) {
          newViewportTop = maxViewportHeight - containerHeight;
          newViewportBottom = maxViewportHeight;
        } else {
          newViewportTop = 0;
          newViewportBottom = containerHeight;
        }
      } else if (newViewportBottom > maxViewportHeight) {
        // Constrain the viewport to the bottom.
        newViewportTop = maxViewportHeight - containerHeight;
        newViewportBottom = maxViewportHeight;
      } else if (newViewportTop < 0) {
        // Constrain the viewport to the top.
        newViewportTop = 0;
        newViewportBottom = containerHeight;
      }

      if (newViewportTop !== viewportTop) {
        this.setState({
          viewportTop: newViewportTop,
          viewportBottom: newViewportBottom,
        });
      }

      if (!disableHorizontalMovement) {
        this._updateProfileSelectionFromHorizontalViewportAsync(
          ({ viewportLeft, viewportRight }) => {
            // Calculate left and right in terms of the unit interval of the profile range.
            const viewportLength = viewportRight - viewportLeft;
            if (viewportLength >= 1) {
              return {
                hasSelection: false,
                isModifying: false,
              };
            }
            const unitOffsetX = viewportLength * offsetX / containerWidth;
            let newViewportLeft = viewportLeft - unitOffsetX;
            let newViewportRight = viewportRight - unitOffsetX;
            if (newViewportLeft < 0) {
              newViewportLeft = 0;
              newViewportRight = viewportLength;
            }
            if (newViewportRight > 1) {
              newViewportLeft = 1 - viewportLength;
              newViewportRight = 1;
            }

            const timeRangeLength = timeRange.end - timeRange.start;
            return {
              hasSelection: true,
              isModifying: false,
              selectionStart:
                timeRange.start + timeRangeLength * newViewportLeft,
              selectionEnd:
                timeRange.start + timeRangeLength * newViewportRight,
            };
          }
        );
      }
    }

    _mouseUpListener(event: MouseEvent) {
      event.stopPropagation();
      event.preventDefault();
      window.removeEventListener('mousemove', this._mouseMoveListener, true);
      window.removeEventListener('mouseup', this._mouseUpListener, true);
      this.setState({
        isDragging: false,
      });
    }

    componentDidMount() {
      window.addEventListener('resize', this._setSizeNextFrame, false);
      // The first _setSize ensures that the screen does not blip when mounting
      // the component, while the second ensures that it lays out correctly if the DOM
      // is not fully layed out correctly yet.
      this._setSize();
      this._setSizeNextFrame();
    }

    componentWillUnmount() {
      window.removeEventListener('resize', this._setSizeNextFrame, false);
      window.removeEventListener('mousemove', this._mouseMoveListener, true);
      window.removeEventListener('mouseup', this._mouseUpListener, true);
    }

    render() {
      const { chartProps, hasZoomedViaMousewheel } = this.props;

      const {
        containerWidth,
        containerHeight,
        viewportTop,
        viewportBottom,
        horizontalViewport: { viewportLeft, viewportRight },
        isDragging,
        isShiftScrollHintVisible,
        isSizeSet,
      } = this.state;

      const viewportClassName = classNames({
        chartViewport: true,
        dragging: isDragging,
      });

      const shiftScrollClassName = classNames({
        chartViewportShiftScroll: true,
        hidden: hasZoomedViaMousewheel || !isShiftScrollHintVisible,
      });

      const viewport: Viewport = {
        containerWidth,
        containerHeight,
        viewportLeft,
        viewportRight,
        viewportTop,
        viewportBottom,
        isDragging,
        moveViewport: this.moveViewport,
        isSizeSet,
      };

      return (
        <div
          className={viewportClassName}
          onWheel={this._mouseWheelListener}
          onMouseDown={this._mouseDownListener}
          ref={this._takeContainerRef}
        >
          <ChartComponent {...chartProps} viewport={viewport} />
          <div className={shiftScrollClassName}>
            Zoom Chart:
            <kbd className="chartViewportShiftScrollKbd">Shift</kbd>
            <kbd className="chartViewportShiftScrollKbd">Scroll</kbd>
          </div>
        </div>
      );
    }
  }

  // Connect this component so that it knows whether or not to nag the user to use shift
  // for zooming on range selections.
  const options: ExplicitConnectOptions<
    ViewportOwnProps<ChartOwnProps>,
    ViewportStateProps,
    ViewportDispatchProps
  > = {
    mapStateToProps: state => ({
      hasZoomedViaMousewheel: getHasZoomedViaMousewheel(state),
    }),
    mapDispatchToProps: { setHasZoomedViaMousewheel, updateProfileSelection },
    component: ChartViewport,
  };
  return explicitConnect(options);
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
  event: SyntheticWheelEvent<>,
  pageHeight: number,
  key: 'deltaY' | 'deltaX'
): CssPixels {
  const delta = key === 'deltaY' ? event.deltaY : event.deltaX;
  switch (event.deltaMode) {
    case DOM_DELTA_PAGE:
      return delta * pageHeight;
    case DOM_DELTA_LINE:
      return delta * SCROLL_LINE_SIZE;
    default:
  }
  // Scroll by pixel.
  return delta;
}
