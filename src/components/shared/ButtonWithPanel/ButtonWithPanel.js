/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// This implements the Button, as well as registering the events on the window
// object (mouse and keyboard events).

import * as React from 'react';
import classNames from 'classnames';

import { ArrowPanel } from './ArrowPanel';

import './ButtonWithPanel.css';

type Props = {|
  +className?: string,
  +label: string,
  +panelContent: React.Node,
  +panelClassName?: string,
  // This prop tells the panel to be open by default, but the open/close state is fully
  // managed by the ButtonWithPanel component.
  +initialOpen?: boolean,
  // The class name of the button input element.
  +buttonClassName?: string,
  +onPanelOpen?: () => mixed,
  +onPanelClose?: () => mixed,
  +buttonRef?: {| -current: null | HTMLInputElement |},
|};

type State = {|
  +open: boolean,
|};

export class ButtonWithPanel extends React.PureComponent<Props, State> {
  _panel: ArrowPanel | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { open: !!props.initialOpen };
  }

  componentDidMount() {
    // the panel can be closed by clicking anywhere on the window
    window.addEventListener('click', this._onWindowClick);
    // the panel can be closed by pressing the Esc key
    window.addEventListener('keydown', this._onKeyDown);
    if (this.state.open) {
      this.openPanel();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('click', this._onWindowClick);
  }

  _onPanelOpen = () => {
    this.setState({ open: true });
    if (this.props.onPanelOpen) {
      this.props.onPanelOpen();
    }
  };

  _onPanelClose = () => {
    this.setState({ open: false });
    if (this.props.onPanelClose) {
      this.props.onPanelClose();
    }
  };

  _takePanelRef = (panel: ArrowPanel | null) => {
    this._panel = panel;
  };

  openPanel() {
    if (this._panel) {
      this._panel.open();
    }
  }

  closePanel() {
    if (this._panel && this.state.open) {
      this._panel.close();
    }
  }

  _onWindowClick = () => {
    this.closePanel();
  };

  _onButtonClick = () => {
    if (!this.state.open) {
      // We use a timeout so that we let the event bubble up to the handlers bound
      // on `window`, closing all other panels, before opening this one.
      setTimeout(() => this.openPanel());
    }
  };

  _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closePanel();
    }
  };

  render() {
    const {
      className,
      label,
      panelContent,
      panelClassName,
      buttonClassName,
      buttonRef,
    } = this.props;
    const { open } = this.state;
    return (
      <div className={classNames('buttonWithPanel', className, { open })}>
        <input
          type="button"
          className={classNames('buttonWithPanelButton', buttonClassName)}
          value={label}
          onClick={this._onButtonClick}
          ref={buttonRef}
        />
        <ArrowPanel
          className={panelClassName}
          onOpen={this._onPanelOpen}
          onClose={this._onPanelClose}
          ref={this._takePanelRef}
        >
          {panelContent}
        </ArrowPanel>
      </div>
    );
  }
}
