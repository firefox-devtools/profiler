/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import React, { PureComponent } from 'react';

import { EmptyReasons } from '../shared/EmptyReasons';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { oneLine } from 'common-tags';
import explicitConnect, { type ConnectedProps } from '../../utils/connect';

import { Thread, State } from 'firefox-profiler/types';

type StateProps = {
  threadName: string;
  rangeFilteredThread: Thread;
  thread: Thread;
};

type Props = ConnectedProps<{}, StateProps, {}>;

/**
 * This component attempts to tell why exactly a stack chart is empty with no samples
 * and display a friendly message to the end user.
 */
class StackChartEmptyReasonsImpl extends PureComponent<Props> {
  override render() {
    const { thread, rangeFilteredThread, threadName } = this.props;
    let reason;

    if (thread.samples.length === 0) {
      reason = 'This thread has no samples.';
    } else if (rangeFilteredThread.samples.length === 0) {
      reason = 'Broaden the selected range to view samples.';
    } else {
      reason = oneLine`
        Try broadening the selected range, removing search terms, or call tree transforms
        to view samples.
      `;
    }

    return (
      <EmptyReasons
        threadName={threadName}
        reason={reason}
        viewName="stack chart"
      />
    );
  }
}

export const StackChartEmptyReasons = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
    thread: selectedThreadSelectors.getThread(state),
    rangeFilteredThread: selectedThreadSelectors.getRangeFilteredThread(state),
  }),
  component: StackChartEmptyReasonsImpl,
});
