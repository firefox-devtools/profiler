/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { connect } from 'react-redux';
import IntervalMarkerOverview from './IntervalMarkerOverview';
import { selectorsForThread } from '../../reducers/profile-view';
import {
  styles,
  overlayFills,
} from '../../profile-logic/interval-marker-styles';
import { getSelectedThreadIndex } from '../../reducers/url-state';

export default connect((state, props) => {
  const { threadIndex } = props;
  const selectors = selectorsForThread(threadIndex);
  const selectedThread = getSelectedThreadIndex(state);
  const intervalMarkers = selectors
    .getRangeSelectionFilteredTracingMarkers(state)
    .filter(tm => tm.name !== 'GCMajor');
  return {
    intervalMarkers,
    threadName: selectors.getFriendlyThreadName(state),
    isSelected: threadIndex === selectedThread,
    styles,
    overlayFills,
  };
})(IntervalMarkerOverview);
