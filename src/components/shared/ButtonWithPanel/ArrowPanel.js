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
|};

export class ArrowPanel extends React.PureComponent<Props, State> {
  state = {
    open: false,
    isClosing: false,
    openGeneration: 0,
  };

  open() {
    if (this.state.open) {
      return;
    }

    this.setState({ open: true });
    this.props.onOpen();
  }

  close() {
    this.setState(state => {
      if (!state.open) {
        return null;
      }
      const openGeneration = state.openGeneration + 1;

      setTimeout(this._onCloseAnimationFinish(openGeneration), 400);

      this.props.onClose();

      return { open: false, isClosing: true, openGeneration };
    });
  }

  _onCloseAnimationFinish(openGeneration: number) {
    return () => {
      this.setState(state => {
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

  render() {
    const { className, children } = this.props;
    const { open, isClosing } = this.state;
    if (!open && !isClosing) {
      return null;
    }

    return (
      <div className="arrowPanelAnchor">
        <div
          className={classNames('arrowPanel', { open }, className)}
          onClick={this._onArrowPanelClick}
        >
          <div className="arrowPanelArrow" />
          <div className="arrowPanelContent">{children}</div>
        </div>
      </div>
    );
  }
}
