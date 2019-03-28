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
  cancelButtonText?: string,
|};

type State = {|
  open: boolean,
  isClosing: boolean,
  openGeneration: number,
|};

class ArrowPanel extends React.PureComponent<Props, State> {
  _panelElement: HTMLElement | null = null;
  state = {
    open: false,
    isClosing: false,
    // The open generation is mistakenly being tagged here as being unused.
    // eslint-disable-next-line react/no-unused-state
    openGeneration: 0,
  };

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
    window.addEventListener('mousedown', this._windowMouseDownListener, true);
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

      window.removeEventListener(
        'mousedown',
        this._windowMouseDownListener,
        true
      );

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

  componentWillUnmount() {
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
  }

  _windowMouseDownListener = (e: MouseEvent) => {
    const target: Node = (e.target: any); // make flow happy
    if (
      this.state.open &&
      this._panelElement &&
      !this._panelElement.contains(target)
    ) {
      this.close();
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
          ref={this._takePanelElementRef}
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
