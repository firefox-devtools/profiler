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
import type { TabSlug } from '../../types/actions';
import type { Thread } from '../../types/profile';

type StateProps = {|
  +thread: Thread,
  +threadName: string,
  +selectedTab: TabSlug,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class MarkerChartEmptyReasons extends PureComponent<Props> {
  render() {
    const { selectedTab, thread, threadName } = this.props;

    let reason;
    let viewName = 'marker chart';
    if (thread.markers.length === 0) {
      reason = 'This thread contains no markers.';
    } else if (selectedTab === 'network-chart') {
      viewName = 'network chart';
      reason = 'This thread has no network markers.';
    } else {
      // I can't think of a possible reason coming here at the moment as we
      // don't have any search yet.
      reason = 'No markers have been found in this thread.';
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
    thread: selectedThreadSelectors.getThread(state),
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    selectedTab: getSelectedTab(state),
  }),
  component: MarkerChartEmptyReasons,
};

export default explicitConnect(options);
