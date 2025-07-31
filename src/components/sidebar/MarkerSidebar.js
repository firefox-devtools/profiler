/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { getSelectedThreadsKey } from 'firefox-profiler/selectors/url-state';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type { ThreadsKey, Marker, MarkerIndex } from 'firefox-profiler/types';

type StateProps = {
  +selectedThreadsKey: ThreadsKey,
  +marker: Marker | null,
  +markerIndex: MarkerIndex | null,
};

type Props = ConnectedProps<{}, StateProps, {}>;

class MarkerSidebarImpl extends React.PureComponent<Props> {
  render() {
    const { marker, markerIndex, selectedThreadsKey } = this.props;

    if (marker === null || markerIndex === null) {
      return (
        <div className="sidebar sidebar-marker-table">
          <Localized id="MarkerSidebar--select-a-marker">
            <div className="sidebar-contents-wrapper">
              Select a marker to display some information about it.
            </div>
          </Localized>
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

export const MarkerSidebar = explicitConnect<{}, StateProps, {}>({
  mapStateToProps: (state) => ({
    marker: selectedThreadSelectors.getSelectedMarker(state),
    markerIndex: selectedThreadSelectors.getSelectedMarkerIndex(state),
    selectedThreadsKey: getSelectedThreadsKey(state),
  }),
  component: MarkerSidebarImpl,
});
