/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { connect } from 'react-redux';
import actions from '../../actions';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import FilterNavigatorBar from './FilterNavigatorBar';
import type { State } from '../../types/reducers';

import './ProfileCallTreeFilterNavigator.css';

export default connect(
  (state: State) => {
    const items = selectedThreadSelectors.getCallTreeFilterLabels(state);
    return {
      className: 'profileCallTreeFilterNavigator',
      items,
      selectedItem: items.length - 1,
      threadIndex: getSelectedThreadIndex(state),
    };
  },
  actions,
  (stateProps, dispatchProps) => ({
    className: stateProps.className,
    items: stateProps.items,
    selectedItem: stateProps.selectedItem,
    onPop: i => dispatchProps.popCallTreeFilters(stateProps.threadIndex, i),
  })
)(FilterNavigatorBar);
