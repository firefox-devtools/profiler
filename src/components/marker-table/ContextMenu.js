/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import { connect } from 'react-redux';
import { updateProfileSelection } from '../../actions/profile-view';
import {
  selectedThreadSelectors,
  getProfileViewOptions,
  getDisplayRange,
} from '../../reducers/profile-view';
import copy from 'copy-to-clipboard';

import type { StartEndRange } from '../../types/units';
import type {
  Thread,
  IndexIntoMarkersTable,
  MarkersTable,
} from '../../types/profile';
import type { ProfileSelection } from '../../types/actions';

type Props = {
  thread: Thread,
  selectedMarker: IndexIntoMarkersTable,
  markers: MarkersTable,
  updateProfileSelection: typeof updateProfileSelection,
  displayRange: StartEndRange,
  selection: ProfileSelection,
};

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
      displayRange,
    } = this.props;

    const selectionEnd = selection.hasSelection
      ? selection.selectionEnd
      : displayRange.end;

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
      displayRange,
      selection,
    } = this.props;

    const selectionStart = selection.hasSelection
      ? selection.selectionStart
      : displayRange.start;

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
      <ContextMenu id={'MarkersContextMenu'}>
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

export default connect(
  state => ({
    thread: selectedThreadSelectors.getThread(state),
    markers: selectedThreadSelectors.getSearchFilteredMarkers(state),
    selection: getProfileViewOptions(state).selection,
    displayRange: getDisplayRange(state),
    selectedMarker: selectedThreadSelectors.getViewOptions(state)
      .selectedMarker,
  }),
  { updateProfileSelection }
)(MarkersContextMenu);
