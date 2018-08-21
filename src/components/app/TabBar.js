/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import Reorderable from '../shared/Reorderable';

import type { Action } from '../../types/actions';
import type { TabWithTitle } from '../../app-logic/tabs-handling';

type Props = {|
  +className?: string,
  +tabs: $ReadOnlyArray<TabWithTitle>,
  +selectedTabName: string,
  +tabOrder: number[],
  +onSelectTab: string => void,
  +onChangeTabOrder: (number[]) => Action,
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
      tabOrder,
      onChangeTabOrder,
      extraElements,
    } = this.props;
    return (
      <div className={classNames('tabBarContainer', className)}>
        <Reorderable
          tagName="ol"
          className="tabBarTabWrapper"
          grippyClassName="grippy"
          order={tabOrder}
          orient="horizontal"
          onChangeOrder={onChangeTabOrder}
        >
          {tabs.map(({ name, title }, i) => (
            <li
              className={classNames('tabBarTab', 'grippy', {
                selected: name === selectedTabName,
              })}
              key={i}
              data-name={name}
              onMouseDown={this._mouseDownListener}
            >
              {title}
            </li>
          ))}
        </Reorderable>
        {extraElements}
      </div>
    );
  }
}

export default TabBar;
