/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React from 'react';
import classNames from 'classnames';
import { Reorderable } from '../shared/Reorderable';

import './Tabs.css';
import { Localized } from '@fluent/react';

type Props = {|
  +className: string,
  +ariaLabel?: string,
  +tabs: string[],
  +selectedIndex: number | null,
  +controlledElementIdForAria: string,
  +onSelectTab: (number) => void,

  // Optional. If not specified, no close buttons are displayed.
  +onCloseTab?: (number) => void,

  // Both optional. Only if both are specified, tab dragging will be allowed.
  +order?: number[],
  +onChangeOrder?: (number[]) => void,
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
    const { onCloseTab } = this.props;
    if (!onCloseTab) {
      return;
    }
    const parentElement = e.currentTarget.parentElement;
    if (!parentElement || !(parentElement instanceof HTMLElement)) {
      return;
    }
    const index = +parentElement.dataset.index;
    onCloseTab(index);
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
    const { selectedIndex, tabs, onSelectTab } = this.props;

    if (tabs.length === 0) {
      return;
    }

    const order = this.props.order ?? tabs.map((_tab, i) => i);

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
      className,
      tabs,
      selectedIndex,
      controlledElementIdForAria,
      order,
      onChangeOrder,
      onCloseTab,
      ariaLabel,
    } = this.props;

    let renderedTabs = tabs.map((tab, index) => {
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
          {onCloseTab ? (
            <Localized
              id="Tabs--close-button"
              attrs={{ title: true }}
              vars={{ tab }}
            >
              <button
                className={classNames('tab-close-button')}
                title={`Close ${tab}`}
                type="button"
                onClick={this._onClickTabCloseButton}
                onMouseDown={this._onMouseDownCloseButton}
                tabIndex={index === selectedIndex ? 0 : -1}
              />
            </Localized>
          ) : null}
        </li>
      );
    });

    if (order && onChangeOrder) {
      renderedTabs = (
        <Reorderable
          tagName="ol"
          className="tabs-list"
          role="tablist"
          ariaLabel={ariaLabel}
          grippyClassName="tab"
          order={order}
          orient="horizontal"
          onChangeOrder={onChangeOrder}
        >
          {renderedTabs}
        </Reorderable>
      );
    } else {
      renderedTabs = (
        <ol className="tabs-list" role="tablist" aria-label={ariaLabel}>
          {renderedTabs}
        </ol>
      );
    }

    return (
      <div
        className={classNames(className, 'tabs')}
        // Allow focusing this element with the keyboard
        tabIndex="0"
        // ... but not with the mouse.
        onMouseDown={this._onTabsMouseDown}
        // Handle arrow keys and home / end keys when focused.
        onKeyDown={this._onTabsKeyDown}
      >
        {renderedTabs}
      </div>
    );
  }
}
