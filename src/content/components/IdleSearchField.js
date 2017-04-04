import React, { Component, PropTypes } from 'react';
import classNames from 'classnames';

import './IdleSearchField.css';

class IdleSearchField extends Component {
  constructor(props) {
    super(props);
    this._onSearchFieldChange = this._onSearchFieldChange.bind(this);
    this._onSearchFieldFocus = this._onSearchFieldFocus.bind(this);
    this._onClearButtonClick = this._onClearButtonClick.bind(this);
    this._onTimeout = this._onTimeout.bind(this);
    this._timeout = 0;
    this.state = {
      value: props.defaultValue || '',
    };
    this._previouslyNotifiedValue = this.state.value;
  }

  _onSearchFieldFocus(e) {
    e.target.select();
  }

  _onSearchFieldChange(e) {
    this.setState({
      value: e.target.value,
    });

    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    this._timeout = setTimeout(this._onTimeout, this.props.idlePeriod);
  }

  _onTimeout() {
    this._timeout = 0;
    this._notifyIfChanged(this.state.value);
  }

  _notifyIfChanged(value) {
    if (value !== this._previouslyNotifiedValue) {
      this._previouslyNotifiedValue = value;
      this.props.onIdleAfterChange(value);
    }
  }

  _onClearButtonClick() {
    this.setState({ value: '' });
    this._notifyIfChanged('');
  }

  _onClearButtonFocus(e) {
    // prevent the focus on the clear button
    if (e.relatedTarget) {
      e.relatedTarget.focus();
    } else {
      e.target.blur();
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.defaultValue !== this.props.defaultValue) {
      this._notifyIfChanged(nextProps.defaultValue || '');
      this.setState({
        value: nextProps.defaultValue || '',
      });
    }
  }

  render() {
    const { className, title } = this.props;
    return (
      <form className={classNames('idleSearchField', className)} onSubmit={e => e.preventDefault()}>
        <input type='search' name='search'
               className='idleSearchFieldInput'
               required='required'
               title={title}
               value={this.state.value}
               onChange={this._onSearchFieldChange}
               onFocus={this._onSearchFieldFocus}/>
        <input type='button'
               className='idleSearchFieldButton'
               onClick={this._onClearButtonClick}
               onFocus={this._onClearButtonFocus}/>
      </form>
    );
  }
}

IdleSearchField.propTypes = {
  onIdleAfterChange: PropTypes.func.isRequired,
  idlePeriod: PropTypes.number.isRequired,
  defaultValue: PropTypes.string,
  className: PropTypes.string,
  title: PropTypes.string,
};

export default IdleSearchField;
