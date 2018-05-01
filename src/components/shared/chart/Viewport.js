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
  +moveViewport: (CssPixels, CssPixels) => boolean,
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

type State = {|
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
  isShiftScrollHintVisible: boolean,
|};

require('./Viewport.css');

/**
 * This is the type signature for the higher order component. It's easier to use generics
 * by separating out the type definition.
 */
export type WithChartViewport<
  ChartOwnProps: Object,
  // The chart component's props are given the viewport object, as well as the original
  // ChartOwnProps.
  ChartProps: $ReadOnly<{|
    ...ChartOwnProps,
    viewport: Viewport,
  |}>
> = (
  // Take as input the component class that supports the the ViewportProps. The ChartProps
  // also contain other things.
  ChartComponent: React.ComponentType<ChartProps>
) => React.ComponentType<
  // Finally the returned component takes as input the InternalViewportProps, and
  // the ChartProps, but NOT the ViewportProps.
  ViewportOwnProps<ChartOwnProps>
>;

// Create the implementation of the WithChartViewport type, but let flow infer the
// generic parameters.
export const withChartViewport: WithChartViewport<*, *> =
  // ChartOwnProps is the only generic actually used in the implementation. Infer
  // the type signature of the arguments as the WithChartViewport will apply them.
  <ChartOwnProps>(
    ChartComponent: React.ComponentType<$Subtype<{ +viewport: Viewport }>>
  ): * => {
    type ViewportProps = ConnectedProps<
      ViewportOwnProps<ChartOwnProps>,
      ViewportStateProps,
      ViewportDispatchProps
    >;

    class ChartViewport extends React.PureComponent<ViewportProps, State> {
      shiftScrollId: number;
      zoomRangeSelectionScheduled: boolean;
      zoomRangeSelectionScrollDelta: number;
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
        this.zoomRangeSelectionScheduled = false;
        this.zoomRangeSelectionScrollDelta = 0;
        this._container = null;

        this.state = this.getDefaultState(props);
      }

      getHorizontalViewport(props: ViewportProps) {
        const { selection, timeRange } = props.viewportProps;
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
        const { viewportLeft, viewportRight } = this.getHorizontalViewport(
          props
        );
        const { startsAtBottom, maxViewportHeight } = props.viewportProps;
        return {
          containerWidth: 0,
          containerHeight: 0,
          containerLeft: 0,
          viewportTop: 0,
          viewportBottom: startsAtBottom ? maxViewportHeight : 0,
          viewportLeft,
          viewportRight,
          dragX: 0,
          dragY: 0,
          isDragging: false,
          isShiftScrollHintVisible: false,
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
          this.props.viewportProps.timeRange !==
            newProps.viewportProps.timeRange
        ) {
          this.setState(this.getHorizontalViewport(newProps));
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
            }));
          }
        }
      }

      _setSizeNextFrame() {
        requestAnimationFrame(this._setSize);
      }

      _mouseWheelListener(event: SyntheticWheelEvent<>) {
        const { disableHorizontalMovement } = this.props.viewportProps;
        if (event.shiftKey) {
          event.preventDefault();
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

      zoomRangeSelection(event: SyntheticWheelEvent<>) {
        const {
          hasZoomedViaMousewheel,
          setHasZoomedViaMousewheel,
        } = this.props;
        if (!hasZoomedViaMousewheel && setHasZoomedViaMousewheel) {
          setHasZoomedViaMousewheel();
        }

        // Shift is a modifier that will change some mice to scroll horizontally, check
        // for that here.
        const deltaKey = event.deltaY === 0 ? 'deltaX' : 'deltaY';

        // Accumulate the scroll delta here. Only apply it once per frame to avoid
        // spamming the Redux store with updates.
        this.zoomRangeSelectionScrollDelta += getNormalizedScrollDelta(
          event,
          this.state.containerHeight,
          deltaKey
        );

        // See if an update needs to be scheduled.
        if (!this.zoomRangeSelectionScheduled) {
          const mouseX = event.clientX;
          this.zoomRangeSelectionScheduled = true;
          requestAnimationFrame(() => {
            // Grab and reset the scroll delta accumulated up until this frame.
            // Let another frame be scheduled.
            const deltaY = this.zoomRangeSelectionScrollDelta;
            this.zoomRangeSelectionScrollDelta = 0;
            this.zoomRangeSelectionScheduled = false;

            const { maximumZoom } = this.props.viewportProps;
            const {
              containerLeft,
              containerWidth,
              viewportLeft,
              viewportRight,
            } = this.state;
            const mouseCenter = (mouseX - containerLeft) / containerWidth;

            const viewportLength: CssPixels = viewportRight - viewportLeft;
            const scale =
              viewportLength - viewportLength / (1 + deltaY * 0.001);
            let newViewportLeft: UnitIntervalOfProfileRange = clamp(
              0,
              1,
              viewportLeft - scale * mouseCenter
            );
            let newViewportRight: UnitIntervalOfProfileRange = clamp(
              0,
              1,
              viewportRight + scale * (1 - mouseCenter)
            );

            if (newViewportRight - newViewportLeft < maximumZoom) {
              const newViewportMiddle = (viewportLeft + viewportRight) * 0.5;
              newViewportLeft = newViewportMiddle - maximumZoom * 0.5;
              newViewportRight = newViewportMiddle + maximumZoom * 0.5;
            }

            const {
              updateProfileSelection,
              viewportProps: { timeRange },
            } = this.props;
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
                selectionStart:
                  timeRange.start + timeRangeLength * newViewportLeft,
                selectionEnd:
                  timeRange.start + timeRangeLength * newViewportRight,
              });
            }
          });
        }
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

      moveViewport(offsetX: CssPixels, offsetY: CssPixels): boolean {
        const {
          updateProfileSelection,
          viewportProps: {
            maxViewportHeight,
            timeRange,
            startsAtBottom,
            disableHorizontalMovement,
          },
        } = this.props;
        const {
          containerWidth,
          containerHeight,
          viewportTop,
          viewportLeft,
          viewportRight,
        } = this.state;

        // Calculate left and right in terms of the unit interval of the profile range.
        const viewportLength: CssPixels = viewportRight - viewportLeft;
        const unitOffsetX: UnitIntervalOfProfileRange =
          viewportLength * offsetX / containerWidth;
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

        const timeRangeLength = timeRange.end - timeRange.start;
        const viewportHorizontalChanged = newViewportLeft !== viewportLeft;
        const viewportVerticalChanged = newViewportTop !== viewportTop;

        if (viewportHorizontalChanged && !disableHorizontalMovement) {
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
          viewportLeft,
          viewportRight,
          isDragging,
          isShiftScrollHintVisible,
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
  };

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
