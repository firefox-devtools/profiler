/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';

require('./ArrowPanel.css');

class ArrowPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { open: false };
    this._windowMouseDownListener = this._windowMouseDownListener.bind(this);
    this._escapeListener = this._escapeListener.bind(this);
    this._panelElementCreated = elem => {
      this._panelElement = elem;
    };
    this._onOkButtonClick = this._onOkButtonClick.bind(this);
    this._onCancelButtonClick = this._onCancelButtonClick.bind(this);
  }

  open() {
    if (this.state.open) {
      return;
    }

    this.setState({ open: true });
    if (this.props.onOpen) {
      this.props.onOpen();
    }
    window.addEventListener('mousedown', this._windowMouseDownListener, true);
    window.addEventListener('keypress', this._escapeListener, false);
  }

  close() {
    if (!this.state.open) {
      return;
    }

    this.setState({ open: false });
    if (this.props.onClose) {
      this.props.onClose();
    }
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
    window.removeEventListener('keypress', this._escapeListener, false);
  }

  componentWillUnmount() {
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
    window.removeEventListener('keypress', this._escapeListener, false);
  }

  _windowMouseDownListener(event) {
    if (
      this.state.open &&
      this._panelElement &&
      !this._panelElement.contains(event.target)
    ) {
      this.close();
    }
  }

  _escapeListener(event) {
    if (event.key === 'Escape' && this.state.open && this._panelElement) {
      this.close();
    }
  }

  _onOkButtonClick() {
    this.close();
    if (this.props.onOkButtonClick) {
      this.props.onOkButtonClick();
    }
  }

  _onCancelButtonClick() {
    this.close();
    if (this.props.onCancelButtonClick) {
      this.props.onCancelButtonClick();
    }
  }

  render() {
    const {
      className,
      children,
      title,
      okButtonText,
      cancelButtonText,
      offsetDirection,
    } = this.props;
    const hasTitle = title !== undefined;
    const hasButtons = okButtonText || cancelButtonText;
    const { open } = this.state;
    return (
      <div
        className={classNames(
          'arrowPanelAnchor',
          className + 'arrowPanelAnchor'
        )}
      >
        <div
          className={classNames(
            'arrowPanel',
            { open, hasTitle, hasButtons },
            offsetDirection,
            className
          )}
          ref={this._panelElementCreated}
        >
          <div className={classNames('arrowPanelArrow', offsetDirection)} />
          {hasTitle
            ? <h1 className="arrowPanelTitle">
                {title}
              </h1>
            : null}
          <div className="arrowPanelContent">
            {children}
          </div>
          {hasButtons
            ? <div className="arrowPanelButtons">
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
            : null}
        </div>
      </div>
    );
  }
}

ArrowPanel.propTypes = {
  onOpen: PropTypes.func,
  onClose: PropTypes.func,
  onOkButtonClick: PropTypes.func,
  onCancelButtonClick: PropTypes.func,
  className: PropTypes.string,
  children: PropTypes.any,
  title: PropTypes.string,
  okButtonText: PropTypes.string,
  cancelButtonText: PropTypes.string,
  offsetDirection: PropTypes.string,
};

export default ArrowPanel;
