import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';

require('./ArrowPanel.css');

class ArrowPanel extends PureComponent {
  constructor(props) {
    super(props);
    this.state = { open: false };
    this._windowMouseDownListener = this._windowMouseDownListener.bind(this);
    this._panelElementCreated = elem => { this._panelElement = elem; };
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
  }

  close() {
    if (!this.state.open) {
      return;
    }

    this.setState({ open: false });
    if (this.props.onClose) {
      this.props.onClose();
    }
    window.removeEventListener('mousedown', this._windowMouseDownListener, true);
  }

  componentWillUnmount() {
    window.removeEventListener('mousedown', this._windowMouseDownListener, true);
  }

  _windowMouseDownListener(e) {
    if (this.state.open && this._panelElement &&
        !this._panelElement.contains(e.target)) {
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
    const { className, children, title, okButtonText, cancelButtonText } = this.props;
    const hasTitle = (title !== undefined);
    const hasButtons = (okButtonText || cancelButtonText);
    const { open } = this.state;
    return (
      <div className='arrowPanelAnchor'>
        <div className={classNames('arrowPanel', { open, hasTitle, hasButtons }, className)} ref={this._panelElementCreated}>
          <div className='arrowPanelArrow'/>
          { hasTitle ? <h1 className='arrowPanelTitle'>{title}</h1> : null }
          <div className='arrowPanelContent'>
            {children}
          </div>
          {
            hasButtons ? (
              <div className='arrowPanelButtons'>
                <input type='button'
                       className='arrowPanelCancelButton'
                       value={cancelButtonText}
                       onClick={this._onCancelButtonClick}/>
                <input type='button'
                       className='arrowPanelOkButton'
                       value={okButtonText}
                       onClick={this._onOkButtonClick}/>
              </div>) : null
          }
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
};

export default ArrowPanel;
