/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { timeCode } from 'firefox-profiler/utils/time-code';
import classNames from 'classnames';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';

import type { CssPixels, DevicePixels } from 'firefox-profiler/types';

type Props<HoveredItem> = {|
  +containerWidth: CssPixels,
  +containerHeight: CssPixels,
  +className: string,
  +onSelectItem?: (HoveredItem | null) => void,
  +onRightClick?: (HoveredItem | null) => void,
  +onDoubleClickItem: (HoveredItem | null) => void,
  +getHoveredItemInfo: HoveredItem => React.Node,
  +drawCanvas: (
    CanvasRenderingContext2D,
    hoveredItem: HoveredItem | null,
    prevHoveredItem: HoveredItem | null,
    isHoveredOnlyDifferent: boolean
  ) => void,
  +isDragging: boolean,
  // Applies ctx.scale() to the canvas to draw using CssPixels rather than DevicePixels.
  +scaleCtxToCssPixels: boolean,
  +hitTest: (x: CssPixels, y: CssPixels) => HoveredItem | null,
|};

// The naming of the X and Y coordinates here correspond to the ones
// found on the MouseEvent interface.
type State<HoveredItem> = {
  hoveredItem: HoveredItem | null,
  pageX: CssPixels,
  pageY: CssPixels,
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
    pageX: 0,
    pageY: 0,
  };

  _scheduleDraw(
    isHoveredOnlyDifferent: boolean = false,
    prevHoveredItem: HoveredItem | null = null
  ) {
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
          drawCanvas(
            this._ctx,
            this.state.hoveredItem,
            prevHoveredItem,
            isHoveredOnlyDifferent
          );
        });
      }
    });
  }

  _prepCanvas() {
    const canvas = this._canvas;
    const { containerWidth, containerHeight, scaleCtxToCssPixels } = this.props;
    const { devicePixelRatio } = window;

    if (!canvas) {
      return;
    }

    let ctx = this._ctx;
    if (!ctx) {
      ctx = canvas.getContext('2d', { alpha: false });
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
      // Round the style width as well, so the canvas will be sized according to
      // the integer pixel size.
      // TODO #2370 - We should review the correctness of this approach, to make sure
      // we don't have any blank pixels at the edge, or that we overflow.
      canvas.style.width = Math.floor(containerWidth) + 'px';
      canvas.style.height = Math.floor(containerHeight) + 'px';
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
  }

  _onMouseDown = (e: { nativeEvent: MouseEvent } & SyntheticMouseEvent<>) => {
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
      // mouseup/contextmenu events.
      this.props.onRightClick(this.state.hoveredItem);
    }
  };

  _onMouseUp = (e: SyntheticMouseEvent<>) => {
    if (this._mouseMovedWhileClicked) {
      return;
    }

    if (e.button === 0 && this.props.onSelectItem) {
      // Left button is a selection action
      this.props.onSelectItem(this.state.hoveredItem);
    }
  };

  _onMouseMove = (
    event: { nativeEvent: MouseEvent } & SyntheticMouseEvent<>
  ) => {
    if (!this._canvas) {
      return;
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
      this.setState({
        hoveredItem: maybeHoveredItem,
        pageX: event.pageX,
        pageY: event.pageY,
      });
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

  _getHoveredItemInfo = (): React.Node => {
    const { hoveredItem } = this.state;
    if (hoveredItem === null) {
      return null;
    }
    return this.props.getHoveredItemInfo(hoveredItem);
  };

  _takeCanvasRef = (canvas: HTMLCanvasElement | null) => {
    this._canvas = canvas;
  };

  UNSAFE_componentWillReceiveProps() {
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
    if (prevProps !== this.props) {
      this._scheduleDraw();
    } else if (
      !hoveredItemsAreEqual(prevState.hoveredItem, this.state.hoveredItem)
    ) {
      // Only the hovered items changed.
      this._scheduleDraw(true, prevState.hoveredItem);
    }
  }

  render() {
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
          onMouseUp={this._onMouseUp}
          onMouseMove={this._onMouseMove}
          onMouseOut={this._onMouseOut}
          onDoubleClick={this._onDoubleClick}
        />
        {!isDragging && tooltipContents ? (
          <Tooltip mouseX={pageX} mouseY={pageY}>
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
