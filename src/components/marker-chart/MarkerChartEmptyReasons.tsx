/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent } from 'react';

import { EmptyReasons } from 'firefox-profiler/components/shared/EmptyReasons';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import explicitConnect, {
  ConnectedProps,
} from 'firefox-profiler/utils/connect';

import { State } from 'firefox-profiler/types';

type StateProps = {
  readonly threadName: string;
  readonly isMarkerChartEmptyInFullRange: boolean;
};

type Props = ConnectedProps<{}, StateProps, {}>;
class MarkerChartEmptyReasonsImpl extends PureComponent<Props> {
  override render() {
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

export const MarkerChartEmptyReasons = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isMarkerChartEmptyInFullRange:
      selectedThreadSelectors.getAreMarkerPanelsEmptyInFullRange(state),
  }),
  component: MarkerChartEmptyReasonsImpl,
});
