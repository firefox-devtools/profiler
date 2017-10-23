/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import {
  changeImplementationFilter,
  changeInvertCallstack,
  commitCallTreeSearchString,
  changeCurrentCallTreeSearchString,
  popCallTreeSearchString,
} from '../../actions/profile-view';
import {
  getImplementationFilter,
  getInvertCallstack,
  getCurrentSearchString,
  getSearchStrings,
} from '../../reducers/url-state';
import IdleSearchField from '../shared/IdleSearchField';
import CompactableListWithRemoveButton from '../shared/CompactableListWithRemoveButton';
import { toValidImplementationFilter } from '../../profile-logic/profile-data';

import './ProfileCallTreeSettings.css';

import type { ImplementationFilter } from '../../types/actions';

type Props = {
  implementationFilter: ImplementationFilter,
  invertCallstack: boolean,
  currentSearchString: string,
  searchStrings: string[],
  changeImplementationFilter: typeof changeImplementationFilter,
  changeInvertCallstack: typeof changeInvertCallstack,
  commitCallTreeSearchString: typeof commitCallTreeSearchString,
  changeCurrentCallTreeSearchString: typeof changeCurrentCallTreeSearchString,
  popCallTreeSearchString: typeof popCallTreeSearchString,
};

class ProfileCallTreeSettings extends PureComponent {
  props: Props;
  state: {| focused: boolean |};

  constructor(props: Props) {
    super(props);
    (this: any)._onImplementationFilterChange = this._onImplementationFilterChange.bind(
      this
    );
    (this: any)._onInvertCallstackClick = this._onInvertCallstackClick.bind(
      this
    );
    (this: any)._onSearchFieldIdleAfterChange = this._onSearchFieldIdleAfterChange.bind(
      this
    );
    (this: any)._onSearchFieldSubmit = this._onSearchFieldSubmit.bind(this);
    (this: any)._onSearchStringRemove = this._onSearchStringRemove.bind(this);
    (this: any)._onSearchFieldFocus = this._onSearchFieldFocus.bind(this);
    (this: any)._onSearchFieldBlur = this._onSearchFieldBlur.bind(this);

    this.state = { focused: false };
  }

  _onImplementationFilterChange(e: Event & { target: HTMLSelectElement }) {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.target.value)
    );
  }

  _onInvertCallstackClick(e: Event & { target: HTMLInputElement }) {
    this.props.changeInvertCallstack(e.target.checked);
  }

  _onSearchFieldIdleAfterChange(value: string) {
    this.props.changeCurrentCallTreeSearchString(value);
  }

  _onSearchFieldFocus() {
    this.setState({ focused: true });
  }

  _onSearchFieldBlur() {
    this.setState(() => ({ focused: false }));
  }

  _onSearchFieldSubmit() {
    this.props.commitCallTreeSearchString();
  }

  _onSearchStringRemove(searchStringIdx: number) {
    const searchString = this.props.searchStrings[searchStringIdx];
    this.props.popCallTreeSearchString(searchString);
  }

  render() {
    const {
      implementationFilter,
      invertCallstack,
      currentSearchString,
      searchStrings,
    } = this.props;
    const { focused } = this.state;

    return (
      <div className="profileCallTreeSettings">
        <ul className="profileCallTreeSettingsList">
          <li className="profileCallTreeSettingsListItem">
            <label className="profileCallTreeSettingsLabel">
              Filter:
              <select
                className="profileCallTreeSettingsSelect"
                onChange={this._onImplementationFilterChange}
                value={implementationFilter}
              >
                <option value="combined">Combined stacks</option>
                <option value="js">JS only</option>
                <option value="cpp">C++ only</option>
              </select>
            </label>
          </li>
          <li className="profileCallTreeSettingsListItem">
            <label className="profileCallTreeSettingsLabel">
              <input
                type="checkbox"
                className="profileCallTreeSettingsCheckbox"
                onChange={this._onInvertCallstackClick}
                checked={invertCallstack}
              />
              {' Invert call stack'}
            </label>
          </li>
        </ul>
        <div className="profileCallTreeSettingsSearchbar">
          <label className="profileCallTreeSettingsSearchbarLabel">
            {'Filter stacks: '}
            <IdleSearchField
              className="profileCallTreeSettingsSearchField"
              title="Only display stacks which contain a function whose name matches this substring"
              idlePeriod={200}
              defaultValue={currentSearchString}
              onIdleAfterChange={this._onSearchFieldIdleAfterChange}
              onSubmit={this._onSearchFieldSubmit}
              onBlur={this._onSearchFieldBlur}
              onFocus={this._onSearchFieldFocus}
            />
            <CompactableListWithRemoveButton
              items={searchStrings}
              compact={!focused}
              showIntroduction={
                currentSearchString.length > 0
                  ? 'You can press enter to persist this search term.'
                  : ''
              }
              buttonTitle="Remove"
              onItemRemove={this._onSearchStringRemove}
            />
          </label>
        </div>
      </div>
    );
  }
}

export default connect(
  state => ({
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    currentSearchString: getCurrentSearchString(state),
    searchStrings: getSearchStrings(state),
  }),
  {
    changeImplementationFilter,
    changeInvertCallstack,
    changeCurrentCallTreeSearchString,
    commitCallTreeSearchString,
    popCallTreeSearchString,
  }
)(ProfileCallTreeSettings);
