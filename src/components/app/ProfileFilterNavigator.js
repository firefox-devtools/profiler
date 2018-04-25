/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import explicitConnect from '../../utils/connect';
import { popRangeFiltersAndUnsetSelection } from '../../actions/profile-view';
import { getSelection } from '../../reducers/profile-view';
import { getRangeFilterLabels } from '../../reducers/url-state';
import { getFormattedTimeLength } from '../../profile-logic/range-filters';
import FilterNavigatorBar from '../shared/FilterNavigatorBar';

import type { ExplicitConnectOptions } from '../../utils/connect';
import type { ElementProps } from 'react';

type Props = ElementProps<typeof FilterNavigatorBar>;
type DispatchProps = {|
  +onPop: $PropertyType<Props, 'onPop'>,
|};
type StateProps = $ReadOnly<$Exact<$Diff<Props, DispatchProps>>>;

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const items = getRangeFilterLabels(state);
    const profileSelection = getSelection(state);
    const uncommittedItem = profileSelection.hasSelection
      ? getFormattedTimeLength(
          profileSelection.selectionEnd - profileSelection.selectionStart
        )
      : undefined;
    return {
      className: 'profileFilterNavigator',
      items: items,
      selectedItem: items.length - 1,
      uncommittedItem,
    };
  },
  mapDispatchToProps: {
    onPop: popRangeFiltersAndUnsetSelection,
  },
  component: FilterNavigatorBar,
};

export default explicitConnect(options);
