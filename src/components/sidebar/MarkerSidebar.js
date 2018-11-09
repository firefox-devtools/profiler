/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { formatMilliseconds } from '../../utils/format-numbers';
import CanSelectContent from './CanSelectContent';

import type {
  ConnectedProps,
  ExplicitConnectOptions,
} from '../../utils/connect';
import type { ThreadIndex } from '../../types/profile';
import type { TracingMarker } from '../../types/profile-derived';

type SidebarDetailProps = {|
  +label: string,
  +value: React.Node,
|};

function SidebarDetail({ label, value }: SidebarDetailProps) {
  return (
    <React.Fragment>
      <div className="sidebar-label">{label}:</div>
      <div className="sidebar-value">{value}</div>
    </React.Fragment>
  );
}

type StateProps = {|
  +selectedThreadIndex: ThreadIndex,
  +marker: TracingMarker,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class MarkerSidebar extends React.PureComponent<Props> {
  render() {
    const { marker } = this.props;

    if (marker === null || marker === undefined) {
      return (
        <div className="sidebar sidebar-calltree">
          Select a marker to display some information about it.
        </div>
      );
    }

    return (
      <aside className="sidebar sidebar-calltree">
        <div className="sidebar-contents-wrapper">
          <header className="sidebar-titlegroup">
            <CanSelectContent
              tagName="h2"
              className="sidebar-title"
              content={marker.name}
            />
          </header>
          <h3 className="sidebar-title2">General:</h3>

          {marker.dur ? (
            <SidebarDetail
              label="Duration"
              value={formatMilliseconds(marker.dur)}
            />
          ) : null}

          {marker.data ? (
            <React.Fragment>
              <h3 className="sidebar-title2">Details:</h3>
              {marker.data.type ? (
                <SidebarDetail label="Type" value={marker.data.type} />
              ) : null}
            </React.Fragment>
          ) : null}
        </div>
      </aside>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, {||}> = {
  mapStateToProps: state => ({
    marker: selectedThreadSelectors.getPreviewFilteredTracingMarkers(state)[
      selectedThreadSelectors.getViewOptions(state).selectedMarker
    ],
    selectedThreadIndex: getSelectedThreadIndex(state),
  }),
  component: MarkerSidebar,
};

export default explicitConnect(options);
