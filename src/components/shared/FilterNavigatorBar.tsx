/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import './FilterNavigatorBar.css';

import type {
  commitRange,
  updatePreviewSelection,
} from 'firefox-profiler/actions/profile-view';

import type { WrapFunctionInDispatch } from 'firefox-profiler/utils/connect';
import type {
  Milliseconds,
  PreviewSelection,
  StartEndRange,
} from 'firefox-profiler/types';

type UpdatePreviewSelection = typeof updatePreviewSelection;

type FilterNavigatorBarListItemProps = {
  readonly onClick?: null | ((index: number) => unknown);
  readonly index: number;
  readonly isFirstItem: boolean;
  readonly isLastItem: boolean;
  readonly isSelectedItem: boolean;
  readonly isUncommittedItem: boolean;
  readonly uncommittedValue?: string;
  readonly title?: string;
  readonly additionalClassName?: string;
  readonly children?: React.ReactNode;
  readonly updatePreviewSelection?: WrapFunctionInDispatch<UpdatePreviewSelection>;
  readonly commitRange?: typeof commitRange;
  readonly uncommittedInputFieldRef?: React.RefObject<HTMLInputElement>;
  readonly committedRange?: StartEndRange;
  readonly previewSelection?: PreviewSelection | null;
  readonly zeroAt?: Milliseconds;
};

type FilterNavigatorBarListItemState = {
  isFocused: boolean;
  uncommittedValue: string;
};

function parseDuration(duration: string): number {
  const m = duration.match(/([0-9.]+)([mu]?s)?/);
  if (!m) {
    return parseFloat(duration);
  }
  const num = m[1];
  const unit = m[2];
  let scale;
  switch (unit) {
    case 's':
      scale = 1000;
      break;
    case 'ms':
      scale = 1;
      break;
    case 'us':
      scale = 0.001;
      break;
    default:
      scale = 1;
      break;
  }
  return parseFloat(num) * scale;
}

class FilterNavigatorBarListItem extends React.PureComponent<
  FilterNavigatorBarListItemProps,
  FilterNavigatorBarListItemState
> {
  constructor(props: FilterNavigatorBarListItemProps) {
    super(props);
    this.state = {
      isFocused: false,
      uncommittedValue: props.uncommittedValue || '',
    };
  }

  _onClick = () => {
    const { index, onClick } = this.props;
    if (onClick) {
      onClick(index);
    }
  };

  _onUncommittedFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({
      uncommittedValue: e.currentTarget.value,
    });

    const duration = parseDuration(e.currentTarget.value);
    if (Number.isNaN(duration)) {
      return;
    }

    const { committedRange, previewSelection, updatePreviewSelection } =
      this.props;
    if (!committedRange || !previewSelection || !updatePreviewSelection) {
      return;
    }

    const { isModifying, selectionStart } = previewSelection;

    const selectionEnd = Math.min(
      selectionStart + duration,
      committedRange.end
    );

    updatePreviewSelection({
      isModifying,
      selectionStart,
      selectionEnd,
    });
  };

  _onUncommittedFieldFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    this.setState({
      uncommittedValue: e.currentTarget.value,
      isFocused: true,
    });
  };

  _onUncommittedFieldBlur = () => {
    this.setState({
      isFocused: false,
    });
  };

  _onUncommittedFieldSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const { previewSelection, zeroAt, commitRange } = this.props;
    if (!previewSelection || zeroAt === undefined || !commitRange) {
      return;
    }

    commitRange(
      previewSelection.selectionStart - zeroAt,
      previewSelection.selectionEnd - zeroAt
    );
  };

  override render() {
    const {
      isFirstItem,
      isLastItem,
      isSelectedItem,
      isUncommittedItem,
      children,
      additionalClassName,
      onClick,
      title,
      uncommittedValue,
      uncommittedInputFieldRef,
    } = this.props;

    let item;
    if (onClick) {
      item = (
        <button type="button" className="filterNavigatorBarItemContent">
          {children}
        </button>
      );
    } else if (isUncommittedItem) {
      item = (
        <form onSubmit={this._onUncommittedFieldSubmit}>
          <input
            aria-label="Range duration"
            title="Edit the range duration"
            className="filterNavigatorBarItemUncommittedFieldInput photon-input"
            value={
              this.state.isFocused
                ? this.state.uncommittedValue
                : uncommittedValue
            }
            onFocus={this._onUncommittedFieldFocus}
            onBlur={this._onUncommittedFieldBlur}
            onChange={this._onUncommittedFieldChange}
            ref={uncommittedInputFieldRef}
          />
        </form>
      );
    } else {
      item = <span className="filterNavigatorBarItemContent">{children}</span>;
    }

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
        {item}
      </li>
    );
  }
}

type Props = {
  readonly className: string;
  readonly items: ReadonlyArray<React.ReactNode>;
  readonly onPop: (param: number) => void;
  readonly selectedItem: number;
  readonly uncommittedItem?: string;
  readonly updatePreviewSelection?: WrapFunctionInDispatch<UpdatePreviewSelection>;
  readonly commitRange?: typeof commitRange;
  readonly uncommittedInputFieldRef?: React.RefObject<HTMLInputElement>;
  readonly committedRange?: StartEndRange;
  readonly previewSelection?: PreviewSelection | null;
  readonly zeroAt?: Milliseconds;
};

export class FilterNavigatorBar extends React.PureComponent<Props> {
  override render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      updatePreviewSelection,
      commitRange,
      zeroAt,
      uncommittedInputFieldRef,
      committedRange,
      previewSelection,
      onPop,
    } = this.props;

    return (
      <ol className={classNames('filterNavigatorBar', className)}>
        {items.map((item, i) => (
          <FilterNavigatorBarListItem
            key={i}
            index={i}
            onClick={i === items.length - 1 && !uncommittedItem ? null : onPop}
            isFirstItem={i === 0}
            isLastItem={i === items.length - 1}
            isSelectedItem={i === selectedItem}
            isUncommittedItem={false}
          >
            {item}
          </FilterNavigatorBarListItem>
        ))}
        {uncommittedItem ? (
          <FilterNavigatorBarListItem
            index={items.length}
            isFirstItem={false}
            isLastItem={true}
            isSelectedItem={false}
            isUncommittedItem={true}
            additionalClassName="filterNavigatorBarUncommittedItem"
            title={uncommittedItem}
            uncommittedValue={uncommittedItem}
            updatePreviewSelection={updatePreviewSelection}
            commitRange={commitRange}
            uncommittedInputFieldRef={uncommittedInputFieldRef}
            committedRange={committedRange}
            previewSelection={previewSelection}
            zeroAt={zeroAt}
          ></FilterNavigatorBarListItem>
        ) : null}
      </ol>
    );
  }
}
