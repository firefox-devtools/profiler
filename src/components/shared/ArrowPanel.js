/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

require('./ArrowPanel.css');

type Props = {|
  onOpen?: () => mixed,
  onClose?: () => mixed,
  onOkButtonClick?: () => mixed,
  onCancelButtonClick?: () => mixed,
  className: string,
  children: React.Node,
  title?: string,
  okButtonText?: string,
  okButtonType?: 'default' | 'primary' | 'destructive',
  cancelButtonText?: string,
|};

type State = {|
  open: boolean,
  isClosing: boolean,
  openGeneration: number,
|};

class ArrowPanel extends React.PureComponent<Props, State> {
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
    if (this.props.onOpen) {
      this.props.onOpen();
    }
  }

  close() {
    this.setState(state => {
      if (!state.open) {
        return null;
      }
      const openGeneration = state.openGeneration + 1;

      setTimeout(this._onCloseAnimationFinish(openGeneration), 400);

      if (this.props.onClose) {
        this.props.onClose();
      }

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

  _onOkButtonClick = () => {
    this.close();
    if (this.props.onOkButtonClick) {
      this.props.onOkButtonClick();
    }
  };

  _onCancelButtonClick = () => {
    this.close();
    if (this.props.onCancelButtonClick) {
      this.props.onCancelButtonClick();
    }
  };

  render() {
    const {
      className,
      children,
      title,
      okButtonText,
      okButtonType,
      cancelButtonText,
    } = this.props;
    const hasTitle = title !== undefined;
    const hasButtons = okButtonText || cancelButtonText;
    const { open, isClosing } = this.state;
    return (
      <div className="arrowPanelAnchor">
        <div
          className={classNames(
            'arrowPanel',
            { open, hasTitle, hasButtons },
            className
          )}
          onClick={this._onArrowPanelClick}
        >
          <div className="arrowPanelArrow" />
          {hasTitle ? <h1 className="arrowPanelTitle">{title}</h1> : null}
          {open || isClosing ? (
            <div className="arrowPanelContent">{children}</div>
          ) : null}
          {hasButtons ? (
            <div className="arrowPanelButtons">
              <input
                type="button"
                className="photon-button photon-button-default"
                value={cancelButtonText}
                onClick={this._onCancelButtonClick}
              />
              <input
                type="button"
                className={`photon-button photon-button-${okButtonType ||
                  'primary'}`}
                value={okButtonText}
                onClick={this._onOkButtonClick}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}

export default ArrowPanel;
