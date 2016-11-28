import React, { Component, PropTypes } from 'react';
import classNames from 'classnames';

require('./ButtonWithPanel.css');

class ButtonWithPanel extends Component {
  constructor(props) {
    super(props);
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
    return (
      <div className={classNames('buttonWithPanel', className)}>
        <div className='buttonWithPanelButtonWrapper'>
          <input type='button'
                 className={classNames('buttonWithPanelButton', `${className}Button`)}
                 value={label}
                 onClick={this._onButtonClick}/>
        </div>
        {React.cloneElement(panel, { ref: this._panelCreated })}
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
