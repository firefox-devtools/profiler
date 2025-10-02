/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

export type OnMove<T> = (
  originalValue: T,
  dx: number,
  dy: number,
  isModifying: boolean
) => void;

type Props<T> = {
  value?: T;
  getInitialValue?: () => T;
  onMove: OnMove<T>;
  className: string;
  children?: React.ReactNode;
};

type State<T> =
  | {
      dragging: false;
    }
  | {
      dragging: true;
      startValue: T;
      startX: number;
      startY: number;
    };

/**
 * A component that reports mouse dragging (left mouse button only) in its
 * onMove handler.
 * While the mouse button is pressed, onMove is called on each mouse move with
 * three arguments: the value of its 'value' field at mousedown time, and the
 * x and y deltas compared to the mouse position at mousedown.
 * During the drag, the additional className 'dragging' is set on the element.
 */
export class Draggable<T> extends React.PureComponent<Props<T>, State<T>> {
  _container: HTMLDivElement | null = null;
  override state: State<T> = {
    dragging: false,
  };

  _takeContainerRef = (c: HTMLDivElement | null) => {
    this._container = c;
  };

  _getInitialValue = (): T => {
    if (this.props.value !== undefined) {
      return this.props.value;
    }
    if (this.props.getInitialValue !== undefined) {
      return this.props.getInitialValue();
    }
    throw new Error('Missing value in Draggable');
  };

  _onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!this._container || e.button !== 0) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    this._container?.setPointerCapture(e.pointerId);
    this.setState({
      dragging: true,
      startValue: this._getInitialValue(),
      startX: e.pageX,
      startY: e.pageY,
    });
  };

  _onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!this.state.dragging) {
      return;
    }

    const { startValue, startX, startY } = this.state;
    this.props.onMove(startValue, e.pageX - startX, e.pageY - startY, true);
  };

  _onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    if (!this.state.dragging) {
      return;
    }

    const { startValue, startX, startY } = this.state;
    this.props.onMove(startValue, e.pageX - startX, e.pageY - startY, false);
    this.setState({ dragging: false });
  };

  override render() {
    const { children, className } = this.props;
    const { dragging } = this.state;
    return (
      <div
        className={this.state.dragging ? className + ' dragging' : className}
        onPointerDown={this._onPointerDown}
        onPointerMove={dragging ? this._onPointerMove : undefined}
        onPointerUp={this._onPointerUp}
        ref={this._takeContainerRef}
      >
        {children}
      </div>
    );
  }
}
