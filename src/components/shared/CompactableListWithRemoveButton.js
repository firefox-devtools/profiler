/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { CSSTransition, TransitionGroup } from 'react-transition-group';

import './CompactableListWithRemoveButton.css';

function englishListJoin(list: React$Element<any>[]) {
  switch (list.length) {
    case 0:
      return null;
    case 1:
      return list[0];
    default: {
      const result = list.reduce((result, item) => {
        result.push(item, ', ');
        return result;
      }, []);
      result.pop(); // remove last comma
      result[result.length - 2] = ' and '; // replace last comma with 'and'
      return result;
    }
  }
}

type Props = {|
  +className?: string,
  +compact: boolean,
  +items: string[],
  +buttonTitle: string,
  +showIntroduction: string,
  +onItemRemove: number => mixed,
|};

export default class CompactableListWithRemoveButton extends PureComponent {
  props: Props;

  constructor(props: Props) {
    super(props);

    (this: any)._onRemoveButtonMouseDown = this._onRemoveButtonMouseDown.bind(
      this
    );
  }

  // We use the mousedown event so that we can avoid that the input loses the focus.
  _onRemoveButtonMouseDown(
    e: SyntheticMouseEvent & { currentTarget: HTMLButtonElement }
  ) {
    e.preventDefault(); // prevents losing the focus
    this.props.onItemRemove(+e.currentTarget.dataset.index);
  }

  _renderFull() {
    const { items, buttonTitle, showIntroduction } = this.props;

    if (showIntroduction && !items.length) {
      return (
        <div className="listWithRemoveButton_introduction">
          {showIntroduction}
        </div>
      );
    }

    return (
      <TransitionGroup className="listWithRemoveButton_full">
        {items.map((item, i) =>
          <CSSTransition
            key={item}
            classNames="listWithRemoveButton_full_transition"
            timeout={300}
          >
            <div className="listWithRemoveButton_full-itemBox">
              <div className="listWithRemoveButton_full-item">
                {item}
              </div>
              <button
                className="listWithRemoveButton_full-button"
                title={buttonTitle}
                aria-label={buttonTitle}
                data-index={i}
                type="button"
                onMouseDown={this._onRemoveButtonMouseDown}
              >
                ✕
              </button>
            </div>
          </CSSTransition>
        )}
      </TransitionGroup>
    );
  }

  _renderCompact() {
    const { items } = this.props;
    if (!items.length) {
      return null;
    }

    return (
      <div className="listWithRemoveButton_compact">
        <div className="listWithRemoveButton_compact-itemList" key="itemList">
          {englishListJoin(
            items.map(item =>
              <span key={item}>
                {item}
              </span>
            )
          )}
        </div>
        <div className="listWithRemoveButton_compact-itemCount" key="itemCount">
          ({items.length})
        </div>
      </div>
    );
  }

  render() {
    const { className, compact } = this.props;

    const classes = classNames(
      'listWithRemoveButton',
      className,
      `listWithRemoveButton_${compact ? 'isCompact' : 'isFull'}`
    );

    return (
      <div className={classes}>
        {this._renderCompact()}
        {this._renderFull()}
      </div>
    );
  }
}
