/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

import type { GCStats } from '../../types/profile-derived';

import type { PreviewSelection } from '../../types/actions';
import {
  selectedThreadSelectors,
  getPreviewSelection,
} from '../../reducers/profile-view';

type DispatchProps = {||};

type StateProps = {|
  +gcStats: GCStats,
  +previewSelection: PreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class GCStatsView extends React.PureComponent<Props> {
  render() {
    const { gcStats } = this.props;

    return (
      <div className="gcStats">
        Number of minors: {gcStats.numMinor}
        <br />
        Number of slices: {gcStats.numSlice}
        <br />
        Number of majors: {gcStats.numMajor}
        <br />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    return {
      gcStats: selectedThreadSelectors.getPreviewFilteredGCStats(state),
      previewSelection: getPreviewSelection(state),
    };
  },
  component: GCStatsView,
};

export default explicitConnect(options);
