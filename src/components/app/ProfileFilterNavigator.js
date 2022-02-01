/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import memoize from 'memoize-immutable';
import { Localized } from '@fluent/react';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { popCommittedRanges } from 'firefox-profiler/actions/profile-view';
import { changeTimelineTrackOrganization } from 'firefox-profiler/actions/receive-profile';
import {
  getPreviewSelection,
  getProfileFilterPageDataByTabID,
  getActiveTabID,
  getProfileRootRange,
} from 'firefox-profiler/selectors/profile';
import { getCommittedRangeLabels } from 'firefox-profiler/selectors/url-state';
import { getFormattedTimeLength } from 'firefox-profiler/profile-logic/committed-ranges';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { Icon } from 'firefox-profiler/components/shared/Icon';

import type {
  ProfileFilterPageData,
  StartEndRange,
  TabID,
} from 'firefox-profiler/types';

import './ProfileFilterNavigator.css';

type DispatchProps = {|
  +onPop: (number) => mixed,
  +changeTimelineTrackOrganization: typeof changeTimelineTrackOrganization,
|};

type StateProps = {|
  +pageDataByTabID: Map<TabID, ProfileFilterPageData> | null,
  +activeTabID: TabID | null,
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

  _handleTabIdChange = (event: SyntheticInputEvent<>) => {
    const newTabID = +event.target.value;

    if (newTabID) {
      this.props.changeTimelineTrackOrganization({
        type: 'active-tab',
        tabID: newTabID,
      });
    }
  };

  _renderTabIdsAsOptions() {
    if (!this.props.pageDataByTabID) {
      return null;
    }

    return [...this.props.pageDataByTabID].map(([tabID, pageData]) => (
      <option value={tabID} key={tabID}>
        {pageData.hostname}
      </option>
    ));
  }

  render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      onPop,
      pageDataByTabID,
      activeTabID,
      rootRange,
    } = this.props;

    let firstItem;
    const pageData =
      pageDataByTabID && activeTabID !== null
        ? pageDataByTabID.get(activeTabID)
        : null;
    if (pageData) {
      firstItem = (
        <>
          {pageData.favicon ? <Icon iconUrl={pageData.favicon} /> : null}
          <select
            className="profileFilterNavigator--tabID-select"
            onChange={this._handleTabIdChange}
            value={activeTabID}
          >
            {this._renderTabIdsAsOptions()}
          </select>
          ({getFormattedTimeLength(rootRange.end - rootRange.start)})
        </>
      );
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
      <FilterNavigatorBar
        className={className}
        items={itemsWithFirstElement}
        selectedItem={selectedItem}
        uncommittedItem={uncommittedItem}
        onPop={onPop}
      />
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
    const activeTabID = getActiveTabID(state);
    const rootRange = getProfileRootRange(state);
    return {
      className: 'profileFilterNavigator',
      items: items,
      // Do not remove 1 from the length because we are going to increment this
      // array's length by adding the first element.
      selectedItem: items.length,
      uncommittedItem,
      pageDataByTabID,
      activeTabID,
      rootRange,
    };
  },
  mapDispatchToProps: {
    onPop: popCommittedRanges,
    changeTimelineTrackOrganization,
  },
  component: ProfileFilterNavigatorBarImpl,
});
