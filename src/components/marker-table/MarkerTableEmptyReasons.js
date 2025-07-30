/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import { EmptyReasons } from '../shared/EmptyReasons';
import { selectedThreadSelectors } from '../../selectors/per-thread';

import explicitConnect, { type ConnectedProps } from '../../utils/connect';

import type { State } from 'firefox-profiler/types';

type StateProps = {
  +threadName: string,
  +isMarkerTableEmptyInFullRange: boolean,
};

type Props = ConnectedProps<{}, StateProps, {}>;
class MarkerTableEmptyReasonsImpl extends PureComponent<Props> {
  render() {
    const { isMarkerTableEmptyInFullRange, threadName } = this.props;

    return (
      <EmptyReasons
        threadName={threadName}
        reason={
          isMarkerTableEmptyInFullRange
            ? 'This thread contains no markers for this table.'
            : 'All markers were filtered out by the current selection or search term.'
        }
        viewName="marker table"
      />
    );
  }
}

export const MarkerTableEmptyReasons = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    isMarkerTableEmptyInFullRange:
      selectedThreadSelectors.getAreMarkerPanelsEmptyInFullRange(state),
  }),
  component: MarkerTableEmptyReasonsImpl,
});
