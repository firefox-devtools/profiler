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
  _buttonElement: HTMLElement | null = null;
  _panel: Panel | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { open: !!props.open };
  }

  componentDidMount() {
    // the panel can be closed by pressing the Esc key
    window.addEventListener('keydown', this._onKeyDown);
    if (this.props.open) {
      this.openPanel();
    }
  }

  componentWillUnmount() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
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
    console.log('inside onPaneOpen');
    window.addEventListener('mousedown', this._windowMouseDownListener, true);
  };

  _onPanelClose = () => {
    this.setState({ open: false });
    if (this.props.panel.props.onClose) {
      this.props.panel.props.onClose();
    }
    window.removeEventListener(
      'mousedown',
      this._windowMouseDownListener,
      true
    );
  };

  _takePanelRef = (panel: Panel | null) => {
    this._panel = panel;
  };

  _takeButtonRef = (elem: HTMLElement | null) => {
    this._buttonElement = elem;
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
    if (!this.state.open) {
      this.openPanel();
    } else {
      this.closePanel();
    }
  };

  _onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      this.closePanel();
    }
  };

  _windowMouseDownListener = (e: MouseEvent) => {
    const target: Node = (e.target: any); // make flow happy
    if (
      this.state.open &&
      this._panel &&
      this._panel._panelElement &&
      !this._buttonElement.contains(target)
    ) {
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
            ref={this._takeButtonRef}
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
