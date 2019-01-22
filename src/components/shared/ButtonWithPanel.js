/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

require('./ButtonWithPanel.css');

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
type Props = {
  className: string,
  label: string,
  panel: React.Element<
    Class<Panel & React.Component<$Subtype<PanelProps>, any>>
  >,
  open?: boolean,
  disabled?: boolean,
};

type State = {|
  open: boolean,
|};

class ButtonWithPanel extends React.PureComponent<Props, State> {
  _panel: Panel | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { open: !!props.open };
  }
  // the panel can be closed by pressing the Esc key
  componentDidMount() {
    window.addEventListener('keydown', this._onKeyDown);
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
  }

  componentDidMount() {
    if (this.props.open) {
      this.openPanel();
    }
  }

  componentWillReceiveProps(props: Props) {
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

  _onButtonClick = () => {
    this.openPanel();
  };

  _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closePanel();
    }
  };

  render() {
    const { className, label, panel, disabled } = this.props;
    const { open } = this.state;
    return (
      <div className={classNames('buttonWithPanel', className, { open })}>
        <div className="buttonWithPanelButtonWrapper">
          <input
            type="button"
            className={classNames(
              'buttonWithPanelButton',
              `${className}Button`
            )}
            disabled={!!disabled}
            value={label}
            onClick={this._onButtonClick}
          />
        </div>
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
