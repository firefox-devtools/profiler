/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import ReactDOM from 'react-dom';
import classNames from 'classnames';
import { CssPixels } from 'firefox-profiler/types';

import {
  ensureExists,
  assertExhaustiveCheck,
} from 'firefox-profiler/utils/flow';
import './Tooltip.css';

export const MOUSE_OFFSET = 11;
// If changing this value, make sure and adjust the max-width in the .tooltip class.
export const VISUAL_MARGIN: CssPixels = 8;

type Props = {
  readonly mouseX: CssPixels;
  readonly mouseY: CssPixels;
  readonly children: React.ReactNode;
  readonly className?: string;
};

// These types represent the tooltip's position. They will be used when storing
// the previous position as well as when defining the new one.
type PositionFromMouse = 'before-mouse' | 'after-mouse';
type TooltipPosition = PositionFromMouse | 'window-edge';

export class Tooltip extends React.PureComponent<Props> {
  _interiorElementRef: { current: HTMLDivElement | null } = React.createRef();

  // This keeps the previous tooltip positioning relatively to the mouse cursor.
  // "after" / "after" is the prefered positioning, so it's our default.
  // "edge" means aligned to the window's left or top edge.
  _previousPosition: {
    horizontal: TooltipPosition;
    vertical: TooltipPosition;
  } = { horizontal: 'after-mouse' as const, vertical: 'after-mouse' as const };

  _overlayElement = ensureExists(
    document.querySelector('#root-overlay'),
    'Expected to find a root overlay element.'
  );

  // This function computes the position of the tooltip in one of the directions
  // horizontal or vertical, leading respectively to the CSS value for
  // properties "left" and "top".
  _computeNewPosition({
    mousePosition,
    elementSize,
    windowSize,
    previousPosition,
  }: {
    mousePosition: CssPixels;
    elementSize: CssPixels;
    windowSize: CssPixels;
    previousPosition: TooltipPosition;
  }): { position: TooltipPosition; style: CssPixels } {
    // 1. Compute the possible tooltip positions depending on the mouse position,
    // the tooltip's size, as well as the available space in the window.
    const possiblePositions: Array<PositionFromMouse> = [];

    if (mousePosition + MOUSE_OFFSET + elementSize < windowSize) {
      possiblePositions.push('after-mouse');
    }

    if (mousePosition - MOUSE_OFFSET - elementSize >= 0) {
      possiblePositions.push('before-mouse');
    }

    // 2. From the found possible positions as well as the previous tooltip
    // position, decide the new position.
    let newPosition;
    switch (possiblePositions.length) {
      case 0:
        newPosition = 'window-edge';
        break;
      case 1:
        newPosition = possiblePositions[0];
        break;
      case 2:
        // In case both positions before/after work, let's reuse the previous
        // position if it's one of those, for more stability. If the previous
        // position was window-edge, before-mouse looks more appropriate.
        // Ideally we would try to keep the tooltip below the cursor.
        newPosition =
          previousPosition !== 'window-edge'
            ? previousPosition
            : 'before-mouse';
        break;
      default:
        throw new Error(
          `We got more than 2 possible positions ${possiblePositions.length}, which shouldn't happen.`
        );
    }

    // 3. From the new position, calculate the new CSS value for this direction,
    // from the mouse position and the element's size.
    let cssStyle;
    switch (newPosition) {
      case 'after-mouse':
        cssStyle = mousePosition + MOUSE_OFFSET;
        break;
      case 'before-mouse':
        cssStyle = mousePosition - elementSize - MOUSE_OFFSET;
        break;
      case 'window-edge':
        cssStyle = VISUAL_MARGIN;
        break;
      default:
        throw assertExhaustiveCheck(
          newPosition as never,
          'Unknown position type'
        );
    }

    // 4. Return all the values, so that they can be applied and saved.
    return {
      position: newPosition,
      style: cssStyle,
    };
  }

  setPositioningStyle() {
    const { mouseX, mouseY } = this.props;

    const interiorElement = this._interiorElementRef.current;
    if (!interiorElement) {
      return;
    }

    const horizontalResult = this._computeNewPosition({
      mousePosition: mouseX,
      elementSize: interiorElement.offsetWidth,
      windowSize: window.innerWidth,
      previousPosition: this._previousPosition.horizontal,
    });

    const verticalResult = this._computeNewPosition({
      mousePosition: mouseY,
      elementSize: interiorElement.offsetHeight,
      windowSize: window.innerHeight,
      previousPosition: this._previousPosition.vertical,
    });

    interiorElement.style.left = horizontalResult.style + 'px';
    interiorElement.style.top = verticalResult.style + 'px';

    this._previousPosition = {
      horizontal: horizontalResult.position,
      vertical: verticalResult.position,
    };
  }

  override componentDidMount() {
    this.setPositioningStyle();
  }

  override componentDidUpdate() {
    this.setPositioningStyle();
  }

  _mouseDownListener = (event: React.MouseEvent<HTMLElement>) => {
    // Prevent the canvas element to handle the mouse down event. Otherwise
    // drag and drop events closes the tooltip.
    event.stopPropagation();
  };

  override render() {
    return ReactDOM.createPortal(
      <div
        className={classNames('tooltip', this.props.className)}
        onMouseDown={this._mouseDownListener}
        data-testid="tooltip"
        // This will be overridden in setPositioningStyle, but they are
        // necessary so that the measurements are correct.
        style={{ left: 0, top: 0 }}
        ref={this._interiorElementRef}
      >
        {this.props.children}
      </div>,
      this._overlayElement
    );
  }
}
