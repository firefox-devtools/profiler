/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, Fragment } from 'react';
import { MenuItem } from 'react-contextmenu';
import ContextMenu from '../shared/ContextMenu';
import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { formatMilliseconds } from '../../utils/format-numbers';
import copy from 'copy-to-clipboard';
import {
  setContextMenuVisibility,
  updatePreviewSelection,
} from '../../actions/profile-view';
import { getBatchRange } from '../../utils/react';

import type { ReactHoverContextInfo } from '../../types/react';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +data: ReactHoverContextInfo | null,
|};

type DispatchProps = {|
  +setContextMenuVisibility: typeof setContextMenuVisibility,
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

require('./ReactContextMenu.css');

class ReactContextMenu extends PureComponent<Props> {
  _hidingTimeout: TimeoutID | null = null;

  // Using setTimeout here is a bit complex, but is necessary to make the menu
  // work fine when we want to display it somewhere when it's already open
  // somewhere else.
  // This is the order of events in such a situation:
  // 0. The menu is open somewhere, it means the user right clicked somewhere
  //     previously, and as a result some node has the "right clicked" status.
  // 1. The user right clicks on another node. This is actually happening in
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
  //    what we want when the user closes the menu, but this case where the menu
  //    is still open but for another node, we don't want to reset this value
  //    which was set earlier when handling the "mousedown" event.
  //    To avoid this problem we use this `setTimeout` call to delay the reset
  //    just a bit, just in case we get a `_onShow` call right after that.
  _onShow = () => {
    clearTimeout(this._hidingTimeout);
    this.props.setContextMenuVisibility(true);
  };

  _onHide = () => {
    this._hidingTimeout = setTimeout(() => {
      this._hidingTimeout = null;
      this.props.setContextMenuVisibility(false);
    });
  };

  _copyComponentName = () => {
    const { data } = this.props;
    if (data !== null && data.event !== null) {
      copy(data.event.componentName || '');
    }
  };

  _copyComponentStack = () => {
    const { data } = this.props;
    if (data !== null && data.event !== null) {
      copy(data.event.componentStack || '');
    }
  };

  _copySummary = () => {
    const { data } = this.props;
    if (data !== null && data.measure !== null) {
      const { batchUID, duration, priority, timestamp, type } = data.measure;

      const [startTime, stopTime] = getBatchRange(
        batchUID,
        priority,
        data.reactProfilerData
      );

      copy(
        JSON.stringify({
          type,
          timestamp: formatMilliseconds(timestamp - data.zeroAt),
          duration: formatMilliseconds(duration),
          batchDuration: formatMilliseconds(stopTime - startTime),
        })
      );
    }
  };

  _zoomToBatch = () => {
    const { data } = this.props;
    if (data !== null && data.measure !== null) {
      const { batchUID, priority } = data.measure;
      const [startTime, stopTime] = getBatchRange(
        batchUID,
        priority,
        data.reactProfilerData
      );

      this.props.updatePreviewSelection({
        hasSelection: true,
        isModifying: false,
        selectionStart: startTime,
        selectionEnd: stopTime,
      });
    }
  };

  renderContextMenuContents() {
    const { data } = this.props;

    if (data === null) {
      console.error(
        "The context menu assumes there is a selected react data and there wasn't one."
      );
      return <div />;
    }

    if (data.event !== null) {
      switch (data.event.type) {
        case 'schedule-render': // eslint-disable-line no-case-declarations
        case 'schedule-state-update': // eslint-disable-line no-case-declarations
        case 'suspend': // eslint-disable-line no-case-declarations
          return (
            <Fragment>
              <MenuItem
                onClick={this._copyComponentName}
                data={{ type: 'merge-call-node' }}
              >
                Copy component name
              </MenuItem>
              <MenuItem
                onClick={this._copyComponentStack}
                data={{ type: 'merge-call-node' }}
              >
                Copy component stack
              </MenuItem>
            </Fragment>
          );
        default:
          console.warn(`Unexpected event type "${data.event.type}"`);
          break;
      }
    } else if (data.measure !== null) {
      switch (data.measure.type) {
        case 'commit': // eslint-disable-line no-case-declarations
        case 'render-idle': // eslint-disable-line no-case-declarations
        case 'render': // eslint-disable-line no-case-declarations
        case 'layout-effects': // eslint-disable-line no-case-declarations
        case 'passive-effects': // eslint-disable-line no-case-declarations
          return (
            <Fragment>
              <MenuItem
                onClick={this._zoomToBatch}
                data={{ type: 'merge-call-node' }}
              >
                Zoom to batch
              </MenuItem>
              <div className="react-contextmenu-separator" />
              <MenuItem
                onClick={this._copySummary}
                data={{ type: 'merge-call-node' }}
              >
                Copy summary
              </MenuItem>
            </Fragment>
          );
        default:
          console.warn(`Unexpected measure type "${data.measure.type}"`);
          break;
      }
    }

    return null;
  }

  render() {
    const { data } = this.props;

    if (data === null) {
      return null;
    }

    return (
      <ContextMenu
        id="ReactContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        {this.renderContextMenuContents()}
      </ContextMenu>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    data: selectedThreadSelectors.getRightClickedReactData(state),
  }),
  mapDispatchToProps: {
    setContextMenuVisibility,
    updatePreviewSelection,
  },
  component: ReactContextMenu,
});
