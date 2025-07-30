/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import memoize from 'memoize-immutable';
import { Localized } from '@fluent/react';
import { showMenu } from '@firefox-devtools/react-contextmenu';
import classNames from 'classnames';

import explicitConnect from 'firefox-profiler/utils/connect';
import { popCommittedRanges } from 'firefox-profiler/actions/profile-view';
import {
  getPreviewSelection,
  getProfileFilterPageDataByTabID,
  getProfileRootRange,
  getProfileTimelineUnit,
  getCommittedRangeLabels,
} from 'firefox-profiler/selectors/profile';
import { getTabFilter } from 'firefox-profiler/selectors/url-state';
import { getFormattedTimelineValue } from 'firefox-profiler/profile-logic/committed-ranges';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import { TabSelectorMenu } from '../shared/TabSelectorMenu';

import type { ElementProps } from 'react';
import type {
  ProfileFilterPageData,
  StartEndRange,
  TabID,
} from 'firefox-profiler/types';

import './ProfileFilterNavigator.css';

type Props = {
  readonly pageDataByTabID: Map<TabID, ProfileFilterPageData> | null,
  readonly tabFilter: TabID | null,
  readonly rootRange: StartEndRange,
  readonly profileTimelineUnit: string,
  ...ElementProps<typeof FilterNavigatorBar>,
};

type DispatchProps = {
  readonly onPop: $PropertyType<Props, 'onPop'>,
};

type StateProps = $ReadOnly<$Exact<$Diff<Props, DispatchProps>>>;

class ProfileFilterNavigatorBarImpl extends React.PureComponent<Props> {
  _getItemsWithFirstElement = memoize(
    (firstItem, items) => [firstItem, ...items],
    {
      limit: 1,
    }
  );

  _showTabSelectorMenu = (event: SyntheticMouseEvent<HTMLElement>) => {
    if (this.props.items.length > 0 || this.props.uncommittedItem) {
      // Do nothing if there are committed ranges. We only allow users to change
      // the tab if they are on root range.
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    showMenu({
      data: null,
      id: 'TabSelectorMenu',
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
      profileTimelineUnit,
    } = this.props;

    let firstItem;
    if (pageDataByTabID && pageDataByTabID.size > 0) {
      const pageData =
        tabFilter !== null ? pageDataByTabID.get(tabFilter) : null;

      const itemContents = pageData ? (
        <>
          {/* Show the page data if the profile is filtered by tab */}
          {pageData.favicon ? <Icon iconUrl={pageData.favicon} /> : null}
          <span title={pageData.origin}>
            {pageData.hostname} (
            {getFormattedTimelineValue(
              rootRange.end - rootRange.start,
              profileTimelineUnit
            )}
            )
          </span>
        </>
      ) : (
        <Localized
          id="ProfileFilterNavigator--full-range-with-duration"
          vars={{
            fullRangeDuration: getFormattedTimelineValue(
              rootRange.end - rootRange.start,
              profileTimelineUnit
            ),
          }}
        >
          Full Range
        </Localized>
      );

      if (items.length === 0 && !uncommittedItem) {
        // It should be a clickable button if there are no committed ranges.
        firstItem = (
          <button
            type="button"
            onClick={this._showTabSelectorMenu}
            className={classNames(
              'filterNavigatorBarItemContent',
              'profileFilterNavigator--tab-selector'
            )}
          >
            {itemContents}
          </button>
        );
      } else {
        // There are committed ranges, don't make it button because this will
        // be wrapped with a button.
        firstItem = (
          <span
            className={classNames(
              'filterNavigatorBarItemContent',
              'profileFilterNavigator--tab-selector'
            )}
          >
            {itemContents}
          </span>
        );
      }
    } else {
      firstItem = (
        <Localized
          id="ProfileFilterNavigator--full-range-with-duration"
          vars={{
            fullRangeDuration: getFormattedTimelineValue(
              rootRange.end - rootRange.start,
              profileTimelineUnit
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
        {pageDataByTabID && pageDataByTabID.size > 0 ? (
          <TabSelectorMenu />
        ) : null}
      </>
    );
  }
}

export const ProfileFilterNavigator = explicitConnect<
  {},
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => {
    const items = getCommittedRangeLabels(state);
    const previewSelection = getPreviewSelection(state);
    const profileTimelineUnit = getProfileTimelineUnit(state);
    const uncommittedItem = previewSelection.hasSelection
      ? getFormattedTimelineValue(
          previewSelection.selectionEnd - previewSelection.selectionStart,
          profileTimelineUnit
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
      profileTimelineUnit,
    };
  },
  mapDispatchToProps: {
    onPop: popCommittedRanges,
  },
  component: ProfileFilterNavigatorBarImpl,
});
