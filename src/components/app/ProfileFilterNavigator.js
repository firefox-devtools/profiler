/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import memoize from 'memoize-immutable';
import { Localized } from '@fluent/react';
import { showMenu } from '@firefox-devtools/react-contextmenu';
import classNames from 'classnames';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { popCommittedRanges } from 'firefox-profiler/actions/profile-view';
import { changeTabFilter } from 'firefox-profiler/actions/receive-profile';
import {
  getPreviewSelection,
  getProfileFilterPageDataByTabID,
  getProfileRootRange,
} from 'firefox-profiler/selectors/profile';
import {
  getCommittedRangeLabels,
  getTabFilter,
} from 'firefox-profiler/selectors/url-state';
import { getFormattedTimeLength } from 'firefox-profiler/profile-logic/committed-ranges';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import { TabContextMenu } from '../shared/TabContextMenu';

import type {
  ProfileFilterPageData,
  StartEndRange,
  TabID,
} from 'firefox-profiler/types';

import './ProfileFilterNavigator.css';

type DispatchProps = {|
  +onPop: $PropertyType<Props, 'onPop'>,
  +changeTabFilter: typeof changeTabFilter,
|};
type StateProps = {|
  +pageDataByTabID: Map<TabID, ProfileFilterPageData> | null,
  +tabFilter: TabID | null,
  +rootRange: StartEndRange,
  +className: string,
  +items: $ReadOnlyArray<React.Node | string>,
  +selectedItem: number,
  +uncommittedItem?: string,
|};
type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileFilterNavigatorBarImpl extends React.PureComponent<Props> {
  _getItemsWithFirstElement = memoize(
    (firstItem, items) => [firstItem, ...items],
    {
      limit: 1,
    }
  );

  _showMenu = (event: SyntheticMouseEvent<HTMLElement>) => {
    if (this.props.items.length > 0) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    showMenu({
      data: null,
      id: 'TabContextMenu',
      position: { x: rect.left, y: rect.bottom },
      target: event.target,
    });
  };

  render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      onPop,
      rootRange,
      pageDataByTabID,
      tabFilter,
    } = this.props;

    let firstItem;
    if (pageDataByTabID) {
      const pageData =
        tabFilter !== null ? pageDataByTabID.get(tabFilter) : null;

      if (pageData) {
        firstItem = (
          <span
            onClick={this._showMenu}
            className={classNames('profileFilterNavigator--tab-selector', {
              disabled: items.length > 0,
            })}
          >
            {pageData.favicon ? <Icon iconUrl={pageData.favicon} /> : null}
            <span title={pageData.origin}>
              {pageData?.hostname} (
              {getFormattedTimeLength(rootRange.end - rootRange.start)})
            </span>
          </span>
        );
      } else {
        // FIXME: Remove the duplication later.
        firstItem = (
          <span
            onClick={this._showMenu}
            className={classNames('profileFilterNavigator--tab-selector', {
              disabled: items.length > 0,
            })}
          >
            <Localized
              id="ProfileFilterNavigator--full-range-with-duration"
              vars={{
                fullRangeDuration: getFormattedTimeLength(
                  rootRange.end - rootRange.start
                ),
              }}
            >
              Full Range
            </Localized>
          </span>
        );
      }
    } else {
      firstItem = (
        <Localized
          id="ProfileFilterNavigator--full-range-with-duration"
          vars={{
            fullRangeDuration: getFormattedTimeLength(
              rootRange.end - rootRange.start
            ),
          }}
        >
          Full Range
        </Localized>
      );
    }

    const itemsWithFirstElement = this._getItemsWithFirstElement(
      firstItem,
      items
    );
    return (
      <>
        <FilterNavigatorBar
          className={className}
          items={itemsWithFirstElement}
          selectedItem={selectedItem}
          uncommittedItem={uncommittedItem}
          onPop={onPop}
        />
        <TabContextMenu />
      </>
    );
  }
}

export const ProfileFilterNavigator = explicitConnect<
  {||},
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => {
    const items = getCommittedRangeLabels(state);
    const previewSelection = getPreviewSelection(state);
    const uncommittedItem = previewSelection.hasSelection
      ? getFormattedTimeLength(
          previewSelection.selectionEnd - previewSelection.selectionStart
        )
      : undefined;
    const pageDataByTabID = getProfileFilterPageDataByTabID(state);
    const tabFilter = getTabFilter(state);
    const rootRange = getProfileRootRange(state);
    return {
      className: 'profileFilterNavigator',
      items: items,
      // Do not remove 1 from the length because we are going to increment this
      // array's length by adding the first element.
      selectedItem: items.length,
      uncommittedItem,
      pageDataByTabID,
      tabFilter,
      rootRange,
    };
  },
  mapDispatchToProps: {
    onPop: popCommittedRanges,
    changeTabFilter,
  },
  component: ProfileFilterNavigatorBarImpl,
});
