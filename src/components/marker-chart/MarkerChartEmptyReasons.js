/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import EmptyReasons from '../shared/EmptyReasons';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getSelectedTab } from '../../reducers/url-state';

import explicitConnect, {
  type ExplicitConnectOptions,
  type ConnectedProps,
} from '../../utils/connect';

import type { State } from '../../types/store';
import type { TabSlug } from '../../app-logic/tabs-handling';

type StateProps = {|
  +threadName: string,
  +selectedTab: TabSlug,
  +isMarkerChartEmptyInFullRange: boolean,
  +isNetworkChartEmptyInFullRange: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class MarkerChartEmptyReasons extends PureComponent<Props> {
  render() {
    const {
      selectedTab,
      isNetworkChartEmptyInFullRange,
      isMarkerChartEmptyInFullRange,
      threadName,
    } = this.props;

    let reason, viewName;
    if (selectedTab === 'network-chart') {
      viewName = 'network chart';
      if (isNetworkChartEmptyInFullRange) {
        reason = 'This thread has no network information.';
      } else {
        reason =
          'All network requests were filtered out by the current selection or search term.';
      }
    } else {
      viewName = 'marker chart';
      if (isMarkerChartEmptyInFullRange) {
        reason = 'This thread contains no markers for this chart.';
      } else {
        reason =
          'All markers were filtered out by the current selection or search term.';
      }
    }

    return (
      <EmptyReasons
        threadName={threadName}
        reason={reason}
        viewName={viewName}
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isMarkerChartEmptyInFullRange: selectedThreadSelectors.getIsMarkerChartEmptyInFullRange(
      state
    ),
    isNetworkChartEmptyInFullRange: selectedThreadSelectors.getIsNetworkChartEmptyInFullRange(
      state
    ),
    selectedTab: getSelectedTab(state),
  }),
  component: MarkerChartEmptyReasons,
};

export default explicitConnect(options);
