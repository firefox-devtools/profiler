/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import classNames from 'classnames';
import { IdleSearchField } from './IdleSearchField';

import './PanelSearch.css';
import { Localized } from '@fluent/react';

type Props = {
  readonly className: string;
  readonly label: string;
  readonly title: string;
  readonly currentSearchString: string;
  readonly onSearch: (param: string) => void;
};

type State = { searchFieldFocused: boolean };

export class PanelSearch extends React.PureComponent<Props, State> {
  override state = { searchFieldFocused: false };
  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.onSearch(value);
  };

  _onSearchFieldFocus = () => {
    this.setState({ searchFieldFocused: true });
  };

  _onSearchFieldBlur = () => {
    this.setState(() => ({ searchFieldFocused: false }));
  };

  override render() {
    const { label, title, currentSearchString, className } = this.props;
    const { searchFieldFocused } = this.state;
    const showIntroduction =
      searchFieldFocused &&
      currentSearchString &&
      !currentSearchString.includes(',');
    return (
      <div className={classNames('panelSearchField', className)}>
        <label className="panelSearchFieldLabel">
          {label + ' '}
          <IdleSearchField
            className="panelSearchFieldInput"
            title={title}
            idlePeriod={200}
            defaultValue={currentSearchString}
            onIdleAfterChange={this._onSearchFieldIdleAfterChange}
            onBlur={this._onSearchFieldBlur}
            onFocus={this._onSearchFieldFocus}
          />
        </label>
        <div
          className={classNames('panelSearchFieldIntroduction', {
            isHidden: !showIntroduction,
            isDisplayed: showIntroduction,
          })}
        >
          <Localized id="PanelSearch--search-field-hint">
            Did you know you can use the comma (,) to search using several
            terms?
          </Localized>
        </div>
      </div>
    );
  }
}
