/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { timeCode } from '../../../utils/time-code';
import classNames from 'classnames';

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
    hoveredItem: HoveredItem | null
  ) => void,
|};

// The naming of the X and Y coordinates here correspond to the ones
// found on the MouseEvent interface.
type State<HoveredItem> = {
  hoveredItem: HoveredItem | null,
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

  state: State<HoveredItem> = {
    hoveredItem: null,
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
          drawCanvas(this._ctx, this.state.hoveredItem);
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
      this.props.onSelectItem(this.state.hoveredItem);
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
      if (this.state.hoveredItem !== null) {
        // When dragging, hide the hover.
        onHoverChange(event.pageX, event.pageY, null);
        this.setState({ hoveredItem: null });
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
      const previousHoveredItem = this.state.hoveredItem;
      const hoveredItem = maybeHoveredItem;
      if (
        previousHoveredItem === null ||
        !hoveredItemsAreEqual(previousHoveredItem, hoveredItem)
      ) {
        onHoverChange(event.pageX, event.pageY, hoveredItem);
        this.setState({ hoveredItem });
      }
    } else if (this.state.hoveredItem !== null) {
      onHoverChange(event.pageX, event.pageY, null);
      this.setState({ hoveredItem: null });
    }
  };

  _onMouseOut = () => {
    if (this.state.hoveredItem !== null) {
      this.setState({ hoveredItem: null });
    }
  };

  _onDoubleClick = () => {
    this.props.onDoubleClickItem(this.state.hoveredItem);
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  componentWillReceiveProps() {
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

  componentDidUpdate(
    prevProps: Props<HoveredItem>,
    prevState: State<HoveredItem>
  ) {
    if (
      prevProps !== this.props ||
      !hoveredItemsAreEqual(prevState.hoveredItem, this.state.hoveredItem)
    ) {
      this._scheduleDraw();
    }
  }

  render() {
    const { hoveredItem } = this.state;

    const className = classNames({
      chartCanvas: true,
      [this.props.className]: true,
      hover: hoveredItem !== null,
    });

    return (
      // TODO - Hey reviewer, remind me to delete this div.
      <div>
        <canvas
          className={className}
          ref={this._takeCanvasRef}
          onMouseDown={this._onMouseDown}
          onMouseUp={this._onMouseUp}
          onMouseMove={this._onMouseMove}
          onMouseOut={this._onMouseOut}
          onDoubleClick={this._onDoubleClick}
        />
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
