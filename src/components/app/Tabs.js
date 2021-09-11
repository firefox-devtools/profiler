/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import classNames from 'classnames';
import { Reorderable } from '../shared/Reorderable';

import './Tabs.css';

type Props = {|
  +className: string,
  +tabs: string[],
  +order: number[],
  +selectedIndex: number | null,
  +controlledElementIdForAria: string,
  +onSelectTab: number => void,
  +onCloseTab: number => void,
  +onChangeOrder: (number[]) => void,
|};

export class Tabs extends React.PureComponent<Props> {
  _onClickTab = (e: SyntheticMouseEvent<HTMLElement>) => {
    const index = +e.currentTarget.dataset.index;
    this.props.onSelectTab(index);
    e.preventDefault();
  };

  _onMouseDownCloseButton = (e: SyntheticMouseEvent<>) => {
    // Don't allow the Reorderable to see this event. We don't want dragging on the
    // close button to move the tab.
    e.stopPropagation();
  };

  _onClickTabCloseButton = (e: SyntheticMouseEvent<HTMLElement>) => {
    const parentElement = e.currentTarget.parentElement;
    if (!parentElement || !(parentElement instanceof HTMLElement)) {
      return;
    }
    const index = +parentElement.dataset.index;
    this.props.onCloseTab(index);
    e.stopPropagation(); // Don't bubble up to the tab, i.e. don't select the closing tab.
  };

  _onTabsMouseDown = (e: SyntheticMouseEvent<>) => {
    // Don't focus the tab bar on mousedown.
    e.preventDefault();
  };

  _onTabsKeyDown = (event: SyntheticKeyboardEvent<>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
      return;
    }
    const { selectedIndex, tabs, order, onSelectTab } = this.props;

    if (tabs.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        if (selectedIndex === null) {
          onSelectTab(
            event.key === 'ArrowLeft' ? order[order.length - 1] : order[0]
          );
        } else {
          const delta = event.key === 'ArrowLeft' ? -1 : 1;
          const selectedIndexInOrder = order.indexOf(selectedIndex);
          const newIndexInOrder = Math.max(
            0,
            Math.min(order.length - 1, selectedIndexInOrder + delta)
          );
          onSelectTab(order[newIndexInOrder]);
        }
        break;
      case 'Home':
        onSelectTab(order[0]);
        break;
      case 'End':
        onSelectTab(order[order.length - 1]);
        break;
      default:
    }
  };

  render() {
    const {
      tabs,
      order,
      selectedIndex,
      onChangeOrder,
      className,
      controlledElementIdForAria,
    } = this.props;

    return (
      <div
        className={classNames(className, 'tabs')}
        tabIndex="0"
        onMouseDown={this._onTabsMouseDown}
        onKeyDown={this._onTabsKeyDown}
      >
        <Reorderable
          tagName="ol"
          className="tabs-reorderable"
          grippyClassName="tab"
          order={order}
          orient="horizontal"
          onChangeOrder={onChangeOrder}
        >
          {tabs.map((tab, index) => {
            return (
              <li
                key={index}
                data-index={index}
                className={classNames('tab', {
                  'tab--selected': index === selectedIndex,
                })}
                role="tab"
                aria-selected={index === selectedIndex}
                aria-controls={controlledElementIdForAria}
                onMouseDown={this._onClickTab}
              >
                <span className="tab-text">{tab}</span>
                <button
                  className={classNames('tab-close-button')}
                  title={`Close ${tab}`}
                  type="button"
                  onClick={this._onClickTabCloseButton}
                  onMouseDown={this._onMouseDownCloseButton}
                  tabIndex={index === selectedIndex ? 0 : -1}
                />
              </li>
            );
          })}
        </Reorderable>
      </div>
    );
  }
}
