/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { CSSTransition, TransitionGroup } from 'react-transition-group';
import './FilterNavigatorBar.css';

type FilterNavigatorBarButtonProps = {|
  onClick: (number) => mixed,
  index: number,
  children: React.Node,
|};

class FilterNavigatorBarButton extends React.PureComponent<FilterNavigatorBarButtonProps> {
  _onClick = () => {
    const { index, onClick } = this.props;
    onClick(index);
  };

  render() {
    return (
      <button
        type="button"
        className="filterNavigatorBarItemContent"
        onClick={this._onClick}
      >
        {this.props.children}
      </button>
    );
  }
}

type Props = {|
  +className: string,
  +items: $ReadOnlyArray<React.Node>,
  +onPop: (number) => mixed,
  +selectedItem: number,
  +uncommittedItem?: string,
|};

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
            <li
              className={classNames('filterNavigatorBarItem', {
                filterNavigatorBarRootItem: i === 0,
                filterNavigatorBarBeforeSelectedItem: i === selectedItem - 1,
                filterNavigatorBarSelectedItem: i === selectedItem,
                filterNavigatorBarLeafItem: i === items.length - 1,
              })}
            >
              {i === items.length - 1 && !uncommittedItem ? (
                <span className="filterNavigatorBarItemContent">{item}</span>
              ) : (
                <FilterNavigatorBarButton index={i} onClick={onPop}>
                  {item}
                </FilterNavigatorBarButton>
              )}
            </li>
          </CSSTransition>
        ))}
        {uncommittedItem ? (
          <CSSTransition
            key={items.length}
            classNames="filterNavigatorBarUncommittedTransition"
            timeout={0}
          >
            <li
              className={classNames(
                'filterNavigatorBarItem',
                'filterNavigatorBarLeafItem',
                'filterNavigatorBarUncommittedItem'
              )}
              title={uncommittedItem}
            >
              <span className="filterNavigatorBarItemContent">
                {uncommittedItem}
              </span>
            </li>
          </CSSTransition>
        ) : null}
      </TransitionGroup>
    );
  }
}
