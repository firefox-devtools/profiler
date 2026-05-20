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
  // When true, the "f" key (in addition to "/") will also focus the search
  // field. This is opt-in because some panels (e.g. those showing frames) use
  // "f" as a call node transform shortcut.
  readonly alsoFocusOnF?: boolean;
};

type State = { searchFieldFocused: boolean };

export class PanelSearch extends React.PureComponent<Props, State> {
  override state = { searchFieldFocused: false };
  _searchFieldWrapper = React.createRef<HTMLDivElement>();

  _onSearchFieldIdleAfterChange = (value: string) => {
    this.props.onSearch(value);
  };

  _onSearchFieldFocus = () => {
    this.setState({ searchFieldFocused: true });
  };

  _onSearchFieldBlur = () => {
    this.setState(() => ({ searchFieldFocused: false }));
  };

  override componentDidMount() {
    window.addEventListener('keydown', this._handleGlobalKeyDown);
  }

  override componentWillUnmount() {
    window.removeEventListener('keydown', this._handleGlobalKeyDown);
  }

  _handleGlobalKeyDown = (event: KeyboardEvent) => {
    // Ignore key combinations involving modifier keys, so we don't interfere
    // with browser or OS shortcuts.
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    const isSlash = event.key === '/';
    const isF = this.props.alsoFocusOnF && event.key === 'f';
    if (!isSlash && !isF) {
      return;
    }

    // Don't steal the key when the user is already typing in a text input,
    // textarea, contenteditable element, or interacting with a select.
    const target = event.target;
    if (target instanceof HTMLElement) {
      const tagName = target.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
    }

    const wrapper = this._searchFieldWrapper.current;
    if (!wrapper) {
      return;
    }
    const input = wrapper.querySelector<HTMLInputElement>(
      'input[type="search"]'
    );
    if (input) {
      event.preventDefault();
      input.focus();
    }
  };

  override render() {
    const { label, title, currentSearchString, className } = this.props;
    const { searchFieldFocused } = this.state;
    const showIntroduction =
      searchFieldFocused &&
      currentSearchString &&
      !currentSearchString.includes(',');
    return (
      <div
        className={classNames('panelSearchField', className)}
        ref={this._searchFieldWrapper}
      >
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
