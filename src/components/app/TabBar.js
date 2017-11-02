/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import classNames from 'classnames';
import Reorderable from '../shared/Reorderable';

import type { Action, TabSlug } from '../../types/actions';

export type Tab = {
  name: TabSlug,
  title: string,
};

type Props = {
  className?: string,
  tabs: Tab[],
  selectedTabName: string,
  tabOrder: number[],
  onSelectTab: string => void,
  onChangeTabOrder: (number[]) => Action,
};

class TabBar extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any)._mouseDownListener = this._mouseDownListener.bind(this);
  }

  _mouseDownListener(e: SyntheticMouseEvent<HTMLElement>) {
    this.props.onSelectTab(e.currentTarget.dataset.name);
  }

  render() {
    const {
      className,
      tabs,
      selectedTabName,
      tabOrder,
      onChangeTabOrder,
    } = this.props;
    return (
      <div className={classNames('tabBarContainer', className)}>
        <Reorderable
          tagName="ol"
          className="tabBarTabWrapper"
          order={tabOrder}
          orient="horizontal"
          onChangeOrder={onChangeTabOrder}
        >
          {tabs.map(({ name, title }, i) =>
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
          )}
        </Reorderable>
      </div>
    );
  }
}

TabBar.propTypes = {
  className: PropTypes.string,
  tabs: PropTypes.arrayOf(
    PropTypes.shape({
      name: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
    })
  ).isRequired,
  selectedTabName: PropTypes.string.isRequired,
  tabOrder: PropTypes.arrayOf(PropTypes.number).isRequired,
  onSelectTab: PropTypes.func.isRequired,
  onChangeTabOrder: PropTypes.func.isRequired,
};

export default TabBar;
