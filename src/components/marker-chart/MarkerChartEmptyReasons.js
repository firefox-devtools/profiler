/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import EmptyReasons from '../shared/EmptyReasons';
import { selectedThreadSelectors } from 'selectors/per-thread';

import explicitConnect, { type ConnectedProps } from '../../utils/connect';

import type { State } from '../../types/store';

type StateProps = {|
  +threadName: string,
  +isMarkerChartEmptyInFullRange: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;
class MarkerChartEmptyReasons extends PureComponent<Props> {
  render() {
    const { isMarkerChartEmptyInFullRange, threadName } = this.props;

    return (
      <EmptyReasons
        threadName={threadName}
        reason={
          isMarkerChartEmptyInFullRange
            ? 'This thread contains no markers for this chart.'
            : 'All markers were filtered out by the current selection or search term.'
        }
        viewName="marker chart"
      />
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isMarkerChartEmptyInFullRange: selectedThreadSelectors.getAreMarkerPanelsEmptyInFullRange(
      state
    ),
  }),
  component: MarkerChartEmptyReasons,
});
