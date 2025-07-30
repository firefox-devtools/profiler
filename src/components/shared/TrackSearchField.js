/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

import './TrackSearchField.css';

type Props = {
  readonly className: string,
  readonly currentSearchString: string,
  readonly onSearch: (string) => void,
};

export class TrackSearchField extends React.PureComponent<Props> {
  searchFieldInput: { current: HTMLInputElement | null } = React.createRef();
  _onSearchFieldChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.onSearch(e.currentTarget.value);
  };

  /* This is called from TrackContextMenu directly */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus = () => {
    if (this.searchFieldInput.current) {
      this.searchFieldInput.current.focus();
    }
  };

  _onFormSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
  }

  _onClearButtonClick = () => {
    if (this.searchFieldInput.current) {
      this.searchFieldInput.current.focus();
    }

    this.props.onSearch('');
  };

  render() {
    const { currentSearchString, className } = this.props;
    return (
      <form
        className={classNames('trackSearchField', className)}
        onSubmit={this._onFormSubmit}
      >
        <Localized
          id="TrackSearchField--search-input"
          attrs={{ placeholder: true, title: true }}
        >
          <input
            type="search"
            name="search"
            placeholder="Enter filter terms"
            className="trackSearchFieldInput photon-input"
            required="required"
            title="Only display tracks that match a certain text"
            value={currentSearchString}
            onChange={this._onSearchFieldChange}
            ref={this.searchFieldInput}
            autoComplete="off"
          />
        </Localized>
        <input
          type="reset"
          className="trackSearchFieldButton"
          onClick={this._onClearButtonClick}
          tabIndex={-1}
        />
      </form>
    );
  }
}
