/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import EmptyReasons from '../shared/EmptyReasons';
import { selectedThreadSelectors } from '../../reducers/profile-view';

import explicitConnect, {
  type ExplicitConnectOptions,
  type ConnectedProps,
} from '../../utils/connect';

import type { State } from '../../types/store';

type StateProps = {|
  +threadName: string,
  +isNetworkChartEmptyInFullRange: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class MarkerChartEmptyReasons extends PureComponent<Props> {
  render() {
    const { isNetworkChartEmptyInFullRange, threadName } = this.props;

    return (
      <EmptyReasons
        threadName={threadName}
        reason={
          isNetworkChartEmptyInFullRange
            ? 'This thread has no network information.'
            : 'All network requests were filtered out by the current selection or search term.'
        }
        viewName="network chart"
      />
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isNetworkChartEmptyInFullRange: selectedThreadSelectors.getIsNetworkChartEmptyInFullRange(
      state
    ),
  }),
  component: MarkerChartEmptyReasons,
};

export default explicitConnect(options);
