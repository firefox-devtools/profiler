/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { timeCode } from '../../../utils/time-code';
import classNames from 'classnames';
import { TOOLTIP_TIMEOUT } from '../../../app-logic/constants';

import type { CssPixels, DevicePixels } from '../../../types/units';

type Props<HoveredItem> = {|
  +containerWidth: CssPixels,
  +containerHeight: CssPixels,
  +className: string,
  +onSelectItem?: (HoveredItem | null) => void,
  +onDoubleClickItem: (HoveredItem | null) => void,
  +drawCanvas: (CanvasRenderingContext2D, HoveredItem | null) => void,
  +isDragging: boolean,
  +hitTest: (x: CssPixels, y: CssPixels) => HoveredItem | null,
  +onHoverChange: (
    x: CssPixels,
    y: CssPixels,
    mouseOverItem: HoveredItem | null
  ) => void,
|};

// The naming of the X and Y coordinates here correspond to the ones
// found on the MouseEvent interface.
type State<HoveredItem> = {
  mouseOverItem: HoveredItem | null,
  // There is a timeout to display a timeout. The displayed value is what's being
  // currently displayed.
  hoveredItemWithTooltip: HoveredItem | null,
};

require('./Canvas.css');

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
export default class ChartCanvas<HoveredItem> extends React.Component<
  Props<HoveredItem>,
  State<HoveredItem>
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
  _ctx: CanvasRenderingContext2D;
  _canvas: HTMLCanvasElement | null = null;
  _isDrawScheduled: boolean = false;
  // Hover happens on a timeout. Ensure that the current hover is the last one
  // by incrementing this value.
  _hoverGeneration: number = 0;

  state: State<HoveredItem> = {
    // The mouse is over an item, but the tooltip may or may not be displayed.
    mouseOverItem: null,
    // The mouse is over and a tooltip is showing.
    hoveredItemWithTooltip: null,
  };

  _scheduleDraw() {
    const { className, drawCanvas } = this.props;
    if (this._isDrawScheduled) {
      return;
    }
    this._isDrawScheduled = true;
    window.requestAnimationFrame(() => {
      this._isDrawScheduled = false;
      if (this._canvas) {
        timeCode(`${className} render`, () => {
          this._prepCanvas();
          console.log(
            '!!! this.state.mouseOverItem',
            this.state.hoveredItemWithTooltip
          );
          drawCanvas(this._ctx, this.state.mouseOverItem);
        });
      }
    });
  }

  _prepCanvas() {
    const canvas = this._canvas;
    const { containerWidth, containerHeight } = this.props;
    const { devicePixelRatio } = window;
    const pixelWidth: DevicePixels = containerWidth * devicePixelRatio;
    const pixelHeight: DevicePixels = containerHeight * devicePixelRatio;
    if (!canvas) {
      return;
    }
    // Satisfy the null check for Flow.
    const ctx = this._ctx || canvas.getContext('2d', { alpha: false });
    if (!this._ctx) {
      this._ctx = ctx;
    }
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      canvas.style.width = containerWidth + 'px';
      canvas.style.height = containerHeight + 'px';
      ctx.scale(this._devicePixelRatio, this._devicePixelRatio);
    }
    if (this._devicePixelRatio !== devicePixelRatio) {
      // Make sure and multiply by the inverse of the previous ratio, as the scaling
      // operates off of the previous set scale.
      const scale = 1 / this._devicePixelRatio * devicePixelRatio;
      ctx.scale(scale, scale);
      this._devicePixelRatio = devicePixelRatio;
    }
  }

  _onMouseDown = (
    event: { nativeEvent: MouseEvent } & SyntheticMouseEvent<>
  ) => {
    // Remember where the mouse was positioned. Move too far and it
    // won't be registered as a selecting click on mouse up.
    this._mouseDownOffsetX = event.nativeEvent.offsetX;
    this._mouseDownOffsetY = event.nativeEvent.offsetY;
    this._mouseMovedWhileClicked = false;
  };

  _onMouseUp = () => {
    if (!this._mouseMovedWhileClicked && this.props.onSelectItem) {
      this.props.onSelectItem(this.state.mouseOverItem);
    }
  };

  _onMouseMove = (
    event: { nativeEvent: MouseEvent } & SyntheticMouseEvent<>
  ) => {
    if (!this._canvas) {
      return;
    }
    const { isDragging, hitTest, onHoverChange } = this.props;

    if (isDragging) {
      if (this.state.mouseOverItem !== null) {
        // When dragging, hide the hover.
        this._hoverGeneration++;
        if (this.state.hoveredItemWithTooltip !== null) {
          onHoverChange(event.pageX, event.pageY, null);
        }
        this.setState({
          mouseOverItem: null,
          hoveredItemWithTooltip: null,
        });
      }
      // Do not hover over anything when dragging.
      return;
    }

    this._offsetX = event.nativeEvent.offsetX;
    this._offsetY = event.nativeEvent.offsetY;
    const maybeHoveredItem = hitTest(this._offsetX, this._offsetY);

    // If the mouse moves too far while a button down, flag this as
    // drag event only. Then it won't select anything when the button
    // is released.
    if (
      !this._mouseMovedWhileClicked &&
      event.buttons !== 0 &&
      (Math.abs(this._offsetX - this._mouseDownOffsetX) >
        MOUSE_CLICK_MAX_MOVEMENT_DELTA ||
        Math.abs(this._offsetY - this._mouseDownOffsetY) >
          MOUSE_CLICK_MAX_MOVEMENT_DELTA)
    ) {
      this._mouseMovedWhileClicked = true;
    }

    if (maybeHoveredItem !== null) {
      const previousHoveredItem = this.state.hoveredItemWithTooltip;
      const mouseOverItem = maybeHoveredItem;
      if (
        previousHoveredItem === null ||
        !hoveredItemsAreEqual(previousHoveredItem, mouseOverItem)
      ) {
        this._hoverGeneration++;
        const thisHoverGeneration = this._hoverGeneration;
        const { pageX, pageY } = event;

        // Set a timeout to actually display the tooltip. However, observe that the
        // generation of the hovered item matches so multiple calls work correctly.
        setTimeout(() => {
          if (this._hoverGeneration === thisHoverGeneration) {
            // Ensure that the hover hasn't changed.
            onHoverChange(pageX, pageY, mouseOverItem);
            this.setState({ hoveredItemWithTooltip: mouseOverItem });
          }
        }, TOOLTIP_TIMEOUT);

        // If there is a previously displayed item, now is the time to remove it.
        if (previousHoveredItem !== null) {
          onHoverChange(event.pageX, event.pageY, null);
        }

        // Immediately remember that there is a hovered item.
        this.setState({ mouseOverItem, hoveredItemWithTooltip: null });
      }
    } else if (this.state.hoveredItemWithTooltip !== null) {
      // Invalidate any pending hovers from the setTimeout.
      this._hoverGeneration++;

      if (this.state.hoveredItemWithTooltip !== null) {
        onHoverChange(event.pageX, event.pageY, null);
      }

      this.setState({
        mouseOverItem: null,
        hoveredItemWithTooltip: null,
      });
    }
  };

  _onDoubleClick = () => {
    this.props.onDoubleClickItem(this.state.mouseOverItem);
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  componentWillReceiveProps() {
    // It is possible that the data backing the chart has been
    // changed, for instance after symbolication. Clear the
    // mouseOverItem if the mouse no longer hovers over it.
    const { mouseOverItem } = this.state;
    if (
      mouseOverItem !== null &&
      !hoveredItemsAreEqual(
        this.props.hitTest(this._offsetX, this._offsetY),
        mouseOverItem
      )
    ) {
      this.setState({ mouseOverItem: null });
    }
  }

  componentDidUpdate(
    prevProps: Props<HoveredItem>,
    prevState: State<HoveredItem>
  ) {
    if (
      prevProps !== this.props ||
      !hoveredItemsAreEqual(prevState.mouseOverItem, this.state.mouseOverItem)
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    const { mouseOverItem } = this.state;

    const className = classNames({
      chartCanvas: true,
      [this.props.className]: true,
      hover: mouseOverItem !== null,
    });

    return (
      <canvas
        className={className}
        ref={this._takeCanvasRef}
        onMouseDown={this._onMouseDown}
        onMouseUp={this._onMouseUp}
        onMouseMove={this._onMouseMove}
        onMouseOut={this._onMouseOut}
        onDoubleClick={this._onDoubleClick}
      />
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
