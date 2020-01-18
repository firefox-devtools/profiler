/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { MenuItem } from 'react-contextmenu';
import ContextMenu from '../shared/ContextMenu';
import explicitConnect from '../../utils/connect';
import {
  setContextMenuVisibility,
  updatePreviewSelection,
} from '../../actions/profile-view';
import {
  getPreviewSelection,
  getCommittedRange,
} from '../../selectors/profile';
import { getRightClickedMarkerInfo } from '../../selectors/right-clicked-marker';
import type { RightClickedMarkerInfo } from '../../selectors/right-clicked-marker';
import copy from 'copy-to-clipboard';

import type { Marker } from '../../types/profile-derived';
import type { StartEndRange } from '../../types/units';
import type {
  PreviewSelection,
  ImplementationFilter,
} from '../../types/actions';
import type { ConnectedProps } from '../../utils/connect';
import { getImplementationFilter } from '../../selectors/url-state';
import type { IndexIntoStackTable } from '../../types/profile';
import { filterCallNodePathByImplementation } from '../../profile-logic/transforms';
import {
  convertStackToCallNodePath,
  getFuncNamesAndOriginsForPath,
} from '../../profile-logic/profile-data';
import { getMarkerFullDescription } from '../../profile-logic/marker-data';

type StateProps = {|
  +previewSelection: PreviewSelection,
  +committedRange: StartEndRange,
  +rightClickedMarkerInfo: RightClickedMarkerInfo | null,
  +implementationFilter: ImplementationFilter,
|};

type DispatchProps = {|
  +updatePreviewSelection: typeof updatePreviewSelection,
  +setContextMenuVisibility: typeof setContextMenuVisibility,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class MarkerContextMenu extends PureComponent<Props> {
  setStartRange = () => {
    const {
      rightClickedMarkerInfo,
      updatePreviewSelection,
      previewSelection,
      committedRange,
    } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    const selectionEnd = previewSelection.hasSelection
      ? previewSelection.selectionEnd
      : committedRange.end;

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd,
    });
  };

  setEndRange = () => {
    const {
      rightClickedMarkerInfo,
      updatePreviewSelection,
      committedRange,
      previewSelection,
    } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    const selectionStart = previewSelection.hasSelection
      ? previewSelection.selectionStart
      : committedRange.start;

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      // For markers without a duration, add an arbitrarily small bit of time at
      // the end to make sure the selected marker doesn't disappear from view.
      selectionEnd: marker.start + (marker.dur || 0.0001),
    });
  };

  setRangeByDuration = () => {
    const { rightClickedMarkerInfo, updatePreviewSelection } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    if (this._isZeroDurationMarker(marker)) {
      return;
    }

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.start + marker.dur,
    });
  };

  _isZeroDurationMarker(marker: ?Marker): boolean {
    return !marker || !marker.dur;
  }

  _convertStackToString(stack: IndexIntoStackTable): string {
    const { rightClickedMarkerInfo, implementationFilter } = this.props;

    if (rightClickedMarkerInfo === null) {
      return '';
    }

    const { thread } = rightClickedMarkerInfo;

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
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    copy(JSON.stringify(marker, null, 2));
  };

  copyMarkerDescription = () => {
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    copy(getMarkerFullDescription(marker));
  };

  copyMarkerCause = () => {
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    if (marker.data && marker.data.cause) {
      const stack = this._convertStackToString(marker.data.cause.stack);
      if (stack) {
        copy(stack);
      } else {
        copy(
          'The stack is empty because all of its frames are filtered out by the implementation filter. Switch the implementation filter in the call tree to see more frames.'
        );
      }
    }
  };

  copyUrl = () => {
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return;
    }

    const { marker } = rightClickedMarkerInfo;

    if (marker.data && marker.data.type === 'Network') {
      copy(marker.data.URI);
    }
  };

  // Using setTimeout here is a bit complex, but is necessary to make the menu
  // work fine when we want to display it somewhere when it's already open
  // somewhere else.
  // This is the order of events in such a situation:
  // 0. The menu is open somewhere, it means the user right clicked somewhere
  //     previously, and as a result some marker has the "right clicked" status.
  // 1. The user right clicks on another marker. This is actually happening in
  //    several events, the first event is "mousedown": this is where our own
  //    components react for right click (both our TreeView and our charts)
  //    and thus this is when the "right clicked" item is set in our store. BTW
  //    this triggers a rerender of this component.
  // 2. Then the event "mouseup" happens but we don't do anything for it for right
  //    clicks.
  // 3. Then the event "contextmenu" is triggered. This is the event that the
  //    context menu library reacts to: first it closes the previous menu, then
  //    opens the new one. This means that `_onHide` is called first for the
  //    first menu, then `_onShow` for the second menu.
  //    The problem here is that the call to `setContextMenuVisibility` we do in
  //    `onHide` resets the value for the "right clicked" item. This is normally
  //    what we want when the user closes the menu, but in this case where the
  //    menu is still open but for another node, we don't want to reset this
  //    value which was set earlier when handling the "mousedown" event.
  //    To avoid this problem we use this `setTimeout` call to delay the reset
  //    just a bit, just in case we get a `_onShow` call right after that.
  _hidingTimeout: TimeoutID | null = null;

  _onHide = () => {
    this._hidingTimeout = setTimeout(() => {
      this._hidingTimeout = null;
      this.props.setContextMenuVisibility(false);
    });
  };

  _onShow = () => {
    clearTimeout(this._hidingTimeout);
    this.props.setContextMenuVisibility(true);
  };

  render() {
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return null;
    }

    const { marker } = rightClickedMarkerInfo;

    return (
      <ContextMenu
        id="MarkerContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        <MenuItem onClick={this.setStartRange}>
          Set selection start time here
        </MenuItem>
        <MenuItem onClick={this.setEndRange}>
          Set selection end time here
        </MenuItem>
        <MenuItem
          onClick={this.setRangeByDuration}
          disabled={this._isZeroDurationMarker(marker)}
        >
          Set selection from duration
        </MenuItem>
        <MenuItem onClick={this.copyMarkerDescription}>Copy</MenuItem>
        {marker.data && marker.data.cause ? (
          <MenuItem onClick={this.copyMarkerCause}>Copy marker cause</MenuItem>
        ) : null}
        {marker.data && marker.data.type === 'Network' ? (
          <MenuItem onClick={this.copyUrl}>Copy URL</MenuItem>
        ) : null}
        <MenuItem onClick={this.copyMarkerJSON}>Copy marker JSON</MenuItem>
      </ContextMenu>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    previewSelection: getPreviewSelection(state),
    committedRange: getCommittedRange(state),
    implementationFilter: getImplementationFilter(state),
    rightClickedMarkerInfo: getRightClickedMarkerInfo(state),
  }),
  mapDispatchToProps: { updatePreviewSelection, setContextMenuVisibility },
  component: MarkerContextMenu,
});
