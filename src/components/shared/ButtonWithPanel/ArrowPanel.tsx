/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This implements a panel with a "arrow" triangle graphic that points to the
// button that triggers it.
// Please do not use this component directly. This is used by ButtonWithPanel
// to wrap the panel content.

import * as React from 'react';
import classNames from 'classnames';

import './ArrowPanel.css';

type Props = {
  readonly onOpen: () => unknown;
  readonly onClose: () => unknown;
  readonly className?: string;
  readonly children: React.ReactNode;
};

type State = {
  readonly open: boolean;
  readonly isClosing: boolean;
  readonly openGeneration: number;
};

export class ArrowPanel extends React.PureComponent<Props, State> {
  closeTimeout: NodeJS.Timeout | null = null;
  override state = {
    open: false,
    isClosing: false,
    openGeneration: 0,
  };

  /* These 2 methods are called from other components.
  /* See https://github.com/firefox-devtools/profiler/issues/1888 and
   * https://github.com/firefox-devtools/profiler/issues/1641 */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  open() {
    if (this.state.open) {
      return;
    }

    this.setState({ open: true });
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

  _onArrowPanelClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // The arrow panel element contains the element that has the top arrow,
    // that is visually outside the panel. We still want to hide the panel
    // when clicking in this area.
    if ((e.target as HTMLElement).className !== 'arrowPanelArrow') {
      // Stop the click propagation to reach the _onWindowClick event when the
      // click is visually inside the panel.
      e.stopPropagation();
    }
  };

  // We're calling open and close callbacks in componentDidUpdate because they
  // often run side-effects, so we want them out of the render phase.
  override componentDidUpdate(prevProps: Props, prevState: State) {
    if (!prevState.open && this.state.open) {
      // Opening
      this.props.onOpen();
    }

    if (!this.state.open && prevState.isClosing && !this.state.isClosing) {
      // Closing... but only after the animation.
      this.props.onClose();
    }
  }

  override componentWillUnmount() {
    clearTimeout(this.closeTimeout);
  }

  override render() {
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
