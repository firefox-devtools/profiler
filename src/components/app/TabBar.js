/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { Localized } from '@fluent/react';

import {
  tabsWithTitleL10nId,
  type TabSlug,
} from 'firefox-profiler/app-logic/tabs-handling';

import './TabBar.css';

type Props = {|
  +width: number,
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

  componentDidMount() {
    const { width } = this.props;
    if (width === 0) {
      // If the width is 0, it means that the component is not mounted yet.
      return;
    }

    const isSmall = width <= SMALL_SCREEN_BREAKPOINT;
    this.setState({ isSmallScreen: isSmall });
  }

  componentDidUpdate(prevProps: Props) {
    const { width } = this.props;
    if (width === 0) {
      // If the width is 0, it means that the component is not mounted yet.
      return;
    }

    if (prevProps.width !== width) {
      const isSmall = width <= SMALL_SCREEN_BREAKPOINT;
      if (isSmall !== this.state.isSmallScreen) {
        this.setState({ isSmallScreen: isSmall });
      }
    }
  }

  render() {
    const { selectedTabSlug, visibleTabs } = this.props;
    const { isSmallScreen } = this.state;

    return (
      <ol
        role="tablist"
        aria-label="Profiler tabs"
        className={classNames({
          tabBarTabWrapper: true,
          tabBarTabWrapperCompact: isSmallScreen,
        })}
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
