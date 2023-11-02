/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This implements a panel with a "arrow" triangle graphic that points to the
// button that triggers it.
// Please do not use this component directly. This is used by ButtonWithPanel
// to wrap the panel content.

import * as React from 'react';
import classNames from 'classnames';

import './ArrowPanel.css';

import type { CssPixels } from 'firefox-profiler/types';

type Props = {|
  +onOpen: () => mixed,
  +onClose: () => mixed,
  +className?: string,
  +children: React.Node,
|};

type State = {|
  +open: boolean,
  +isClosing: boolean,
  +openGeneration: number,
  +panelRect: Rect,
  +arrowOffset: CssPixels,
|};

type Rect = {|
  left: CssPixels,
  top: CssPixels,
  width: CssPixels,
  height: CssPixels,
|};

// The anchor position describes where the arrow panel's arrow should be located
// *in relation to the panel*. Then the panel will be positioned so that the arrow
// points at the center of the anchor element.
//
//                                   +---------------------------+
//                                   |       anchorElement       |
//                                   +---------------------------+
//                                                 ^
//                                                 |
//          +--------------------------------------+--------+
//          |                                               |
//          |                  The panel                    |
//          |                                               |
//          +-----------------------------------------------+
//
//          |<---------------- panelWidth ----------------->|
//                                                  |<----->|
//                                               distanceFromEdge
export type AnchorPosition = {|
  // If set to "right", the arrow will be positioned `distanceFromEdge` pixels
  // from the right edge of the panel.
  // If set to "left", the arrow will be positioned `distanceFromEdge` pixels
  // from the left edge of the panel.
  anchorEdge: 'left' | 'right',
  distanceFromEdge: CssPixels,
|};

export class ArrowPanel extends React.PureComponent<Props, State> {
  closeTimeout = null;
  state = {
    open: false,
    isClosing: false,
    openGeneration: 0,
    panelRect: { left: 0, top: 0, width: 0, height: 0 },
    arrowOffset: 40,
  };

  /* These 2 methods are called from other components.
  /* See https://github.com/firefox-devtools/profiler/issues/1888 and
   * https://github.com/firefox-devtools/profiler/issues/1641 */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  open(
    anchorElement: HTMLElement,
    panelWidthInCssPx: number,
    anchorPosition: AnchorPosition
  ) {
    if (this.state.open) {
      return;
    }

    const win = anchorElement.ownerDocument.defaultView;
    const anchorRectRelativeToPage = anchorElement.getBoundingClientRect();
    const anchorRectRelativeToViewport = {
      left: anchorRectRelativeToPage.left - win.scrollX,
      top: anchorRectRelativeToPage.top - win.scrollY,
      width: anchorRectRelativeToPage.width,
      height: anchorRectRelativeToPage.height,
    };

    // Compute the location that the arrow panel should point at with its arrow.
    // This location is in the middle of the anchorRect, 75% of the way down.
    const anchorPoint = {
      left:
        anchorRectRelativeToViewport.left +
        anchorRectRelativeToViewport.width * 0.5,
      top:
        anchorRectRelativeToViewport.top +
        anchorRectRelativeToViewport.height * 0.75,
    };

    // Constrain the panel width to the viewport.
    const adjustedPanelWidth = Math.min(panelWidthInCssPx, win.innerWidth);

    // Compute the panel position.
    const preferredPanelLeft = (function () {
      if (anchorPosition.anchorEdge === 'left') {
        return anchorPoint.left - anchorPosition.distanceFromEdge;
      }
      const right = anchorPoint.left + anchorPosition.distanceFromEdge;
      return right - adjustedPanelWidth;
    })();

    // Constrain the panel position so that the panel is fully onscreen.
    const panelLeft = Math.max(
      0,
      Math.min(preferredPanelLeft, win.innerWidth - adjustedPanelWidth)
    );

    this.setState({
      open: true,
      panelRect: {
        left: panelLeft,
        top: anchorPoint.top,
        width: adjustedPanelWidth,
        height: 0, // ignored
      },
      arrowOffset: anchorPoint.left - panelLeft,
    });
  }

  /* eslint-disable-next-line react/no-unused-class-component-methods */
  close() {
    this.setState((state) => {
      if (!state.open) {
        return null;
      }
      const openGeneration = state.openGeneration + 1;

      clearTimeout(this.closeTimeout);
      this.closeTimeout = setTimeout(
        this._onCloseAnimationFinish(openGeneration),
        400
      );

      return { open: false, isClosing: true, openGeneration };
    });
  }

  _onCloseAnimationFinish(openGeneration: number) {
    return () => {
      this.setState((state) => {
        if (state.openGeneration === openGeneration) {
          return { isClosing: false };
        }
        return null;
      });
    };
  }

  _onArrowPanelClick = (e: { target: HTMLElement } & SyntheticMouseEvent<>) => {
    // The arrow panel element contains the element that has the top arrow,
    // that is visually outside the panel. We still want to hide the panel
    // when clicking in this area.
    if (e.target.className !== 'arrowPanelArrow') {
      // Stop the click propagation to reach the _onWindowClick event when the
      // click is visually inside the panel.
      e.stopPropagation();
    }
  };

  // We're calling open and close callbacks in componentDidUpdate because they
  // often run side-effects, so we want them out of the render phase.
  componentDidUpdate(prevProps: Props, prevState: State) {
    if (!prevState.open && this.state.open) {
      // Opening
      this.props.onOpen();
    }

    if (!this.state.open && prevState.isClosing && !this.state.isClosing) {
      // Closing... but only after the animation.
      this.props.onClose();
    }
  }

  componentWillUnmount() {
    clearTimeout(this.closeTimeout);
  }

  render() {
    const { className, children } = this.props;
    const { open, isClosing, panelRect, arrowOffset } = this.state;

    if (!open && !isClosing) {
      return null;
    }

    return (
      <div
        className={classNames('arrowPanel', { open }, className)}
        onClick={this._onArrowPanelClick}
        style={{
          left: `${panelRect.left}px`,
          top: `${panelRect.top}px`,
          width: `${panelRect.width}px`,
        }}
      >
        <div className={classNames('arrowPanelInnerWrapper', { open })}>
          <div className="arrowPanelArrowContainer">
            <div
              className="arrowPanelArrow"
              style={{ left: `${arrowOffset}px` }}
            />
          </div>
          <div className="arrowPanelContent">{children}</div>
        </div>
      </div>
    );
  }
}
