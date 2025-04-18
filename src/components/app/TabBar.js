/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';
import debounce from 'lodash.debounce';

import {
  tabsWithTitleL10nId,
  type TabSlug,
} from 'firefox-profiler/app-logic/tabs-handling';

import './TabBar.css';
import './ResponsiveTabBar.css';

type Props = {|
  +selectedTabSlug: string,
  +visibleTabs: $ReadOnlyArray<TabSlug>,
  +onSelectTab: (string) => void,
|};

const SMALL_SCREEN_BREAKPOINT = 768;

type State = { isSmallScreen: boolean };

export class TabBar extends React.PureComponent<Props, State> {
  state: State = { isSmallScreen: false };

  _onClickListener = (e: SyntheticMouseEvent<HTMLElement>) => {
    this.props.onSelectTab(e.currentTarget.dataset.name);
  };

  _onMouseDown = (e: SyntheticMouseEvent<HTMLElement>) => {
    this.props.onSelectTab(e.currentTarget.dataset.name);
    // Prevent focusing the tab so that actual content like the
    // calltree can perform its own focusing.
    e.preventDefault();
  };

  /* responsive tabBar methods */
  // Using a debounce function to limit the number of times
  // the resize event is triggered.
  _componentResizeListener = debounce(() => {
    const isSmall = window.innerWidth <= SMALL_SCREEN_BREAKPOINT;
    if (isSmall !== this.state.isSmallScreen) {
      this.setState({ isSmallScreen: isSmall });
    }
  }, 150);

  _onDropdownChange = (e: SyntheticEvent<HTMLSelectElement>) => {
    this.props.onSelectTab(e.currentTarget.value);
  };

  componentDidMount() {
    this.setState({
      isSmallScreen: window.innerWidth <= SMALL_SCREEN_BREAKPOINT,
    });
    window.addEventListener('resize', this._componentResizeListener);
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this._componentResizeListener);
  }

  render() {
    const { selectedTabSlug, visibleTabs } = this.props;
    const isSmallScreen = this.state.isSmallScreen;

    if (isSmallScreen) {
      return (
        <div className="tabBarTabWrapper--compact">
          <Localized id="profiler-tabBar-dropdown">
            <label
              htmlFor="tabBarDropdownSelect"
              className="tabBarDropdownLabel"
            >
              Select a tab
            </label>
          </Localized>
          <select
            id="tabBarDropdownSelect"
            value={selectedTabSlug}
            onChange={this._onDropdownChange}
            className="tabBarDropdown"
          >
            {visibleTabs.map((tabSlug) => (
              <option
                id={`${tabSlug}-tab-option`}
                key={tabSlug}
                value={tabSlug}
                role="option"
              >
                <Localized id={tabsWithTitleL10nId[tabSlug]}>
                  {tabsWithTitleL10nId[tabSlug]}
                </Localized>
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <ol
        className="tabBarTabWrapper"
        role="tablist"
        aria-label="Profiler tabs"
      >
        {visibleTabs.map((tabSlug) => (
          <li
            className={classNames({
              tabBarTab: true,
              selected: tabSlug === selectedTabSlug,
            })}
            key={tabSlug}
            data-name={tabSlug}
            onClick={this._onClickListener}
            onMouseDown={this._onMouseDown}
          >
            {/* adding a button for better keyboard navigation and
              adding ARIA attributes for screen reader support.*/}
            <Localized id={tabsWithTitleL10nId[tabSlug]}>
              <button
                className="tabBarTabButton"
                type="button"
                // The tab's id attribute connects the tab to its tabpanel
                // that has an aria-labelledby attribute of the same value.
                // The id is not used for CSS styling.
                id={`${tabSlug}-tab-button`}
                role="tab"
                aria-selected={tabSlug === selectedTabSlug}
                // The control and content relationship is established
                // with aria-controls attribute
                // (the tabbanel has an id of the same value).
                aria-controls={`${tabSlug}-tab`}
              >
                {tabsWithTitleL10nId[tabSlug]}
              </button>
            </Localized>
          </li>
        ))}
      </ol>
    );
  }
}
