/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';

import './IdleSearchField.css';

type Props = {
  onIdleAfterChange: string => void,
  idlePeriod: number,
  defaultValue: ?string,
  className: ?string,
  title: ?string,
};

type State = {
  value: string,
};

class IdleSearchField extends PureComponent<Props, State> {
  _onSearchFieldChange: Event => void;
  _onSearchFieldFocus: Event => void;
  _onClearButtonClick: Event => void;
  _onTimeout: void => void;
  _timeout: number;
  _previouslyNotifiedValue: string;

  constructor(props: Props) {
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

  _onSearchFieldFocus(e: SyntheticFocusEvent<HTMLInputElement>) {
    e.currentTarget.select();
  }

  _onSearchFieldChange(e: SyntheticEvent<HTMLInputElement>) {
    this.setState({
      value: e.currentTarget.value,
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

  _notifyIfChanged(value: string) {
    if (value !== this._previouslyNotifiedValue) {
      this._previouslyNotifiedValue = value;
      this.props.onIdleAfterChange(value);
    }
  }

  _onClearButtonClick() {
    this.setState({ value: '' });
    this._notifyIfChanged('');
  }

  _onClearButtonFocus(
    e: SyntheticEvent<HTMLElement> & { relatedTarget: HTMLElement }
  ) {
    // prevent the focus on the clear button
    if (e.relatedTarget) {
      e.relatedTarget.focus();
    } else {
      e.currentTarget.blur();
    }
  }

  componentWillReceiveProps(nextProps: Props) {
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
      <form
        className={classNames('idleSearchField', className)}
        onSubmit={e => e.preventDefault()}
      >
        <input
          type="search"
          name="search"
          className="idleSearchFieldInput"
          required="required"
          title={title}
          value={this.state.value}
          onChange={this._onSearchFieldChange}
          onFocus={this._onSearchFieldFocus}
        />
        <input
          type="reset"
          className="idleSearchFieldButton"
          onClick={this._onClearButtonClick}
          onFocus={this._onClearButtonFocus}
        />
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
