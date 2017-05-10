/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';

require('./ButtonWithPanel.css');

class ButtonWithPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { open: false };
    this._onPanelOpen = () => {
      this.setState({ open: true });
      if (this.props.panel.props.onOpen) {
        this.props.panel.props.onOpen();
      }
    };
    this._onPanelClose = () => {
      this.setState({ open: false });
      if (this.props.panel.props.onClose) {
        this.props.panel.props.onClose();
      }
    };
    this._onButtonClick = this._onButtonClick.bind(this);
    this._panelCreated = panel => { this._panel = panel; };
  }

  openPanel() {
    if (this._panel) {
      this._panel.open();
    }
  }

  _onButtonClick() {
    this.openPanel();
  }

  render() {
    const { className, label, panel } = this.props;
    const { open } = this.state;
    return (
      <div className={classNames('buttonWithPanel', className, { open })}>
        <div className='buttonWithPanelButtonWrapper'>
          <input type='button'
                 className={classNames('buttonWithPanelButton', `${className}Button`)}
                 value={label}
                 onClick={this._onButtonClick}/>
        </div>
        {React.cloneElement(panel, {
          ref: this._panelCreated,
          onOpen: this._onPanelOpen,
          onClose: this._onPanelClose,
        })}
      </div>
    );
  }
}

ButtonWithPanel.propTypes = {
  className: PropTypes.string,
  label: PropTypes.string.isRequired,
  panel: PropTypes.object.isRequired,
};

export default ButtonWithPanel;
