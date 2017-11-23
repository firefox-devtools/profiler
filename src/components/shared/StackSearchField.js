/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { connect } from 'react-redux';
import classNames from 'classnames';

import IdleSearchField from './IdleSearchField';
import { changeCallTreeSearchString } from '../../actions/profile-view';
import {
  getCurrentSearchString,
  getSearchStrings,
} from '../../reducers/url-state';

import './StackSearchField.css';

type Props = {|
  +className?: string,
  +currentSearchString: string,
  +searchStrings: string[],
  +changeCallTreeSearchString: typeof changeCallTreeSearchString,
|};
type State = {| searchFieldFocused: boolean |};

class StackSearchField extends React.PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    (this: any)._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(
      this
    );
    (this: any)._onSearchFieldFocus = this._onSearchFieldFocus.bind(this);
    (this: any)._onSearchFieldBlur = this._onSearchFieldBlur.bind(this);

    this.state = { searchFieldFocused: false };
  }

  _onSearchFieldIdleAfterChange(value: string) {
    this.props.changeCallTreeSearchString(value);
  }

  _onSearchFieldFocus() {
    this.setState({ searchFieldFocused: true });
  }

  _onSearchFieldBlur() {
    this.setState(() => ({ searchFieldFocused: false }));
  }

  render() {
    const { currentSearchString, searchStrings, className } = this.props;
    const { searchFieldFocused } = this.state;
    const showIntroduction =
      searchFieldFocused &&
      searchStrings.length &&
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

export default connect(
  state => ({
    currentSearchString: getCurrentSearchString(state),
    searchStrings: getSearchStrings(state),
  }),
  { changeCallTreeSearchString }
)(StackSearchField);
