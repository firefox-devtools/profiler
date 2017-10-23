/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import classNames from 'classnames';

import './IdleSearchField.css';

type Props = {
  onIdleAfterChange: string => void,
  onSubmit?: () => void,
  idlePeriod: number,
  defaultValue: ?string,
  className: ?string,
  title: ?string,
};

class IdleSearchField extends PureComponent {
  _timeout: number;
  _previouslyNotifiedValue: string;

  props: Props;

  state: {
    value: string,
  };

  constructor(props: Props) {
    super(props);
    (this: any)._onSearchFieldChange = this._onSearchFieldChange.bind(this);
    (this: any)._onSearchFieldFocus = this._onSearchFieldFocus.bind(this);
    (this: any)._onClearButtonClick = this._onClearButtonClick.bind(this);
    (this: any)._onFormSubmit = this._onFormSubmit.bind(this);
    (this: any)._onTimeout = this._onTimeout.bind(this);
    this._timeout = 0;
    this.state = {
      value: props.defaultValue || '',
    };
    this._previouslyNotifiedValue = this.state.value;
  }

  _onSearchFieldFocus(e: Event & { currentTarget: HTMLInputElement }) {
    e.currentTarget.select();
  }

  _onSearchFieldChange(e: Event & { currentTarget: HTMLInputElement }) {
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
    clearTimeout(this._timeout);
    this._timeout = 0;

    this.setState({ value: '' });
    this._notifyIfChanged('');
  }

  _onClearButtonFocus(
    e: Event & { relatedTarget: HTMLElement, currentTarget: HTMLElement }
  ) {
    // prevent the focus on the clear button
    if (e.relatedTarget) {
      e.relatedTarget.focus();
    } else {
      e.currentTarget.blur();
    }
  }

  _onFormSubmit(e: SyntheticEvent & { currentTarget: HTMLElement }) {
    e.preventDefault();

    // 1. Notify the current value
    clearTimeout(this._timeout);
    this._timeout = 0;
    this._notifyIfChanged(this.state.value);

    // 2. Notify the user wants to persist this value
    const { onSubmit } = this.props;
    if (onSubmit) {
      onSubmit();
    }

    // 3. Update our local state
    this.setState({ value: '' });
    this._notifyIfChanged('');
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
        onSubmit={this._onFormSubmit}
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

export default IdleSearchField;
