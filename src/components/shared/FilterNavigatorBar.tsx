/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import './FilterNavigatorBar.css';

type FilterNavigatorBarListItemProps = {
  readonly onClick?: null | ((index: number) => unknown);
  readonly index: number;
  readonly isFirstItem: boolean;
  readonly isLastItem: boolean;
  readonly isSelectedItem: boolean;
  readonly title?: string;
  readonly additionalClassName?: string;
  readonly children: React.ReactNode;
};

class FilterNavigatorBarListItem extends React.PureComponent<FilterNavigatorBarListItemProps> {
  _onClick = () => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index);
    }
  };

  override render() {
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
  readonly className: string;
  readonly items: ReadonlyArray<React.ReactNode>;
  readonly onPop: (param: number) => mixed;
  readonly selectedItem: number;
  readonly uncommittedItem?: string;
};

export class FilterNavigatorBar extends React.PureComponent<Props> {
  override render() {
    const { className, items, selectedItem, uncommittedItem, onPop } =
      this.props;

    const transitions = items.map((item, i) => (
      <CSSTransition
        key={i}
        classNames="filterNavigatorBarTransition"
        timeout={250}
      >
        <FilterNavigatorBarListItem
          index={i}
          onClick={i === items.length - 1 && !uncommittedItem ? null : onPop}
          isFirstItem={i === 0}
          isLastItem={i === items.length - 1}
          isSelectedItem={i === selectedItem}
        >
          {item}
        </FilterNavigatorBarListItem>
      </CSSTransition>
    ));

    if (uncommittedItem) {
      transitions.push(
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
      );
    }

    return (
      <TransitionGroup
        component="ol"
        className={classNames('filterNavigatorBar', className)}
      >
        {transitions}
      </TransitionGroup>
    );
  }
}
