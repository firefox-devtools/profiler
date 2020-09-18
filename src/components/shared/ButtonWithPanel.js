/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

import './ButtonWithPanel.css';

type PanelProps = {
  onOpen?: () => mixed,
  onClose?: () => mixed,
};

interface Panel {
  open(): mixed;
  close(): mixed;
}

/**
 * Note about the `panel` prop: we accept any React element whose Component
 * class implements the `Panel` interface above, and has at least the props from
 * `PanelProps` above, and any State type. */
type Props = {|
  +className: string,
  +label: string,
  +panel: React.Element<
    Class<Panel & React.Component<$Subtype<PanelProps>, any>>
  >,
  +open?: boolean,
  // This prop tells the panel to be open by default, but the open/close state is fully
  // managed by the ButtonWithPanel component.
  +defaultOpen?: boolean,
  // The class name of the button input element.
  +buttonClassName?: string,
|};

type State = {|
  open: boolean,
|};

class ButtonWithPanel extends React.PureComponent<Props, State> {
  _panel: Panel | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { open: !!props.open };
  }

  componentDidMount() {
    // the panel can be closed by clicking anywhere on the window
    window.addEventListener('click', this._onWindowClick);
    // the panel can be closed by pressing the Esc key
    window.addEventListener('keydown', this._onKeyDown);
    if (this.props.open || this.props.defaultOpen) {
      this.openPanel();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('click', this._onWindowClick);
  }

  UNSAFE_componentWillReceiveProps(props: Props) {
    if (props.open !== this.props.open) {
      this.setState({ open: !!props.open });
    }
  }

  _onPanelOpen = () => {
    this.setState({ open: true });
    if (this.props.panel.props.onOpen) {
      this.props.panel.props.onOpen();
    }
  };

  _onPanelClose = () => {
    this.setState({ open: false });
    if (this.props.panel.props.onClose) {
      this.props.panel.props.onClose();
    }
  };

  _takePanelRef = (panel: Panel | null) => {
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
    const { className, label, panel, buttonClassName } = this.props;
    const { open } = this.state;
    return (
      <div className={classNames('buttonWithPanel', className, { open })}>
        <input
          type="button"
          className={classNames('buttonWithPanelButton', buttonClassName)}
          value={label}
          onClick={this._onButtonClick}
        />
        {React.cloneElement(panel, {
          ref: this._takePanelRef,
          onOpen: this._onPanelOpen,
          onClose: this._onPanelClose,
        })}
      </div>
    );
  }
}

export default ButtonWithPanel;
