/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import './FilterNavigatorBar.css';

type FilterNavigatorBarListItemProps = {
  +onClick?: null | ((number) => mixed),
  +index: number,
  +isFirstItem: boolean,
  +isLastItem: boolean,
  +isSelectedItem: boolean,
  +title?: string,
  +additionalClassName?: string,
  +children: React.Node,
};

class FilterNavigatorBarListItem extends React.PureComponent<FilterNavigatorBarListItemProps> {
  _onClick = () => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index);
    }
  };

  render() {
    const {
      isFirstItem,
      isLastItem,
      isSelectedItem,
      children,
      additionalClassName,
      onClick,
      title,
    } = this.props;
    return (
      <li
        className={classNames('filterNavigatorBarItem', additionalClassName, {
          filterNavigatorBarRootItem: isFirstItem,
          filterNavigatorBarSelectedItem: isSelectedItem,
          filterNavigatorBarLeafItem: isLastItem,
        })}
        title={title}
        onClick={onClick ? this._onClick : null}
      >
        {onClick ? (
          <button type="button" className="filterNavigatorBarItemContent">
            {children}
          </button>
        ) : (
          <span className="filterNavigatorBarItemContent">{children}</span>
        )}
      </li>
    );
  }
}

type Props = {
  +className: string,
  +items: $ReadOnlyArray<React.Node>,
  +onPop: (number) => mixed,
  +selectedItem: number,
  +uncommittedItem?: string,
};

export class FilterNavigatorBar extends React.PureComponent<Props> {
  render() {
    const { className, items, selectedItem, uncommittedItem, onPop } =
      this.props;
    return (
      <TransitionGroup
        component="ol"
        className={classNames('filterNavigatorBar', className)}
      >
        {items.map((item, i) => (
          <CSSTransition
            key={i}
            classNames="filterNavigatorBarTransition"
            timeout={250}
          >
            <FilterNavigatorBarListItem
              index={i}
              onClick={
                i === items.length - 1 && !uncommittedItem ? null : onPop
              }
              isFirstItem={i === 0}
              isLastItem={i === items.length - 1}
              isSelectedItem={i === selectedItem}
            >
              {item}
            </FilterNavigatorBarListItem>
          </CSSTransition>
        ))}
        {uncommittedItem ? (
          <CSSTransition
            key={items.length}
            classNames="filterNavigatorBarUncommittedTransition"
            timeout={0}
          >
            <FilterNavigatorBarListItem
              index={items.length}
              isFirstItem={false}
              isLastItem={true}
              isSelectedItem={false}
              additionalClassName="filterNavigatorBarUncommittedItem"
              title={uncommittedItem}
            >
              {uncommittedItem}
            </FilterNavigatorBarListItem>
          </CSSTransition>
        ) : null}
      </TransitionGroup>
    );
  }
}
