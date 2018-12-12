/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

import { tabsWithTitle, type TabSlug } from '../../app-logic/tabs-handling';

import './TapBar.css';

type Props = {|
  +className?: string,
  +selectedTabSlug: string,
  +visibleTabs: $ReadOnlyArray<TabSlug>,
  +onSelectTab: string => void,
  +extraElements?: React.Node,
|};

class TabBar extends React.PureComponent<Props> {
  _onClickListener = (e: SyntheticMouseEvent<HTMLElement>) => {
    this.props.onSelectTab(e.currentTarget.dataset.name);
    // Prevent focusing the tab so that actual content like the
    // calltree can perform its own focusing.
    e.preventDefault();
  };

  render() {
    const {
      className,
      selectedTabSlug,
      visibleTabs,
      extraElements,
    } = this.props;
    return (
      <div className={classNames('tabBarContainer', className)}>
        <ol
          className="tabBarTabWrapper"
          role="tablist"
          aria-label="Profiler tabs"
        >
          {visibleTabs.map(tabSlug => (
            <li
              className={classNames({
                tabBarTab: true,
                selected: tabSlug === selectedTabSlug,
              })}
              key={tabSlug}
              data-name={tabSlug}
              onClick={this._onClickListener}
            >
              {/* adding a button for better keyboard navigation  
            (allows tabbing between the different panels)
            ARIA attributes for better accessibility and usability
            (arrow navigation between the tabs) */}
              <button
                className="tapBarTabButton"
                type="button"
                id={tabSlug}
                role="tab"
                aria-selected={tabSlug === selectedTabSlug}
                aria-controls={`${tabSlug}-tab`}
                tab-index={tabSlug === selectedTabSlug ? null : -1}
              >
                {tabsWithTitle[tabSlug]}
              </button>
            </li>
          ))}
        </ol>
        {extraElements}
      </div>
    );
  }
}

export default TabBar;
