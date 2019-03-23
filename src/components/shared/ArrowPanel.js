/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

require('./ArrowPanel.css');

type Props = {
  onOpen?: () => mixed,
  onClose?: () => mixed,
  onOkButtonClick?: () => mixed,
  onCancelButtonClick?: () => mixed,
  className: string,
  children: React.Node,
  title?: string,
  okButtonText?: string,
  cancelButtonText?: string,
};

type State = {
  open: boolean,
};

class ArrowPanel extends React.PureComponent<Props, State> {
  _panelElement: HTMLElement | null = null;
  state = { open: false };

  _takePanelElementRef = (elem: HTMLElement | null) => {
    this._panelElement = elem;
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
    if (!this.state.open) {
      return;
    }
    this.setState({ open: false });
    if (this.props.onClose) {
      this.props.onClose();
    }
  }

  _onArrowPanelClick = (e: SyntheticMouseEvent<>) => {
    e.stopPropagation();
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
      cancelButtonText,
    } = this.props;
    const hasTitle = title !== undefined;
    const hasButtons = okButtonText || cancelButtonText;
    const { open } = this.state;
    return (
      <div className="arrowPanelAnchor">
        <div
          className={classNames(
            'arrowPanel',
            { open, hasTitle, hasButtons },
            className
          )}
          onClick={this._onArrowPanelClick}
          ref={this._takePanelElementRef}
        >
          <div className="arrowPanelArrow" />
          {hasTitle ? <h1 className="arrowPanelTitle">{title}</h1> : null}
          <div className="arrowPanelContent">{children}</div>
          {hasButtons ? (
            <div className="arrowPanelButtons">
              <input
                type="button"
                className="arrowPanelCancelButton"
                value={cancelButtonText}
                onClick={this._onCancelButtonClick}
              />
              <input
                type="button"
                className="arrowPanelOkButton"
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
