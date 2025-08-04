/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';

import { EmptyReasons } from '../shared/EmptyReasons';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { oneLine } from 'common-tags';

import type { ConnectedProps } from '../../utils/connect';
import explicitConnect from '../../utils/connect';

import type { State } from 'firefox-profiler/types';

type StateProps = {
  readonly threadName: string;
};

type Props = ConnectedProps<{}, StateProps, {}>;

class NetworkChartEmptyReasonsImpl extends PureComponent<Props> {
  override render() {
    const { threadName } = this.props;

    return (
      <EmptyReasons
        threadName={threadName}
        reason={
          // The network tab is never displayed if there are no markers in the full
          // range, so never give that as a reason for it being empty.
          oneLine`
            All network requests were filtered out by the current selection or search
            term. Try changing the search term, or zooming out.
          `
        }
        viewName="network chart"
      />
    );
  }
}

export const NetworkChartEmptyReasons = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    threadName: selectedThreadSelectors.getFriendlyThreadName(state),
  }),
  component: NetworkChartEmptyReasonsImpl,
});
