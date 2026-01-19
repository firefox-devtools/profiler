/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import './FilterNavigatorBar.css';

type FilterNavigatorBarListItemProps = {
  readonly onClick?:
    | null
    | ((index: number, event: React.MouseEvent<HTMLElement>) => unknown);
  readonly index: number;
  readonly isFirstItem: boolean;
  readonly isLastItem: boolean;
  readonly isSelectedItem: boolean;
  readonly title?: string;
  readonly additionalClassName?: string;
  readonly children: React.ReactNode;
};

class FilterNavigatorBarListItem extends React.PureComponent<FilterNavigatorBarListItemProps> {
  _onClick = (event: React.MouseEvent<HTMLElement>) => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index, event);
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
        onClick={onClick ? this._onClick : undefined}
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
  readonly onPop: (param: number) => void;
  readonly onFirstItemClick?: (event: React.MouseEvent<HTMLElement>) => void;
  readonly selectedItem: number;
  readonly uncommittedItem?: string;
};

export class FilterNavigatorBar extends React.PureComponent<Props> {
  _onPop = (index: number, _event: React.MouseEvent<HTMLElement>) => {
    const { onPop } = this.props;
    onPop(index);
  };

  _onFirstItemClick = (_: number, event: React.MouseEvent<HTMLElement>) => {
    const { onFirstItemClick } = this.props;
    if (onFirstItemClick) {
      onFirstItemClick(event);
    }
  };

  override render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      onFirstItemClick,
    } = this.props;

    return (
      <ol className={classNames('filterNavigatorBar', className)}>
        {items.map((item, i) => {
          let onClick = null;
          if (i === 0 && !uncommittedItem && onFirstItemClick) {
            onClick = this._onFirstItemClick;
          } else if (i === items.length - 1 && !uncommittedItem) {
            onClick = null;
          } else {
            onClick = this._onPop;
          }

          return (
            <FilterNavigatorBarListItem
              key={i}
              index={i}
              onClick={onClick}
              isFirstItem={i === 0}
              isLastItem={i === items.length - 1}
              isSelectedItem={i === selectedItem}
            >
              {item}
            </FilterNavigatorBarListItem>
          );
        })}
        {uncommittedItem ? (
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
        ) : null}
      </ol>
    );
  }
}
