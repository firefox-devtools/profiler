/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { getSelectedThreadsKey } from '../../selectors/url-state';
import { TooltipMarker } from '../tooltip/Marker';

import type { ConnectedProps } from '../../utils/connect';
import type { ThreadsKey, Marker, MarkerIndex } from 'firefox-profiler/types';

type StateProps = {|
  +selectedThreadsKey: ThreadsKey,
  +marker: Marker | null,
  +markerIndex: MarkerIndex | null,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class MarkerSidebarImpl extends React.PureComponent<Props> {
  render() {
    const { marker, markerIndex, selectedThreadsKey } = this.props;

    if (marker === null || markerIndex === null) {
      return (
        <div className="sidebar sidebar-marker-table">
          Select a marker to display some information about it.
        </div>
      );
    }

    return (
      <aside className="sidebar sidebar-marker-table">
        <div className="sidebar-contents-wrapper">
          <TooltipMarker
            markerIndex={markerIndex}
            marker={marker}
            threadsKey={selectedThreadsKey}
            restrictHeightWidth={false}
          />
        </div>
      </aside>
    );
  }
}

export const MarkerSidebar = explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    marker: selectedThreadSelectors.getSelectedMarker(state),
    markerIndex: selectedThreadSelectors.getSelectedMarkerIndex(state),
    selectedThreadsKey: getSelectedThreadsKey(state),
  }),
  component: MarkerSidebarImpl,
});
