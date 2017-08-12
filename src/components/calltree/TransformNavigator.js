/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import FilterNavigatorBar from './FilterNavigatorBar';
import type { State } from '../../types/reducers';
import { popTransformsFromStack } from '../../actions/profile-view';

import './TransformNavigator.css';

export default connect(
  (state: State) => {
    const items = selectedThreadSelectors.getTransformLabels(state);
    return {
      className: 'calltreeTransformNavigator',
      items,
      selectedItem: items.length - 1,
      threadIndex: getSelectedThreadIndex(state),
    };
  },
  { popTransformsFromStack },
  (stateProps, dispatchProps) => ({
    className: stateProps.className,
    items: stateProps.items,
    selectedItem: stateProps.selectedItem,
    onPop: i => dispatchProps.popTransformsFromStack(stateProps.threadIndex, i),
  })
)(FilterNavigatorBar);
