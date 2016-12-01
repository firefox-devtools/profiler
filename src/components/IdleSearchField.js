import React, { Component, PropTypes } from 'react';
import classNames from 'classnames';

import './IdleSearchField.css';

class IdleSearchField extends Component {
  constructor(props) {
    super(props);
    this._onSearchFieldInput = this._onSearchFieldInput.bind(this);
    this._onSearchFieldClick = this._onSearchFieldClick.bind(this);
    this._onTimeout = this._onTimeout.bind(this);
    this._searchFieldCreated = elem => { this._searchField = elem; };
    this._timeout = 0;
    this._previouslyNotifiedValue = props.defaultValue || '';
  }

  _onSearchFieldClick() {
    if (this._searchField) {
      this._searchField.select();
    }
  }

  _onSearchFieldInput() {
    if (this._timeout) {
      clearTimeout(this._timeout);
    }
    const { idlePeriod } = this.props;
    this._timeout = setTimeout(this._onTimeout, idlePeriod);
  }

  _onTimeout() {
    if (this._searchField) {
      const value = this._searchField.value;
      if (value !== this._previouslyNotifiedValue) {
        this._previouslyNotifiedValue = value;
        this.props.onIdleAfterChange(value);
      }
    }
  }

  render() {
    const { className, defaultValue } = this.props;
    return (
      <input type='search'
             className={classNames('idleSearchField', className)}
             defaultValue={defaultValue}
             ref={this._searchFieldCreated}
             onInput={this._onSearchFieldInput}
             onClick={this._onSearchFieldClick}/>
    );
  }
}

IdleSearchField.propTypes = {
  onIdleAfterChange: PropTypes.func.isRequired,
  idlePeriod: PropTypes.number.isRequired,
  defaultValue: PropTypes.string,
  className: PropTypes.string,
};

export default IdleSearchField;
