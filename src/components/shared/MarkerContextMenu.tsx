/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/flow';

import {
  setContextMenuVisibility,
  updatePreviewSelection,
  selectTrackFromTid,
} from 'firefox-profiler/actions/profile-view';
import {
  getPreviewSelection,
  getCommittedRange,
  getProfiledThreadIds,
  getInnerWindowIDToPageMap,
} from 'firefox-profiler/selectors/profile';
import { getRightClickedMarkerInfo } from 'firefox-profiler/selectors/right-clicked-marker';
import copy from 'copy-to-clipboard';

import {
  Marker,
  MarkerIndex,
  StartEndRange,
  PreviewSelection,
  ImplementationFilter,
  IndexIntoStackTable,
  Thread,
  MarkerReference,
  Tid,
  InnerWindowID,
  Page,
} from 'firefox-profiler/types';

import { ConnectedProps } from 'firefox-profiler/utils/connect';
import { getImplementationFilter } from 'firefox-profiler/selectors/url-state';

import { getBacktraceItemsForStack } from 'firefox-profiler/profile-logic/transforms';
import { getThreadSelectorsFromThreadsKey } from 'firefox-profiler/selectors/per-thread';

import './MarkerContextMenu.css';

type OwnProps = {
  readonly rightClickedMarkerInfo: MarkerReference;
};

type StateProps = {
  readonly marker: Marker;
  readonly markerIndex: MarkerIndex;
  readonly previewSelection: PreviewSelection;
  readonly committedRange: StartEndRange;
  readonly thread: Thread | null;
  readonly implementationFilter: ImplementationFilter;
  readonly getMarkerLabelToCopy: (param: MarkerIndex) => string;
  readonly profiledThreadIds: Set<Tid>;
  innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
};

type DispatchProps = {
  readonly updatePreviewSelection: typeof updatePreviewSelection;
  readonly setContextMenuVisibility: typeof setContextMenuVisibility;
  readonly selectTrackFromTid: typeof selectTrackFromTid;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class MarkerContextMenuImpl extends PureComponent<Props> {
  _setStartRange = (selectionStart: number) => {
    const { updatePreviewSelection, previewSelection, committedRange } =
      this.props;

    const selectionEnd = previewSelection.hasSelection
      ? previewSelection.selectionEnd
      : committedRange.end;

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      selectionEnd,
    });
  };

  _setEndRange = (selectionEnd: number) => {
    const { updatePreviewSelection, committedRange, previewSelection } =
      this.props;

    const selectionStart = previewSelection.hasSelection
      ? previewSelection.selectionStart
      : committedRange.start;

    if (selectionEnd === selectionStart) {
      // For InstantMarkers, or Interval markers with 0 duration, add an arbitrarily
      // small bit of time at the end to make sure the selected marker doesn't disappear
      // from view.
      selectionEnd += 0.0001;
    }

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart,
      selectionEnd,
    });
  };

  setStartRangeFromMarkerStart = () => {
    const { marker } = this.props;
    this._setStartRange(marker.start);
  };

  setStartRangeFromMarkerEnd = () => {
    const { marker } = this.props;
    this._setStartRange(marker.end || marker.start);
  };

  setEndRangeFromMarkerStart = () => {
    const { marker } = this.props;
    this._setEndRange(marker.start);
  };

  setEndRangeFromMarkerEnd = () => {
    const { marker } = this.props;
    this._setEndRange(marker.end || marker.start);
  };

  setRangeByDuration = () => {
    const { marker, updatePreviewSelection } = this.props;

    if (marker.end === null) {
      return;
    }

    updatePreviewSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: marker.start,
      selectionEnd: marker.end,
    });
  };

  _isZeroDurationMarker(marker: Marker | null): boolean {
    return !marker || marker.end === null;
  }

  _convertStackToString(stack: IndexIntoStackTable): string {
    const { thread, implementationFilter } = this.props;

    if (thread === null) {
      return '';
    }

    const funcNamesAndOrigins = getBacktraceItemsForStack(
      stack,
      implementationFilter,
      thread
    ).reverse();

    return funcNamesAndOrigins
      .map(({ funcName, origin }) => `${funcName} [${origin}]`)
      .join('\n');
  }

  copyMarkerJSON = () => {
    copy(JSON.stringify(this.props.marker, null, 2));
  };

  copyMarkerDescription = () => {
    const { markerIndex, getMarkerLabelToCopy } = this.props;
    copy(getMarkerLabelToCopy(markerIndex));
  };

  copyMarkerCause = () => {
    const { marker } = this.props;

    if (marker.data && (marker.data as any).cause) {
      const stack = this._convertStackToString(
        (marker.data as any).cause.stack
      );
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
    const { marker } = this.props;

    if (marker.data && marker.data.type === 'Network') {
      copy(marker.data.URI);
    }
  };

  copyPageUrl = () => {
    const { marker, innerWindowIDToPageMap } = this.props;
    const { data } = marker;

    if (!data || !(data as any).innerWindowID || !innerWindowIDToPageMap) {
      // Marker doesn't contain any page information. Do not do anything.
      return;
    }

    const page = innerWindowIDToPageMap.get((data as any).innerWindowID);
    if (!page) {
      // Page couldn't be found. Do not do anything.
      return;
    }

    copy(page.url);
  };

  selectOtherThreadForIPCMarkers = () => {
    const { marker, selectTrackFromTid } = this.props;
    if (!marker.data || marker.data.type !== 'IPC') {
      return;
    }

    // Select the other thread of that IPC marker.
    const { data } = marker;
    const tid = data.direction === 'sending' ? data.recvTid : data.sendTid;
    if (!tid) {
      console.warn('Unable to find the other tid for IPC marker');
      return;
    }
    selectTrackFromTid(tid);
  };

  maybeRenderIPCMarkerMenuItem() {
    const { marker, profiledThreadIds } = this.props;
    const { data } = marker;

    if (!data || data.type !== 'IPC') {
      // It's not an IPC marker. Do not render anything.
      return null;
    }

    let menuItemTextElement;
    switch (data.direction) {
      case 'sending':
        if (!data.recvTid) {
          console.warn('Unable to find the receiver tid for IPC marker');
          return null;
        }

        if (!profiledThreadIds.has(data.recvTid)) {
          console.warn('Unable to find the receiver thread for IPC marker');
          return null;
        }

        menuItemTextElement = (
          <Localized
            id="MarkerContextMenu--select-the-receiver-thread"
            vars={{ threadName: data.recvThreadName ?? '' }}
            elems={{ strong: <strong /> }}
          >
            <>
              Select the receiver thread “
              <strong>{data.recvThreadName ?? ''}</strong>”
            </>
          </Localized>
        );
        break;
      case 'receiving':
        if (!data.sendTid) {
          console.warn('Unable to find the sender tid for IPC marker');
          return null;
        }

        if (!profiledThreadIds.has(data.sendTid)) {
          console.warn('Unable to find the sender thread for IPC marker');
          return null;
        }

        menuItemTextElement = (
          <Localized
            id="MarkerContextMenu--select-the-sender-thread"
            vars={{ threadName: data.sendThreadName ?? '' }}
            elems={{ strong: <strong /> }}
          >
            <>
              Select the sender thread “
              <strong>{data.sendThreadName ?? ''}</strong>”
            </>
          </Localized>
        );
        break;
      default:
        throw assertExhaustiveCheck(
          data.direction,
          `Unhandled IPC marker direction type.`
        );
    }

    return (
      <MenuItem onClick={this.selectOtherThreadForIPCMarkers}>
        <span className="react-contextmenu-icon markerContextMenuSelectThread" />
        {menuItemTextElement}
      </MenuItem>
    );
  }

  maybeRenderCopyPageUrlItem() {
    const { marker, innerWindowIDToPageMap } = this.props;
    const { data } = marker;

    if (!data || !(data as any).innerWindowID || !innerWindowIDToPageMap) {
      // Marker doesn't contain any page information. Do not render anything.
      return null;
    }

    const page = innerWindowIDToPageMap.get((data as any).innerWindowID);
    if (!page) {
      // Page couldn't be found. Do not render anything.
      return null;
    }

    return (
      <MenuItem onClick={this.copyPageUrl}>
        <span className="react-contextmenu-icon markerContextMenuIconCopyUrl" />
        <Localized id="MarkerContextMenu--copy-page-url">
          Copy page URL
        </Localized>
      </MenuItem>
    );
  }

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
  _hidingTimeout: NodeJS.Timeout | null = null;

  _onHide = () => {
    this._hidingTimeout = setTimeout(() => {
      this._hidingTimeout = null;
      this.props.setContextMenuVisibility(false);
    });
  };

  _onShow = () => {
    if (this._hidingTimeout) {clearTimeout(this._hidingTimeout);}
    this.props.setContextMenuVisibility(true);
  };

  override render() {
    const { marker, previewSelection, committedRange } = this.props;
    const { data } = marker;

    const selectionEnd = previewSelection.hasSelection
      ? previewSelection.selectionEnd
      : committedRange.end;

    const selectionStart = previewSelection.hasSelection
      ? previewSelection.selectionStart
      : committedRange.start;

    const markerEnd = marker.end || marker.start;

    const markerStart = marker.start;

    return (
      <ContextMenu
        id="MarkerContextMenu"
        className="markerContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        <MenuItem
          onClick={this.setRangeByDuration}
          disabled={this._isZeroDurationMarker(marker)}
        >
          <span className="react-contextmenu-icon markerContextMenuIconSetSelectionFromMarker" />
          <Localized id="MarkerContextMenu--set-selection-from-duration">
            Set selection from marker’s duration
          </Localized>
        </MenuItem>
        <div className="react-contextmenu-separator" />
        {this._isZeroDurationMarker(marker) ? (
          <>
            <MenuItem onClick={this.setStartRangeFromMarkerStart}>
              <span className="react-contextmenu-icon markerContextMenuIconStartSelectionHere" />
              <Localized id="MarkerContextMenu--start-selection-here">
                Start selection here
              </Localized>
            </MenuItem>
            <MenuItem onClick={this.setEndRangeFromMarkerEnd}>
              <span className="react-contextmenu-icon markerContextMenuIconEndSelectionHere" />
              <Localized id="MarkerContextMenu--end-selection-here">
                End selection here
              </Localized>
            </MenuItem>
          </>
        ) : (
          <>
            <MenuItem onClick={this.setStartRangeFromMarkerStart}>
              <span className="react-contextmenu-icon markerContextMenuIconStartSelectionAtMarkerStart" />
              <Localized
                id="MarkerContextMenu--start-selection-at-marker-start"
                elems={{ strong: <strong /> }}
              >
                <div className="react-contextmenu-item-content">
                  Start selection at marker’s <strong>start</strong>
                </div>
              </Localized>
            </MenuItem>
            <MenuItem
              onClick={this.setStartRangeFromMarkerEnd}
              disabled={markerEnd > selectionEnd}
            >
              <span className="react-contextmenu-icon markerContextMenuIconStartSelectionAtMarkerEnd" />
              <Localized
                id="MarkerContextMenu--start-selection-at-marker-end"
                elems={{ strong: <strong /> }}
              >
                <div className="react-contextmenu-item-content">
                  Start selection at marker’s <strong>end</strong>
                </div>
              </Localized>
            </MenuItem>
            <div className="react-contextmenu-separator" />
            <MenuItem
              onClick={this.setEndRangeFromMarkerStart}
              disabled={selectionStart > markerStart}
            >
              <span className="react-contextmenu-icon markerContextMenuIconEndSelectionAtMarkerStart" />
              <Localized
                id="MarkerContextMenu--end-selection-at-marker-start"
                elems={{ strong: <strong /> }}
              >
                <div className="react-contextmenu-item-content">
                  End selection at marker’s <strong>start</strong>
                </div>
              </Localized>
            </MenuItem>
            <MenuItem onClick={this.setEndRangeFromMarkerEnd}>
              <span className="react-contextmenu-icon markerContextMenuIconEndSelectionAtMarkerEnd" />
              <Localized
                id="MarkerContextMenu--end-selection-at-marker-end"
                elems={{ strong: <strong /> }}
              >
                <div className="react-contextmenu-item-content">
                  End selection at marker’s <strong>end</strong>
                </div>
              </Localized>
            </MenuItem>
          </>
        )}

        <div className="react-contextmenu-separator" />
        <MenuItem onClick={this.copyMarkerDescription}>
          <span className="react-contextmenu-icon markerContextMenuIconCopyDescription" />
          <Localized id="MarkerContextMenu--copy-description">
            Copy description
          </Localized>
        </MenuItem>
        {data && (data as any).cause ? (
          <MenuItem onClick={this.copyMarkerCause}>
            <span className="react-contextmenu-icon markerContextMenuIconCopyStack" />
            <Localized id="MarkerContextMenu--copy-call-stack">
              Copy call stack
            </Localized>
          </MenuItem>
        ) : null}
        {data && data.type === 'Network' ? (
          <MenuItem onClick={this.copyUrl}>
            <span className="react-contextmenu-icon markerContextMenuIconCopyUrl" />
            <Localized id="MarkerContextMenu--copy-url">Copy URL</Localized>
          </MenuItem>
        ) : null}
        {this.maybeRenderCopyPageUrlItem()}
        <MenuItem onClick={this.copyMarkerJSON}>
          <span className="react-contextmenu-icon markerContextMenuIconCopyPayload" />
          <Localized id="MarkerContextMenu--copy-as-json">
            Copy as JSON
          </Localized>
        </MenuItem>
        {this.maybeRenderIPCMarkerMenuItem()}
      </ContextMenu>
    );
  }
}

const MarkerContextMenu = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state, ownProps) => {
    const { threadsKey, markerIndex } = ownProps.rightClickedMarkerInfo;

    const selectors = getThreadSelectorsFromThreadsKey(threadsKey);
    const getMarker = selectors.getMarkerGetter(state);

    return {
      markerIndex,
      marker: getMarker(markerIndex),
      previewSelection: getPreviewSelection(state),
      committedRange: getCommittedRange(state),
      implementationFilter: getImplementationFilter(state),
      thread: selectors.getThread(state),
      getMarkerLabelToCopy: selectors.getMarkerLabelToCopyGetter(state),
      profiledThreadIds: getProfiledThreadIds(state),
      innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
    };
  },
  mapDispatchToProps: {
    updatePreviewSelection,
    setContextMenuVisibility,
    selectTrackFromTid,
  },
  component: MarkerContextMenuImpl,
});

type MaybeProps = {
  readonly rightClickedMarkerInfo: MarkerReference | null;
};

/**
 * This component only renders the context menu if there is a right clicked marker.
 * It is the component that is actually exported here.
 */
class MaybeMarkerContextMenuImpl extends PureComponent<MaybeProps> {
  override render() {
    const { rightClickedMarkerInfo } = this.props;

    if (rightClickedMarkerInfo === null) {
      return null;
    }

    return (
      <MarkerContextMenu rightClickedMarkerInfo={rightClickedMarkerInfo} />
    );
  }
}

export const MaybeMarkerContextMenu = explicitConnect<{}, MaybeProps, {}>({
  mapStateToProps: (state) => ({
    rightClickedMarkerInfo: getRightClickedMarkerInfo(state),
  }),
  component: MaybeMarkerContextMenuImpl,
});
