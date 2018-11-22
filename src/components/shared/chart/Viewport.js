/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import explicitConnect from '../../../utils/connect';
import {
  getHasZoomedViaMousewheel,
  getPanelLayoutGeneration,
} from '../../../reducers/app';
import { setHasZoomedViaMousewheel } from '../../../actions/stack-chart';
import { updatePreviewSelection } from '../../../actions/profile-view';

import type {
  CssPixels,
  UnitIntervalOfProfileRange,
  StartEndRange,
} from '../../../types/units';
import type { PreviewSelection } from '../../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../../utils/connect';
import {
  getObjectValuesAsUnion,
  assertExhaustiveCheck,
} from '../../../utils/flow';

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

/**
 * How fast the viewport should move when navigating with the keyboard
 * in pixels per second.
 */
const KEYBOARD_NAVIGATION_SPEED = 2000;
const MAX_KEYBOARD_DELTA = 500;

type NavigationKey = 'zoomIn' | 'zoomOut' | 'up' | 'down' | 'left' | 'right';

/**
 * Mapping from keycode to navigation key when no modifiers are down.
 */
const BARE_KEYMAP: { [string]: NavigationKey } = {
  KeyQ: 'zoomIn',
  KeyY: 'zoomIn',
  KeyE: 'zoomOut',
  KeyU: 'zoomOut',
  KeyW: 'up',
  KeyK: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  KeyJ: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  KeyH: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  KeyL: 'right',
  ArrowRight: 'right',
};
/**
 * Mapping from keycode to navigation key when the ctrl modifier is down.
 */
const CTRL_KEYMAP: { [string]: NavigationKey } = {
  ArrowUp: 'zoomIn',
  ArrowDown: 'zoomOut',
};

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
  +panelLayoutGeneration: number,
  +hasZoomedViaMousewheel?: boolean,
|};

type ViewportDispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
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
    +previewSelection: PreviewSelection,
    +disableHorizontalMovement?: boolean,
    +className?: string,
    +marginLeft: CssPixels,
    +marginRight: CssPixels,
    +containerRef?: (HTMLDivElement | null) => void,
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
  // Take as input a React component whose props accept the { +viewport: Viewport }.
  ChartComponent: React.ComponentType<ChartProps>
) => React.ComponentType<
  // Finally the returned component takes as input the InternalViewportProps, and
  // the ChartProps, but NOT { +viewport: Viewport }.
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
      shiftScrollId: number = 0;
      _pendingPreviewSelectionUpdates: Array<
        (HorizontalViewport) => PreviewSelection
      > = [];
      _container: HTMLElement | null = null;
      _takeContainerRef = container => {
        if (this.props.viewportProps.containerRef) {
          this.props.viewportProps.containerRef(container);
        }
        this._container = container;
      };
      _lastKeyboardNavigationFrame: number = 0;
      _keysDown: Set<NavigationKey> = new Set();
      _deltaToZoomFactor = delta => Math.pow(1.0009, delta);

      constructor(props: ViewportProps) {
        super(props);
        this.state = this.getDefaultState(props);
      }

      getHorizontalViewport(
        previewSelection: PreviewSelection,
        timeRange: StartEndRange
      ) {
        if (previewSelection.hasSelection) {
          const { selectionStart, selectionEnd } = previewSelection;
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
        const { previewSelection, timeRange } = props.viewportProps;
        const horizontalViewport = this.getHorizontalViewport(
          previewSelection,
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
          this.props.viewportProps.previewSelection !==
            newProps.viewportProps.previewSelection ||
          this.props.viewportProps.timeRange !==
            newProps.viewportProps.timeRange
        ) {
          const { previewSelection, timeRange } = newProps.viewportProps;
          const horizontalViewport = this.getHorizontalViewport(
            previewSelection,
            timeRange
          );
          this.setState({
            horizontalViewport,
          });
        } else if (
          this.props.panelLayoutGeneration !== newProps.panelLayoutGeneration
        ) {
          this._setSizeNextFrame();
        }
      }

      _setSize = () => {
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
      };

      _setSizeNextFrame = () => {
        requestAnimationFrame(this._setSize);
      };

      _mouseWheelListener = (event: SyntheticWheelEvent<>) => {
        // We handle the wheel event, so disable the browser's handling, such
        // as back/forward swiping or scrolling.
        event.preventDefault();

        const { disableHorizontalMovement } = this.props.viewportProps;
        if (event.shiftKey) {
          if (!disableHorizontalMovement) {
            this.zoomWithMouseWheel(event);
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
      };

      /**
       * Add a batched update to the preview selection.
       *
       * This method works asynchronously in order to avoid spamming the redux store
       * with updates (which cause synchronous react renders) in response to mouse events.
       * The actual redux update happens in _flushPendingPreviewSelectionUpdates(), which
       * processes all queued updates from a requestAnimationFrame callback.
       */
      _addBatchedPreviewSelectionUpdate(
        callback: HorizontalViewport => PreviewSelection
      ) {
        if (this._pendingPreviewSelectionUpdates.length === 0) {
          requestAnimationFrame(() =>
            this._flushPendingPreviewSelectionUpdates()
          );
        }
        this._pendingPreviewSelectionUpdates.push(callback);
      }

      /**
       * Flush all batched preview selection updates at once, with only a single
       * call to update the Redux store.
       */
      _flushPendingPreviewSelectionUpdates() {
        if (this._pendingPreviewSelectionUpdates.length !== 0) {
          const pendingUpdates = this._pendingPreviewSelectionUpdates;
          this._pendingPreviewSelectionUpdates = [];
          const {
            updatePreviewSelection,
            viewportProps: { previewSelection, timeRange },
          } = this.props;
          let nextSelection = previewSelection;
          for (const callback of pendingUpdates) {
            const horizontalViewport = this.getHorizontalViewport(
              nextSelection,
              timeRange
            );
            nextSelection = callback(horizontalViewport);
          }
          updatePreviewSelection(nextSelection);
        }
      }

      zoomWithMouseWheel(event: SyntheticWheelEvent<>) {
        const {
          hasZoomedViaMousewheel,
          setHasZoomedViaMousewheel,
          viewportProps: { marginLeft, marginRight },
        } = this.props;
        if (!hasZoomedViaMousewheel && setHasZoomedViaMousewheel) {
          setHasZoomedViaMousewheel();
        }

        const deltaY = getNormalizedScrollDelta(
          event,
          this.state.containerHeight,
          // Shift is a modifier that will change some mice to scroll horizontally, check
          // for that here.
          event.deltaY === 0 ? 'deltaX' : 'deltaY'
        );
        const zoomFactor = this._deltaToZoomFactor(deltaY);

        const mouseX = event.clientX;
        const { containerLeft, containerWidth } = this.state;
        const innerContainerWidth = containerWidth - marginLeft - marginRight;
        const mouseCenter =
          (mouseX - containerLeft - marginLeft) / innerContainerWidth;
        this.zoomRangeSelection(mouseCenter, zoomFactor);
      }

      zoomRangeSelection = (center, zoomFactor) => {
        const {
          disableHorizontalMovement,
          maximumZoom,
        } = this.props.viewportProps;
        if (disableHorizontalMovement) {
          return;
        }

        this._addBatchedPreviewSelectionUpdate(
          ({ viewportLeft, viewportRight }) => {
            const viewportLength = viewportRight - viewportLeft;
            const newViewportLength = clamp(
              maximumZoom,
              1,
              viewportLength * zoomFactor
            );
            const deltaViewportLength = newViewportLength - viewportLength;
            const newViewportLeft = clamp(
              0,
              1 - newViewportLength,
              viewportLeft - deltaViewportLength * center
            );
            const newViewportRight = clamp(
              newViewportLength,
              1,
              viewportRight + deltaViewportLength * (1 - center)
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
              selectionStart:
                timeRange.start + timeRangeLength * newViewportLeft,
              selectionEnd:
                timeRange.start + timeRangeLength * newViewportRight,
            };
          }
        );
      };

      _mouseDownListener = (event: SyntheticMouseEvent<>) => {
        event.preventDefault();
        if (this._container) {
          this._container.focus();
        }

        window.addEventListener('mousemove', this._mouseMoveListener, true);
        window.addEventListener('mouseup', this._mouseUpListener, true);
      };

      _mouseMoveListener = (event: MouseEvent) => {
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
      };

      _keyDownListener = (
        event: { nativeEvent: KeyboardEvent } & SyntheticKeyboardEvent<>
      ) => {
        let navigationKey;
        if (
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey &&
          !event.metaKey
        ) {
          navigationKey = BARE_KEYMAP[event.nativeEvent.code];
        } else if (event.ctrlKey) {
          /* Having the ctrl key down changes the meaning of the key
           * it's modifying, so pick the navigation key from another keymap. */
          navigationKey = CTRL_KEYMAP[event.nativeEvent.code];
        }

        if (navigationKey !== undefined) {
          // Start requesting frames if there were no keys down before
          // this event triggered.
          if (this._keysDown.size === 0) {
            requestAnimationFrame(this._keyboardNavigation);
            this._lastKeyboardNavigationFrame = performance.now();
          }

          this._keysDown.add(navigationKey);
          event.preventDefault();
        }
      };

      _keyUpListener = (
        event: { nativeEvent: KeyboardEvent } & SyntheticKeyboardEvent<>
      ) => {
        if (!event.ctrlKey) {
          // The ctrl modifier might have been released here. Try to
          // delete all keys associated with the modifier. Since the
          // navigation is aliased with non-ctrl-modified keys also,
          // this will affect (stop) the operation even if it was
          // introduced without a ctrl-modified key.
          for (const code of getObjectValuesAsUnion(CTRL_KEYMAP)) {
            this._keysDown.delete(code);
          }
        }
        this._keysDown.delete(CTRL_KEYMAP[event.nativeEvent.code]);
        this._keysDown.delete(BARE_KEYMAP[event.nativeEvent.code]);
      };

      _keyboardNavigation = timestamp => {
        if (this._keysDown.size === 0) {
          // No keys are down, nothing to do.  Don't request a new
          // animation frame.
          return;
        }

        const delta = Math.min(
          KEYBOARD_NAVIGATION_SPEED *
            (timestamp - this._lastKeyboardNavigationFrame) *
            0.001,
          MAX_KEYBOARD_DELTA // Don't jump like crazy if we experience long janks
        );
        this._lastKeyboardNavigationFrame = timestamp;

        for (const navigationKey of this._keysDown.values()) {
          switch (navigationKey) {
            case 'zoomIn':
              this.zoomRangeSelection(0.5, this._deltaToZoomFactor(-delta));
              break;
            case 'zoomOut':
              this.zoomRangeSelection(0.5, this._deltaToZoomFactor(delta));
              break;
            case 'up':
              this.moveViewport(0, delta);
              break;
            case 'down':
              this.moveViewport(0, -delta);
              break;
            case 'left':
              this.moveViewport(delta, 0);
              break;
            case 'right':
              this.moveViewport(-delta, 0);
              break;
            default:
              throw assertExhaustiveCheck(navigationKey);
          }
        }
        requestAnimationFrame(this._keyboardNavigation);
      };

      moveViewport = (offsetX: CssPixels, offsetY: CssPixels): void => {
        const {
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
          isSizeSet,
        } = this.state;

        if (!isSizeSet) {
          // Moving the viewport and calculating its dimensions
          // assumes its size is actually set. Just ignore the move
          // request if it's not.
          return;
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

        if (newViewportTop !== viewportTop) {
          this.setState({
            viewportTop: newViewportTop,
            viewportBottom: newViewportBottom,
          });
        }

        if (!disableHorizontalMovement) {
          this._addBatchedPreviewSelectionUpdate(
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
      };

      _mouseUpListener = (event: MouseEvent) => {
        event.preventDefault();
        window.removeEventListener('mousemove', this._mouseMoveListener, true);
        window.removeEventListener('mouseup', this._mouseUpListener, true);
        this.setState({
          isDragging: false,
        });
      };

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
        const {
          chartProps,
          hasZoomedViaMousewheel,
          viewportProps: { className },
        } = this.props;

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

        const viewportClassName = classNames(
          {
            chartViewport: true,
            dragging: isDragging,
          },
          className
        );

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
            onKeyDown={this._keyDownListener}
            onKeyUp={this._keyUpListener}
            ref={this._takeContainerRef}
            tabIndex={0}
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
        panelLayoutGeneration: getPanelLayoutGeneration(state),
        hasZoomedViaMousewheel: getHasZoomedViaMousewheel(state),
      }),
      mapDispatchToProps: { setHasZoomedViaMousewheel, updatePreviewSelection },
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
