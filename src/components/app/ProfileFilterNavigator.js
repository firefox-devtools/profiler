/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import explicitConnect from '../../utils/connect';
import { popRangeFiltersAndUnsetSelection } from '../../actions/profile-view';
import { getRangeFilterLabels } from '../../reducers/url-state';
import FilterNavigatorBar from '../calltree/FilterNavigatorBar';

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
    return {
      className: 'profileFilterNavigator',
      items: items,
      selectedItem: items.length - 1,
    };
  },
  mapDispatchToProps: {
    onPop: popRangeFiltersAndUnsetSelection,
  },
  component: FilterNavigatorBar,
};

export default explicitConnect(options);
