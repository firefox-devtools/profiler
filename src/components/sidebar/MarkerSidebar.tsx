/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';

import explicitConnect from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getSelectedThreadsKey,
  getSelectedTab,
} from 'firefox-profiler/selectors/url-state';
import { TooltipMarker } from 'firefox-profiler/components/tooltip/Marker';
import { updateBottomBoxContentsAndMaybeOpen } from 'firefox-profiler/actions/profile-view';
import { getBottomBoxInfoForStackFrame } from 'firefox-profiler/profile-logic/profile-data';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import type {
  ThreadsKey,
  Marker,
  MarkerIndex,
  IndexIntoStackTable,
  Thread,
} from 'firefox-profiler/types';
import type { TabSlug } from 'firefox-profiler/app-logic/tabs-handling';

type StateProps = {
  readonly selectedThreadsKey: ThreadsKey;
  readonly marker: Marker | null;
  readonly markerIndex: MarkerIndex | null;
  readonly thread: Thread;
  readonly selectedTab: TabSlug;
};

type DispatchProps = {
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class MarkerSidebarImpl extends React.PureComponent<Props> {
  _onStackFrameClick = (stackIndex: IndexIntoStackTable) => {
    const { thread, selectedTab, updateBottomBoxContentsAndMaybeOpen } =
      this.props;
    const bottomBoxInfo = getBottomBoxInfoForStackFrame(stackIndex, thread);
    updateBottomBoxContentsAndMaybeOpen(selectedTab, bottomBoxInfo);
  };

  override render() {
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
            onStackFrameClick={this._onStackFrameClick}
          />
        </div>
      </aside>
    );
  }
}

export const MarkerSidebar = explicitConnect<{}, StateProps, DispatchProps>({
  mapStateToProps: (state) => ({
    marker: selectedThreadSelectors.getSelectedMarker(state),
    markerIndex: selectedThreadSelectors.getSelectedMarkerIndex(state),
    selectedThreadsKey: getSelectedThreadsKey(state),
    thread: selectedThreadSelectors.getThread(state),
    selectedTab: getSelectedTab(state),
  }),
  mapDispatchToProps: {
    updateBottomBoxContentsAndMaybeOpen,
  },
  component: MarkerSidebarImpl,
});
