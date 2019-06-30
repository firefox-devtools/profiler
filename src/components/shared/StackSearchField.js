/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import IdleSearchField from './IdleSearchField';

import './StackSearchField.css';

type Props = {|
  +className: string,
  +currentSearchString: string,
  +onSearch: string => void,
|};

type State = {| searchFieldFocused: boolean |};

class StackSearchField extends React.PureComponent<Props, State> {
  state = { searchFieldFocused: false };
  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.onSearch(value);
  };

  _onSearchFieldFocus = () => {
    this.setState({ searchFieldFocused: true });
  };

  _onSearchFieldBlur = () => {
    this.setState(() => ({ searchFieldFocused: false }));
  };

  render() {
    const { currentSearchString, className } = this.props;
    const { searchFieldFocused } = this.state;
    const showIntroduction =
      searchFieldFocused &&
      currentSearchString &&
      !currentSearchString.includes(',');
    return (
      <div className={classNames('stackSearchField', className)}>
        <label className="stackSearchFieldLabel">
          {'Filter stacks: '}
          <IdleSearchField
            className="stackSearchFieldInput"
            title="Only display stacks which contain a function whose name matches this substring"
            idlePeriod={200}
            defaultValue={currentSearchString}
            onIdleAfterChange={this._onSearchFieldIdleAfterChange}
            onBlur={this._onSearchFieldBlur}
            onFocus={this._onSearchFieldFocus}
          />
          <div
            className={classNames('stackSearchFieldIntroduction', {
              isHidden: !showIntroduction,
              isDisplayed: showIntroduction,
            })}
          >
            Did you know you can use the comma (,) to search using several
            terms?
          </div>
        </label>
      </div>
    );
  }
}

export default StackSearchField;
