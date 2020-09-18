/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

import { ClosePanelContext } from './ClosePanelContext';

import './ConfirmDialog.css';

type Props = {|
  // If these callbacks return promises, they will be waited for before the
  // panel is closed. To make this explicit we added Promise<mixed> even if that
  // isn't necessary to pass Flow checks.
  +onCancelButtonClick?: () => mixed | Promise<mixed>,
  +onConfirmButtonClick?: () => mixed | Promise<mixed>,
  +className?: string,
  +title: string,
  +cancelButtonText?: string,
  +confirmButtonText?: string,
  +confirmButtonType?: 'default' | 'primary' | 'destructive',
  +children: React.Node,
|};

type PropsWithClose = {|
  ...Props,
  closePanel: void => mixed,
|};

type State = {|
  status: 'idle' | 'working',
|};

export class ConfirmDialogImpl extends React.PureComponent<
  PropsWithClose,
  State
> {
  state = {
    status: 'idle',
  };

  _onConfirmButtonClick = async () => {
    if (this.state.status === 'working') {
      return;
    }

    this.setState({ status: 'working' });
    if (this.props.onConfirmButtonClick) {
      try {
        await this.props.onConfirmButtonClick();
      } finally {
        this.setState({ status: 'idle' });
      }
    }
    this.props.closePanel();
  };

  _onCancelButtonClick = async () => {
    if (this.state.status === 'working') {
      return;
    }

    this.setState({ status: 'working' });
    if (this.props.onCancelButtonClick) {
      try {
        await this.props.onCancelButtonClick();
      } finally {
        this.setState({ status: 'idle' });
      }
    }
    this.props.closePanel();
  };

  render() {
    const {
      className,
      children,
      title,
      cancelButtonText,
      confirmButtonText,
      confirmButtonType,
    } = this.props;
    const { status } = this.state;

    return (
      <div className={classNames('confirmDialog', className)}>
        <h2 className="confirmDialogTitle">{title}</h2>
        <div className="confirmDialogContent">{children}</div>
        <div className="confirmDialogButtons">
          <input
            type="button"
            className="photon-button photon-button-default"
            value={cancelButtonText || 'Cancel'}
            disabled={status === 'working'}
            onClick={this._onCancelButtonClick}
          />
          <input
            type="button"
            className={`photon-button photon-button-${confirmButtonType ||
              'primary'}`}
            value={confirmButtonText || 'Confirm'}
            disabled={status === 'working'}
            onClick={this._onConfirmButtonClick}
          />
        </div>
      </div>
    );
  }
}

export function ConfirmDialog(props: Props) {
  return (
    <ClosePanelContext.Consumer>
      {panelCloseFunction => (
        <ConfirmDialogImpl {...props} closePanel={panelCloseFunction} />
      )}
    </ClosePanelContext.Consumer>
  );
}
