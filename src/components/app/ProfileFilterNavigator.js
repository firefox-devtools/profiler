/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from 'firefox-profiler/utils/connect';
import { popCommittedRanges } from 'firefox-profiler/actions/profile-view';
import {
  getPreviewSelection,
  getProfileFilterPageData,
  getProfileRootRange,
} from 'firefox-profiler/selectors/profile';
import { getCommittedRangeLabels } from 'firefox-profiler/selectors/url-state';
import { getFormattedTimeLength } from 'firefox-profiler/profile-logic/committed-ranges';
import FilterNavigatorBar from 'firefox-profiler/components/shared/FilterNavigatorBar';
import Icon from 'firefox-profiler/components/shared/Icon';

import type { ElementProps } from 'react';
import type {
  ProfileFilterPageData,
  StartEndRange,
} from 'firefox-profiler/types';

type Props = {|
  +filterPageData: ProfileFilterPageData | null,
  +rootRange: StartEndRange,
  ...ElementProps<typeof FilterNavigatorBar>,
|};
type DispatchProps = {|
  +onPop: $PropertyType<Props, 'onPop'>,
|};
type StateProps = $ReadOnly<$Exact<$Diff<Props, DispatchProps>>>;

class ProfileFilterNavigatorBarImpl extends React.PureComponent<Props> {
  _getItemsWithFirstElement = memoize(
    (firstItem, items) => [firstItem, ...items],
    {
      limit: 1,
    }
  );

  render() {
    const {
      className,
      items,
      selectedItem,
      uncommittedItem,
      onPop,
      filterPageData,
      rootRange,
    } = this.props;

    let firstItem;
    if (filterPageData) {
      firstItem = {
        title: filterPageData.origin,
        content: (
          <>
            <Icon iconUrl={filterPageData.favicon} />
            {filterPageData.hostname} (
            {getFormattedTimeLength(rootRange.end - rootRange.start)})
          </>
        ),
      };
    } else {
      firstItem = { content: <>Full Range</> };
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
  DispatchProps
>({
  mapStateToProps: state => {
    const items = getCommittedRangeLabels(state);
    const previewSelection = getPreviewSelection(state);
    const uncommittedItem = previewSelection.hasSelection
      ? getFormattedTimeLength(
          previewSelection.selectionEnd - previewSelection.selectionStart
        )
      : undefined;
    const filterPageData = getProfileFilterPageData(state);
    const rootRange = getProfileRootRange(state);
    return {
      className: 'profileFilterNavigator',
      items: items,
      // Do not remove 1 from the length because we are going to increment this
      // array's length by adding the first element.
      selectedItem: items.length,
      uncommittedItem,
      filterPageData,
      rootRange,
    };
  },
  mapDispatchToProps: {
    onPop: popCommittedRanges,
  },
  component: ProfileFilterNavigatorBarImpl,
});
