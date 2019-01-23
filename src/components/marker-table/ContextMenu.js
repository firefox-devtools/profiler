/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import explicitConnect from '../../utils/connect';
import { updatePreviewSelection } from '../../actions/profile-view';
import {
  getPreviewSelection,
  getCommittedRange,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import copy from 'copy-to-clipboard';

import type { Marker, IndexIntoMarkers } from '../../types/profile-derived';
import type { StartEndRange } from '../../types/units';
import type { PreviewSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +markers: Marker[],
  +previewSelection: PreviewSelection,
  +committedRange: StartEndRange,
  +selectedMarker: IndexIntoMarkers | null,
|};

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkersContextMenu extends PureComponent<Props> {
  setStartRange = () => {
    const {
      selectedMarker,
      markers,
      updatePreviewSelection,
      previewSelection,
      committedRange,
    } = this.props;

    if (selectedMarker === null) {
      return;
    }

    const selectionEnd = previewSelection.hasSelection
      ? previewSelection.selectionEnd
      : committedRange.end;

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: markers[selectedMarker].start,
      selectionEnd,
    });
  };

  setEndRange = () => {
    const {
      selectedMarker,
      markers,
      updatePreviewSelection,
      committedRange,
      previewSelection,
    } = this.props;

    if (selectedMarker === null) {
      return;
    }

    const selectionStart = previewSelection.hasSelection
      ? previewSelection.selectionStart
      : committedRange.start;

    const marker = markers[selectedMarker];
    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      // For markers without a duration, add an arbitrarily small bit of time at
      // the end to make sure the selected marker doesn't disappear from view.
      selectionEnd: marker.start + (marker.dur || 0.0001),
    });
  };

  copyMarkerJSON = () => {
    const { selectedMarker, markers } = this.props;

    if (selectedMarker === null) {
      return;
    }

    copy(JSON.stringify(markers[selectedMarker]));
  };

  copyMarkerName = () => {
    const { selectedMarker, markers } = this.props;

    if (selectedMarker === null) {
      return;
    }

    copy(markers[selectedMarker].name);
  };

  render() {
    if (this.props.selectedMarker === null) {
      return null;
    }

    return (
      <ContextMenu id="MarkersContextMenu">
        <MenuItem onClick={this.setStartRange}>
          Set selection start time here
        </MenuItem>
        <MenuItem onClick={this.setEndRange}>
          Set selection end time here
        </MenuItem>
        <MenuItem onClick={this.copyMarkerJSON}>Copy marker JSON</MenuItem>
        <MenuItem onClick={this.copyMarkerName}>Copy marker name</MenuItem>
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    markers: selectedThreadSelectors.getPreviewFilteredMarkers(state),
    previewSelection: getPreviewSelection(state),
    committedRange: getCommittedRange(state),
    selectedMarker: selectedThreadSelectors.getSelectedMarkerIndex(state),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: MarkersContextMenu,
};
export default explicitConnect(options);
