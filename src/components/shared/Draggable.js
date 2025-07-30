/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import type { Milliseconds } from 'firefox-profiler/types';

export type OnMove = (
  originalValue: { +selectionEnd: Milliseconds, +selectionStart: Milliseconds },
  dx: number,
  dy: number,
  isModifying: boolean
) => void;

type Props = {
  value: {
    +selectionStart: Milliseconds,
    +selectionEnd: Milliseconds,
  },
  onMove: OnMove,
  className: string,
  children?: React.Node,
};

type State = {
  dragging: boolean,
};

/**
 * A component that reports mouse dragging (left mouse button only) in its
 * onMove handler.
 * While the mouse button is pressed, onMove is called on each mouse move with
 * three arguments: the value of its 'value' field at mousedown time, and the
 * x and y deltas compared to the mouse position at mousedown.
 * During the drag, the additional className 'dragging' is set on the element.
 */
export class Draggable extends React.PureComponent<Props, State> {
  _container: HTMLDivElement | null = null;
  _handlers: {
    mouseMoveHandler: (MouseEvent) => void,
    mouseUpHandler: (MouseEvent) => void,
  } | null = null;
  state = {
    dragging: false,
  };

  _takeContainerRef = (c: HTMLDivElement | null) => {
    this._container = c;
  };

  _onMouseDown = (e: SyntheticMouseEvent<>) => {
    if (!this._container || e.button !== 0) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    this.setState({ dragging: true });

    const mouseDownX = e.pageX;
    const mouseDownY = e.pageY;
    const startValue = this.props.value;

    const mouseMoveHandler = (e) => {
      this.props.onMove(
        startValue,
        e.pageX - mouseDownX,
        e.pageY - mouseDownY,
        true
      );
      // Note: no stopPropagation, so that other handlers (eg: screenshot
      // hovers) can also get the event and handle it.
      e.preventDefault();
    };

    const mouseUpHandler = (e) => {
      this.props.onMove(
        startValue,
        e.pageX - mouseDownX,
        e.pageY - mouseDownY,
        false
      );
      e.stopPropagation();
      e.preventDefault();
      this._uninstallMoveAndUpHandlers();
      this.setState({ dragging: false });
    };

    this._installMoveAndUpHandlers(mouseMoveHandler, mouseUpHandler);
  };

  _installMoveAndUpHandlers(
    mouseMoveHandler: (MouseEvent) => void,
    mouseUpHandler: (MouseEvent) => void
  ) {
    // Unregister any leftover old handlers, in case we didn't get a mouseup for the previous
    // drag (e.g. when tab switching during a drag, or when ctrl+clicking on macOS).
    this._uninstallMoveAndUpHandlers();

    this._handlers = { mouseMoveHandler, mouseUpHandler };
    window.addEventListener('mousemove', mouseMoveHandler, true);
    window.addEventListener('mouseup', mouseUpHandler, true);
  }

  _uninstallMoveAndUpHandlers() {
    if (this._handlers) {
      const { mouseMoveHandler, mouseUpHandler } = this._handlers;
      window.removeEventListener('mousemove', mouseMoveHandler, true);
      window.removeEventListener('mouseup', mouseUpHandler, true);
      this._handlers = null;
    }
  }

  componentWillUnmount() {
    this._uninstallMoveAndUpHandlers();
  }

  render() {
    const props = Object.assign({}, this.props);
    if (this.state.dragging) {
      props.className += ' dragging';
    }
    delete props.onMove;
    delete props.value;
    delete props.children;
    return (
      <div
        {...props}
        onMouseDown={this._onMouseDown}
        ref={this._takeContainerRef}
      >
        {this.props.children}
      </div>
    );
  }
}
