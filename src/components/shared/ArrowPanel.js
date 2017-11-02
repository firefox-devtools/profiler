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
  _panelElementCreated: (HTMLElement | null) => void;
  _panelElement: HTMLElement | null;

  constructor(props: Props) {
    super(props);
    this.state = { open: false };
    (this: any)._windowMouseDownListener = this._windowMouseDownListener.bind(
      this
    );
    this._panelElementCreated = (elem: HTMLElement | null) => {
      this._panelElement = elem;
    };
    (this: any)._onOkButtonClick = this._onOkButtonClick.bind(this);
    (this: any)._onCancelButtonClick = this._onCancelButtonClick.bind(this);
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
  }

  componentWillUnmount() {
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
  }

  _windowMouseDownListener(e: MouseEvent) {
    const target: Node = (e.target: any); // make flow happy
    if (
      this.state.open &&
      this._panelElement &&
      !this._panelElement.contains(target)
    ) {
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
          ref={this._panelElementCreated}
        >
          <div className="arrowPanelArrow" />
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

export default ArrowPanel;
