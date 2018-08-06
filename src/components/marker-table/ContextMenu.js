/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import explicitConnect from '../../utils/connect';
import { updateProfileSelection } from '../../actions/profile-view';
import {
  selectedThreadSelectors,
  getProfileViewOptions,
  getCommittedRange,
} from '../../reducers/profile-view';
import copy from 'copy-to-clipboard';

import type { StartEndRange } from '../../types/units';
import type {
  Thread,
  IndexIntoMarkersTable,
  MarkersTable,
} from '../../types/profile';
import type { ProfileSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +thread: Thread,
  +markers: MarkersTable,
  +selection: ProfileSelection,
  +committedRange: StartEndRange,
  +selectedMarker: IndexIntoMarkersTable,
|};

type DispatchProps = {|
  +updateProfileSelection: typeof updateProfileSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkersContextMenu extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any).handleClick = this.handleClick.bind(this);
  }

  setStartRange() {
    const {
      selectedMarker,
      markers,
      updateProfileSelection,
      selection,
      committedRange,
    } = this.props;

    const selectionEnd = selection.hasSelection
      ? selection.selectionEnd
      : committedRange.end;

    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: markers.time[selectedMarker],
      selectionEnd,
    });
  }

  setEndRange() {
    const {
      selectedMarker,
      markers,
      updateProfileSelection,
      committedRange,
      selection,
    } = this.props;

    const selectionStart = selection.hasSelection
      ? selection.selectionStart
      : committedRange.start;

    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      // Add an arbitrarily small bit of time at the end to make sure the selected marker
      // doesn't disappear from view.
      selectionEnd: markers.time[selectedMarker] + 0.0001,
    });
  }

  copyMarkerJSON() {
    const { thread, selectedMarker, markers } = this.props;

    copy(
      JSON.stringify({
        name: thread.stringTable.getString(markers.name[selectedMarker]),
        time: markers.time[selectedMarker],
        data: markers.data[selectedMarker],
      })
    );
  }

  handleClick(
    event: SyntheticEvent<>,
    data: { type: 'setStartRange' | 'setEndRange' | 'copyMarkerJSON' }
  ): void {
    switch (data.type) {
      case 'setStartRange':
        this.setStartRange();
        break;
      case 'setEndRange':
        this.setEndRange();
        break;
      case 'copyMarkerJSON':
        this.copyMarkerJSON();
        break;
      default:
        throw new Error(`Unknown type ${data.type}`);
    }
  }

  render() {
    return (
      <ContextMenu id="MarkersContextMenu">
        <MenuItem onClick={this.handleClick} data={{ type: 'setStartRange' }}>
          Set selection start time here
        </MenuItem>
        <MenuItem onClick={this.handleClick} data={{ type: 'setEndRange' }}>
          Set selection end time here
        </MenuItem>
        <MenuItem onClick={this.handleClick} data={{ type: 'copyMarkerJSON' }}>
          Copy marker JSON
        </MenuItem>
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    thread: selectedThreadSelectors.getThread(state),
    markers: selectedThreadSelectors.getSearchFilteredMarkers(state),
    selection: getProfileViewOptions(state).selection,
    committedRange: getCommittedRange(state),
    selectedMarker: selectedThreadSelectors.getViewOptions(state)
      .selectedMarker,
  }),
  mapDispatchToProps: { updateProfileSelection },
  component: MarkersContextMenu,
};
export default explicitConnect(options);
