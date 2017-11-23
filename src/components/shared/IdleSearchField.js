/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import classNames from 'classnames';

import './IdleSearchField.css';

type Props = {|
  +onIdleAfterChange: string => void,
  +onSubmit?: () => void,
  +onFocus?: () => void,
  +onBlur?: (Element | null) => void,
  +idlePeriod: number,
  +defaultValue: ?string,
  +className: ?string,
  +title: ?string,
|};

type State = {
  value: string,
};

class IdleSearchField extends PureComponent<Props, State> {
  _timeout: number;
  _previouslyNotifiedValue: string;

  constructor(props: Props) {
    super(props);
    (this: any)._onSearchFieldChange = this._onSearchFieldChange.bind(this);
    (this: any)._onSearchFieldFocus = this._onSearchFieldFocus.bind(this);
    (this: any)._onSearchFieldBlur = this._onSearchFieldBlur.bind(this);
    (this: any)._onClearButtonClick = this._onClearButtonClick.bind(this);
    (this: any)._onTimeout = this._onTimeout.bind(this);
    this._timeout = 0;
    this.state = {
      value: props.defaultValue || '',
    };
    this._previouslyNotifiedValue = this.state.value;
  }

  _onSearchFieldFocus(e: SyntheticFocusEvent<HTMLInputElement>) {
    e.currentTarget.select();

    if (this.props.onFocus) {
      this.props.onFocus();
    }
  }

  _onSearchFieldBlur(e: { relatedTarget: Element | null }) {
    if (this.props.onBlur) {
      this.props.onBlur(e.relatedTarget);
    }
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
    clearTimeout(this._timeout);
    this._timeout = 0;

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
          onBlur={this._onSearchFieldBlur}
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
