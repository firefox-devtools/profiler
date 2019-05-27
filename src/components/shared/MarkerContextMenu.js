/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { MenuItem } from 'react-contextmenu';
import ContextMenu from '../shared/ContextMenu';
import explicitConnect from '../../utils/connect';
import { updatePreviewSelection } from '../../actions/profile-view';
import {
  getPreviewSelection,
  getCommittedRange,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import copy from 'copy-to-clipboard';

import type { Marker } from '../../types/profile-derived';
import type { StartEndRange } from '../../types/units';
import type {
  PreviewSelection,
  ImplementationFilter,
} from '../../types/actions';
import type { ConnectedProps } from '../../utils/connect';
import { getImplementationFilter } from '../../selectors/url-state';
import type { Thread, IndexIntoStackTable } from '../../types/profile';
import { filterCallNodePathByImplementation } from '../../profile-logic/transforms';
import {
  convertStackToCallNodePath,
  getFuncNamesAndOriginsForPath,
} from '../../profile-logic/profile-data';
import { getMarkerFullDescription } from '../../profile-logic/marker-data';

type StateProps = {|
  +previewSelection: PreviewSelection,
  +committedRange: StartEndRange,
  +selectedMarker: Marker | null,
  +thread: Thread,
  +implementationFilter: ImplementationFilter,
|};

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerContextMenu extends PureComponent<Props> {
  setStartRange = () => {
    const {
      selectedMarker,
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
      selectionStart: selectedMarker.start,
      selectionEnd,
    });
  };

  setEndRange = () => {
    const {
      selectedMarker,
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

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      // For markers without a duration, add an arbitrarily small bit of time at
      // the end to make sure the selected marker doesn't disappear from view.
      selectionEnd: selectedMarker.start + (selectedMarker.dur || 0.0001),
    });
  };

  setRangeByDuration = () => {
    const { selectedMarker, updatePreviewSelection } = this.props;

    if (selectedMarker === null) {
      return;
    }

    if (this._isZeroDurationMarker(selectedMarker)) {
      return;
    }

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: selectedMarker.start,
      selectionEnd: selectedMarker.start + selectedMarker.dur,
    });
  };

  _isZeroDurationMarker(marker: ?Marker): boolean {
    return !marker || !marker.dur;
  }

  _convertStackToString(stack: IndexIntoStackTable): string {
    const { thread, implementationFilter } = this.props;

    const callNodePath = filterCallNodePathByImplementation(
      thread,
      implementationFilter,
      convertStackToCallNodePath(thread, stack)
    );

    const funcNamesAndOrigins = getFuncNamesAndOriginsForPath(
      callNodePath,
      thread
    );
    return funcNamesAndOrigins
      .map(({ funcName, origin }) => `${funcName} [${origin}]`)
      .join('\n');
  }

  copyMarkerJSON = () => {
    const { selectedMarker } = this.props;

    if (selectedMarker === null) {
      return;
    }

    copy(JSON.stringify(selectedMarker, null, 2));
  };

  copyMarkerDescription = () => {
    const { selectedMarker } = this.props;

    if (selectedMarker === null) {
      return;
    }

    copy(getMarkerFullDescription(selectedMarker));
  };

  copyMarkerCause = () => {
    const { selectedMarker } = this.props;

    if (selectedMarker && selectedMarker.data && selectedMarker.data.cause) {
      const stack = this._convertStackToString(selectedMarker.data.cause.stack);
      copy(stack);
    }
  };

  render() {
    const { selectedMarker } = this.props;

    if (selectedMarker === null) {
      return null;
    }

    return (
      <ContextMenu id="MarkerContextMenu">
        <MenuItem onClick={this.setStartRange}>
          Set selection start time here
        </MenuItem>
        <MenuItem onClick={this.setEndRange}>
          Set selection end time here
        </MenuItem>
        <MenuItem
          onClick={this.setRangeByDuration}
          disabled={this._isZeroDurationMarker(selectedMarker)}
        >
          Set selection from duration
        </MenuItem>
        <MenuItem onClick={this.copyMarkerJSON}>Copy marker JSON</MenuItem>
        <MenuItem onClick={this.copyMarkerDescription}>
          Copy marker description
        </MenuItem>
        {selectedMarker.data && selectedMarker.data.cause ? (
          <MenuItem onClick={this.copyMarkerCause}>Copy marker cause</MenuItem>
        ) : null}
      </ContextMenu>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    previewSelection: getPreviewSelection(state),
    committedRange: getCommittedRange(state),
    thread: selectedThreadSelectors.getThread(state),
    implementationFilter: getImplementationFilter(state),
    selectedMarker: selectedThreadSelectors.getRightClickedMarker(state),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: MarkerContextMenu,
});
