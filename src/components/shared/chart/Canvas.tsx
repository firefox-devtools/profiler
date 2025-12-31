/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { timeCode } from 'firefox-profiler/utils/time-code';
import classNames from 'classnames';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';

import type { CssPixels, DevicePixels } from 'firefox-profiler/types';

type Props<Item> = {
  readonly containerWidth: CssPixels;
  readonly containerHeight: CssPixels;
  readonly className: string;
  readonly onSelectItem?: (param: Item | null) => void;
  readonly onRightClick?: (param: Item | null) => void;
  readonly onDoubleClickItem: (param: Item | null) => void;
  readonly getHoveredItemInfo: (param: Item) => React.ReactNode;
  readonly drawCanvas: (
    ctx: CanvasRenderingContext2D,
    ChartCanvasScale: ChartCanvasScale,
    ChartCanvasHoverInfo: ChartCanvasHoverInfo<Item>
  ) => void;
  readonly isDragging: boolean;
  // Applies ctx.scale() to the canvas to draw using CssPixels rather than DevicePixels.
  readonly scaleCtxToCssPixels: boolean;
  readonly hitTest: (x: CssPixels, y: CssPixels) => Item | null;
  // Default to true. Set to false if the chart should be redrawn right away after
  // rerender.
  readonly drawCanvasAfterRaf?: boolean;

  readonly onMouseMove?: (e: { nativeEvent: MouseEvent }) => unknown;
  readonly onMouseLeave?: (e: { nativeEvent: MouseEvent }) => unknown;
  // Defaults to false. Set to true if the chart should persist the tooltips on click.
  readonly stickyTooltips?: boolean;
};

// The naming of the X and Y coordinates here correspond to the ones
// found on the MouseEvent interface.
type State<Item> = {
  hoveredItem: Item | null;
  selectedItem: Item | null;
  pageX: CssPixels;
  pageY: CssPixels;
};

export type ChartCanvasScale = {
  // Always equal to devicePixelRatio
  cssToDeviceScale: number;
  // 1 if scaleCtxToCssPixels is true, otherwise equal to cssToDeviceScale
  cssToUserScale: number;
};

export type ChartCanvasHoverInfo<Item> = {
  hoveredItem: Item | null;
  prevHoveredItem: Item | null;
  isHoveredOnlyDifferent: boolean;
};

import './Canvas.css';

/**
 * The maximum amount of movement in either direction between the
 * mouse down and mouse up event for it to be interpreted as a
 * item-selecting click. We cannot use a real click event as a trigger
 * for selecting items because then a long dragging movement of the
 * viewport would still select items when the mouse button is
 * released. On the other hand, for accessibility reasons we want a
 * small amount of movement between mouse down and up to be okay.
 */
const MOUSE_CLICK_MAX_MOVEMENT_DELTA: CssPixels = 5;

// This isn't a PureComponent on purpose: we always want to update if the parent updates
// But we still conditionally update the canvas itself, see componentDidUpdate.
export class ChartCanvas<Item> extends React.Component<
  Props<Item>,
  State<Item>
> {
  _devicePixelRatio: number = 1;
  // The current mouse position. Needs to be stored for tooltip
  // hit-test if props update.
  _offsetX: CssPixels = 0;
  _offsetY: CssPixels = 0;
  // The position of the most recent mouse down event. Needed for
  // comparison with the current mouse position in order to
  // distinguish between clicks and drags.
  _mouseDownOffsetX: CssPixels = 0;
  _mouseDownOffsetY: CssPixels = 0;
  // Indicates if move threshold breached. Checked at mouse up event
  // to prevent it from being interpreted as a click.
  _mouseMovedWhileClicked: boolean = false;
  _ctx: CanvasRenderingContext2D | null = null;
  _canvas: HTMLCanvasElement | null = null;
  _isDrawScheduled: boolean = false;

  override state: State<Item> = {
    hoveredItem: null,
    selectedItem: null,
    pageX: 0,
    pageY: 0,
  };

  _scheduleDraw(
    isHoveredOnlyDifferent: boolean = false,
    prevHoveredItem: Item | null = null
  ) {
    const { drawCanvasAfterRaf } = this.props;
    if (drawCanvasAfterRaf === false) {
      // The behavior of waiting for a rAF has been explicitely  disabled.
      this._doDrawCanvas(isHoveredOnlyDifferent, prevHoveredItem);
      return;
    }

    if (this._isDrawScheduled) {
      return;
    }
    this._isDrawScheduled = true;
    window.requestAnimationFrame(() => {
      this._isDrawScheduled = false;
      this._doDrawCanvas(isHoveredOnlyDifferent, prevHoveredItem);
    });
  }

  _prepCanvas(): CanvasRenderingContext2D | null {
    const canvas = this._canvas;
    const { containerWidth, containerHeight, scaleCtxToCssPixels } = this.props;
    const { devicePixelRatio } = window;

    if (!canvas) {
      return null;
    }

    let ctx = this._ctx;
    if (!ctx) {
      ctx = canvas.getContext('2d', { alpha: false })!;
      this._ctx = ctx;
    }

    // The DevicePixels for the canvas are integers, but the CSS styles use float values.
    // Use the "floor" function to make sure we assign the device pixel values how we
    // expect.
    const devicePixelWidth: DevicePixels = Math.floor(
      containerWidth * devicePixelRatio
    );
    const devicePixelHeight: DevicePixels = Math.floor(
      containerHeight * devicePixelRatio
    );

    if (
      canvas.width !== devicePixelWidth ||
      canvas.height !== devicePixelHeight
    ) {
      // The canvas needs to be sized to the container.
      canvas.width = devicePixelWidth;
      canvas.height = devicePixelHeight;
      // Set the CSS width depending on the actual values of canvas.width and height.
      // They can be float values depending on the value of devicePixelRatio.
      canvas.style.width = canvas.width / devicePixelRatio + 'px';
      canvas.style.height = canvas.height / devicePixelRatio + 'px';
      if (scaleCtxToCssPixels) {
        ctx.scale(this._devicePixelRatio, this._devicePixelRatio);
      }
    }

    if (this._devicePixelRatio !== devicePixelRatio) {
      if (scaleCtxToCssPixels) {
        // Make sure and multiply by the inverse of the previous ratio, as the scaling
        // operates off of the previous set scale.
        const scale = (1 / this._devicePixelRatio) * devicePixelRatio;
        ctx.scale(scale, scale);
      }
      this._devicePixelRatio = devicePixelRatio;
    }

    return ctx;
  }

  _doDrawCanvas(
    isHoveredOnlyDifferent: boolean = false,
    prevHoveredItem: Item | null = null
  ) {
    const { className, drawCanvas, scaleCtxToCssPixels } = this.props;
    const { hoveredItem } = this.state;
    timeCode(`${className} render`, () => {
      const ctx = this._prepCanvas();
      if (ctx !== null) {
        const scale = this._devicePixelRatio;
        drawCanvas(
          ctx,
          {
            cssToDeviceScale: scale,
            cssToUserScale: scaleCtxToCssPixels ? 1 : scale,
          },
          {
            hoveredItem,
            prevHoveredItem,
            isHoveredOnlyDifferent,
          }
        );
      }
    });
  }

  _onMouseDown = (
    e: { nativeEvent: MouseEvent } & React.MouseEvent<HTMLElement>
  ) => {
    if (e.button === 0) {
      // Remember where the mouse was positioned. Move too far and it
      // won't be registered as a selecting click on mouse up.
      this._mouseDownOffsetX = e.nativeEvent.offsetX;
      this._mouseDownOffsetY = e.nativeEvent.offsetY;
      this._mouseMovedWhileClicked = false;
    }

    if (e.button === 2 && this.props.onRightClick) {
      // The right button is a contextual action.
      // It is important that we call the right click callback at mousedown so
      // that the state is updated and the context menus are rendered before the
      // contextmenu events.
      this.props.onRightClick(this.state.hoveredItem);
    }
  };

  _onClick = (e: React.MouseEvent<HTMLElement>) => {
    if (this._mouseMovedWhileClicked) {
      return;
    }
    const { onSelectItem } = this.props;
    if (e.button === 0 && onSelectItem) {
      // Left button is a selection action
      if (this.props.stickyTooltips) {
        this.setState((state) => ({
          selectedItem: state.hoveredItem,
          pageX: e.pageX,
          pageY: e.pageY,
        }));
      }

      onSelectItem(this.state.hoveredItem);
    }
  };

  _onMouseLeave = (
    event: { nativeEvent: MouseEvent } & React.MouseEvent<HTMLElement>
  ) => {
    if (this.props.onMouseLeave) {
      this.props.onMouseLeave(event);
    }
  };

  _onMouseMove = (
    event: { nativeEvent: MouseEvent } & React.MouseEvent<HTMLElement>
  ) => {
    if (!this._canvas) {
      return;
    }

    if (this.props.onMouseMove) {
      this.props.onMouseMove(event);
    }

    this._offsetX = event.nativeEvent.offsetX;
    this._offsetY = event.nativeEvent.offsetY;
    // event.buttons is a bitfield representing which buttons are pressed at the
    // time of the mousemove event. The first bit is for the left click.
    // This operation checks if the left button is clicked, but this will also
    // be true if any other button is clickes as well.
    const hasLeftClick = (event.buttons & 1) !== 0;

    // If the mouse moves too far while the primary button is down, flag this as
    // drag event only. Then it won't select anything when the button is
    // released.
    if (
      !this._mouseMovedWhileClicked &&
      hasLeftClick &&
      (Math.abs(this._offsetX - this._mouseDownOffsetX) >
        MOUSE_CLICK_MAX_MOVEMENT_DELTA ||
        Math.abs(this._offsetY - this._mouseDownOffsetY) >
          MOUSE_CLICK_MAX_MOVEMENT_DELTA)
    ) {
      this._mouseMovedWhileClicked = true;
    }

    const maybeHoveredItem = this.props.hitTest(this._offsetX, this._offsetY);
    if (maybeHoveredItem !== null) {
      if (this.state.selectedItem === null) {
        // Update both the hovered item and the pageX and pageY values. The
        // pageX and pageY values are used to change the position of the tooltip
        // and if there is no selected item, it means that we can update this
        // position freely.
        this.setState({
          hoveredItem: maybeHoveredItem,
          pageX: event.pageX,
          pageY: event.pageY,
        });
      } else {
        // If there is a selected item, only update the hoveredItem and not the
        // pageX and pageY values which is used for the position of the tooltip.
        // By keeping the x and y values the same, we make sure that the tooltip
        // stays in its initial position where it's clicked.
        this.setState({
          hoveredItem: maybeHoveredItem,
        });
      }
    } else if (
      this.state.hoveredItem !== null &&
      // This persistTooltips property is part of the web console API. It helps
      // in being able to inspect and debug tooltips.
      !window.persistTooltips
    ) {
      this.setState({
        hoveredItem: null,
      });
    }
  };

  _onMouseOut = () => {
    if (
      this.state.hoveredItem !== null &&
      // This persistTooltips property is part of the web console API. It helps
      // in being able to inspect and debug tooltips.
      !window.persistTooltips
    ) {
      this.setState({ hoveredItem: null });
    }
  };

  _onDoubleClick = () => {
    this.props.onDoubleClickItem(this.state.hoveredItem);
  };

  _getHoveredItemInfo = (): React.ReactNode => {
    const { hoveredItem, selectedItem } = this.state;
    if (selectedItem !== null) {
      // If we have a selected item, persist that one instead of returning
      // the hovered items.
      return this.props.getHoveredItemInfo(selectedItem);
    }

    // Return the hovered item if we don't have a selected item.
    if (hoveredItem === null) {
      return null;
    }
    return this.props.getHoveredItemInfo(hoveredItem);
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  override UNSAFE_componentWillReceiveProps() {
    // It is possible that the data backing the chart has been
    // changed, for instance after symbolication. Clear the
    // hoveredItem if the mouse no longer hovers over it.
    const { hoveredItem } = this.state;
    if (
      hoveredItem !== null &&
      !hoveredItemsAreEqual(
        this.props.hitTest(this._offsetX, this._offsetY),
        hoveredItem
      )
    ) {
      this.setState({ hoveredItem: null });
    }
  }

  override componentDidUpdate(prevProps: Props<Item>, prevState: State<Item>) {
    if (prevProps !== this.props) {
      if (
        this.state.selectedItem !== null &&
        prevState.selectedItem === this.state.selectedItem
      ) {
        // The props have changed but not the selectedItem. Check if it's still valid
        // by attempting to get its info. If it returns null, the item is no longer
        // valid (e.g., filtered out).
        const info = this.props.getHoveredItemInfo(this.state.selectedItem);
        if (info === null) {
          this.setState({ selectedItem: null });
        }
      }

      if (
        this._canvas &&
        this._canvas.width !== 0 &&
        this.props.containerWidth === 0
      ) {
        // This is a temporary default state triggered by Viewport,
        // for the viewportNeedsUpdate condition.
        //
        // Another setState call with the updated containerWidth/containerHeight
        // will be performed and componentDidUpdate will be called again.
        // We should ignore this update, in order to avoid an unnecessary flash.
        return;
      }
      this._scheduleDraw();
    } else if (
      !hoveredItemsAreEqual(prevState.hoveredItem, this.state.hoveredItem)
    ) {
      // Only the hovered items changed.
      this._scheduleDraw(true, prevState.hoveredItem);
    }
  }

  override render() {
    const { isDragging } = this.props;
    const { hoveredItem, pageX, pageY } = this.state;

    const className = classNames({
      chartCanvas: true,
      [this.props.className]: true,
      hover: hoveredItem !== null,
    });

    const tooltipContents = this._getHoveredItemInfo();

    return (
      <div>
        <canvas
          className={className}
          ref={this._takeCanvasRef}
          onMouseDown={this._onMouseDown}
          onClick={this._onClick}
          onMouseLeave={this._onMouseLeave}
          onMouseMove={this._onMouseMove}
          onMouseOut={this._onMouseOut}
          onDoubleClick={this._onDoubleClick}
        />
        {!isDragging && tooltipContents ? (
          <Tooltip
            mouseX={pageX}
            mouseY={pageY}
            className={classNames({
              clickable: this.state.selectedItem !== null,
            })}
          >
            {tooltipContents}
          </Tooltip>
        ) : null}
      </div>
    );
  }
}

/**
 * Check for shallow equality for objects, and strict equality for everything else.
 */
function hoveredItemsAreEqual(a: any, b: any) {
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.length !== b.length) {
      return false;
    }
    let hasAllKeys = true;
    for (const aKey in a) {
      let hasKey = false;
      for (const bKey in b) {
        if (aKey === bKey) {
          if (a[aKey] !== b[bKey]) {
            return false;
          }
          hasKey = true;
          break;
        }
      }
      hasAllKeys = hasAllKeys && hasKey;
      if (!hasAllKeys) {
        return false;
      }
    }
    return true;
  }
  return a === b;
}
