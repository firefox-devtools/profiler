/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import explicitConnect from '../../utils/connect';
import { updatePreviewSelection } from '../../actions/profile-view';
import {
  selectedThreadSelectors,
  getPreviewSelection,
  getCommittedRange,
} from '../../reducers/profile-view';
import copy from 'copy-to-clipboard';

import type {
  TracingMarker,
  IndexIntoTracingMarkers,
} from '../../types/profile-derived';
import type { StartEndRange } from '../../types/units';
import type {
  PreviewSelection,
  ImplementationFilter,
} from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import { getImplementationFilter } from '../../reducers/url-state';
import type { Thread } from '../../types/profile';
import { filterCallNodePathByImplementation } from '../../profile-logic/transforms';
import {
  convertStackToCallNodePath,
  getFuncNamesAndOriginsForPath,
} from '../../profile-logic/profile-data';

type StateProps = {|
  +markers: TracingMarker[],
  +previewSelection: PreviewSelection,
  +committedRange: StartEndRange,
  +selectedMarker: IndexIntoTracingMarkers,
  +thread: Thread,
  +implementationFilter: ImplementationFilter,
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

  convertStackToString(stack, thread, implementationFilter) {
    const callNodePath = filterCallNodePathByImplementation(
      thread,
      implementationFilter,
      convertStackToCallNodePath(thread, stack)
    );
    const funcNamesAndOrigins = getFuncNamesAndOriginsForPath(
      callNodePath,
      thread
    );
    return funcNamesAndOrigins.map(
      ({ funcName, origin }) => `${funcName} [${origin}]`
    );
  }

  copyMarkerJSON = () => {
    const { selectedMarker, markers } = this.props;
    copy(JSON.stringify(markers[selectedMarker]));
  };

  copyMarkerName = () => {
    const { selectedMarker, markers } = this.props;
    copy(markers[selectedMarker].name);
  };

  copyMarkerCause = () => {
    const {
      thread,
      implementationFilter,
      markers,
      selectedMarker,
    } = this.props;
    const marker = markers[selectedMarker];
    if (marker.cause) {
      const stack = this.convertStackToString(
        marker.cause.stack,
        thread,
        implementationFilter
      );
      copy(stack);
    }
  };

  render() {
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
        <MenuItem onClick={this.copyMarkerCause}>Copy marker cause</MenuItem>
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
    markers: selectedThreadSelectors.getPreviewFilteredTracingMarkers(state),
    previewSelection: getPreviewSelection(state),
    committedRange: getCommittedRange(state),
    thread: selectedThreadSelectors.getThread(state),
    implementationFilter: getImplementationFilter(state),
    selectedMarker: selectedThreadSelectors.getSelectedMarkerIndex(state),
  }),
  mapDispatchToProps: { updatePreviewSelection },
  component: MarkersContextMenu,
};
export default explicitConnect(options);
