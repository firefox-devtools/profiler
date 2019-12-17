/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import explicitConnect from '../../utils/connect';
import { popCommittedRanges } from '../../actions/profile-view';
import { getPreviewSelection } from 'selectors/profile';
import { getCommittedRangeLabels } from 'selectors/url-state';
import { getFormattedTimeLength } from '../../profile-logic/committed-ranges';
import FilterNavigatorBar from '../shared/FilterNavigatorBar';

import type { ElementProps } from 'react';

type Props = ElementProps<typeof FilterNavigatorBar>;
type DispatchProps = {|
  +onPop: $PropertyType<Props, 'onPop'>,
|};
type StateProps = $ReadOnly<$Exact<$Diff<Props, DispatchProps>>>;

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    const items = getCommittedRangeLabels(state);
    const previewSelection = getPreviewSelection(state);
    const uncommittedItem = previewSelection.hasSelection
      ? getFormattedTimeLength(
          previewSelection.selectionEnd - previewSelection.selectionStart
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
    onPop: popCommittedRanges,
  },
  component: FilterNavigatorBar,
});
