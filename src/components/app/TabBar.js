/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';

import type { TabWithTitle } from '../../app-logic/tabs-handling';

type Props = {|
  +className?: string,
  +tabs: $ReadOnlyArray<TabWithTitle>,
  +selectedTabName: string,
  +visibleTabs: $ReadOnlyArray<number>,
  +onSelectTab: string => void,
  +extraElements?: React.Node,
|};

class TabBar extends React.PureComponent<Props> {
  _mouseDownListener = (e: SyntheticMouseEvent<HTMLElement>) => {
    this.props.onSelectTab(e.currentTarget.dataset.name);
    // Prevent focusing the tab so that actual content like the
    // calltree can perform its own focusing.
    e.preventDefault();
  };

  render() {
    const {
      className,
      tabs,
      selectedTabName,
      visibleTabs,
      extraElements,
    } = this.props;
    return (
      <div className={classNames('tabBarContainer', className)}>
        <ol className="tabBarTabWrapper">
          {visibleTabs.map(tabIndex => {
            const { name, title } = tabs[tabIndex];
            return (
              <li
                className={classNames({
                  tabBarTab: true,
                  selected: name === selectedTabName,
                })}
                key={name}
                data-name={name}
                onMouseDown={this._mouseDownListener}
              >
                {title}
              </li>
            );
          })}
        </ol>
        {extraElements}
      </div>
    );
  }
}

export default TabBar;
