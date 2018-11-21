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

import type {
  GCMinorMarker,
  GCSliceMarker,
  GCMajorMarker,
} from '../../types/profile-derived';

import type { PreviewSelection } from '../../types/actions';
import {
  selectedThreadSelectors,
  getPreviewSelection,
} from '../../reducers/profile-view';

type DispatchProps = {||};

type StateProps = {|
  +minorMarkers: GCMinorMarker[],
  +sliceMarkers: GCSliceMarker[],
  +majorMarkers: GCMajorMarker[],
  +previewSelection: PreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class GCStats extends React.PureComponent<Props> {
  render() {
    const { minorMarkers, sliceMarkers, majorMarkers } = this.props;

    return (
      <div className="gcStats">
        Number of minors: {minorMarkers.length}
        <br />
        Number of slices: {sliceMarkers.length}
        <br />
        Number of majors: {majorMarkers.length}
        <br />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    return {
      minorMarkers: selectedThreadSelectors.getPreviewFilteredGCMinorMarkers(
        state
      ),
      sliceMarkers: selectedThreadSelectors.getPreviewFilteredGCSliceMarkers(
        state
      ),
      majorMarkers: selectedThreadSelectors.getPreviewFilteredGCMajorMarkers(
        state
      ),
      previewSelection: getPreviewSelection(state),
    };
  },
  component: GCStats,
};

export default explicitConnect(options);
