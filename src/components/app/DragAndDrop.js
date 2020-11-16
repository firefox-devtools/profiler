/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { retrieveProfileFromFile } from 'firefox-profiler/actions/receive-profile';
import { connect } from 'react-redux';

import {
  startDragging,
  stopDragging,
  registerDragAndDropOverlay,
  unregisterDragAndDropOverlay,
} from 'firefox-profiler/actions/app';
import {
  getIsDragAndDropDragging,
  getIsDragAndDropOverlayRegistered,
  getIsNewProfileLoadAllowed,
} from 'firefox-profiler/selectors/app';
import type { ConnectedProps, State } from 'firefox-profiler/types';

import './DragAndDrop.css';

function _dragPreventDefault(event: DragEvent) {
  event.preventDefault();
}

type OwnProps = {|
  +className?: string,
  +children?: React.Node,
|};

type StateProps = {|
  +isNewProfileLoadAllowed: boolean,
  +useDefaultOverlay: boolean,
|};

type DispatchProps = {|
  +retrieveProfileFromFile: typeof retrieveProfileFromFile,
  +startDragging: typeof startDragging,
  +stopDragging: typeof stopDragging,
|};

const mapStateToProps = (state: State): StateProps => ({
  isNewProfileLoadAllowed: getIsNewProfileLoadAllowed(state),
  useDefaultOverlay: !getIsDragAndDropOverlayRegistered(state),
});

const mapDispatchToProps: DispatchProps = {
  retrieveProfileFromFile,
  startDragging,
  stopDragging,
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

/**
 * Creates a target area to drop files on. Any elements which should
 * be part of the target area should be wrapped by this component.
 * A dropped file on this component or any of its children will be
 * loaded into the profiler.
 *
 * By default, a <DragAndDropOverlay /> component will be added as a
 * sibling to <DragAndDrop>, which will display a message asking the
 * user to drop a file whenever a drag is detected. This overlay will
 * cover the whole target area.
 *
 * <DragAndDrop>
 *   ... children ...
 * </DragAndDrop>
 * <DragAndDropOverlay />  <-- added by default
 *
 * If a smaller overlay message is desired, <DragAndDropOverlay /> can
 * be explicitly added as a child of <DragAndDrop>. That overlay will
 * override the default one and be shown instead. This can give a
 * nicer visual appearance for some views.
 *
 * <DragAndDrop>
 *   ... children ...
 *   <section>
 *     <DragAndDropOverlay />  <-- manually added
 *   <section>
 * </DragAndDrop>
 * (no default overlay added here anymore)
 */

class DragAndDropImpl extends React.PureComponent<Props> {
  componentDidMount() {
    // Prevent dropping files on the document.
    document.addEventListener('drag', _dragPreventDefault, false);
    document.addEventListener('dragover', _dragPreventDefault, false);
    document.addEventListener('drop', _dragPreventDefault, false);
  }

  componentWillUnmount() {
    document.removeEventListener('drag', _dragPreventDefault, false);
    document.removeEventListener('dragover', _dragPreventDefault, false);
    document.removeEventListener('drop', _dragPreventDefault, false);
  }

  _startDragging = (event: Event) => {
    event.preventDefault();
    this.props.startDragging();
  };

  _stopDragging = (event: Event) => {
    event.preventDefault();
    this.props.stopDragging();
  };

  _handleProfileDrop = (event: DragEvent) => {
    event.preventDefault();
    this.props.stopDragging();

    if (!event.dataTransfer || !this.props.isNewProfileLoadAllowed) {
      return;
    }

    const { files } = event.dataTransfer;
    if (files.length > 0) {
      this.props.retrieveProfileFromFile(files[0]);
    }
  };

  render() {
    const { className, children } = this.props;

    return (
      <>
        <div
          className={classNames(className, 'dragAndDropArea')}
          onDragEnter={this._startDragging}
          onDragExit={this._stopDragging}
          onDrop={this._handleProfileDrop}
        >
          {children}
        </div>
        {/* Put the default overlay here if it is to be used. The
          dragAndDropArea div creates its own stacking context, so
          even if it contains children with high z-indexes, the
          default overlay will still appear on top when shown.*/
        this.props.useDefaultOverlay ? (
          <DragAndDropOverlay isDefault={true} />
        ) : null}
      </>
    );
  }
}

export const DragAndDrop = connect<OwnProps, StateProps, DispatchProps>(
  mapStateToProps,
  mapDispatchToProps
)(DragAndDropImpl);

type OverlayOwnProps = {|
  +isDefault?: boolean,
|};
type OverlayStateProps = {|
  +isDragging: boolean,
  +isNewProfileLoadAllowed: boolean,
|};
type OverlayDispatchProps = {|
  +registerDragAndDropOverlay: typeof registerDragAndDropOverlay,
  +unregisterDragAndDropOverlay: typeof unregisterDragAndDropOverlay,
|};
type OverlayProps = ConnectedProps<
  OverlayOwnProps,
  OverlayStateProps,
  OverlayDispatchProps
>;

/**
 * An overlay which is visible only when the user is dragging a file.
 *
 * Unless this is the default overlay, this component will register
 * itself at mount time to prevent the default one from also being
 * rendered.
 */
class DragAndDropOverlayImpl extends React.PureComponent<OverlayProps> {
  componentDidMount() {
    if (!this.props.isDefault) {
      this.props.registerDragAndDropOverlay();
    }
  }

  componentWillUnmount() {
    if (!this.props.isDefault) {
      this.props.unregisterDragAndDropOverlay();
    }
  }

  render() {
    return (
      <div
        className={classNames(
          'dragAndDropOverlayWrapper',
          this.props.isDragging && this.props.isNewProfileLoadAllowed
            ? 'dragging'
            : false
        )}
      >
        <div className="dragAndDropOverlay">Drop a saved profile here</div>
      </div>
    );
  }
}

const overlayMapStateToProps = (state: State): OverlayStateProps => ({
  isDragging: getIsDragAndDropDragging(state),
  isNewProfileLoadAllowed: getIsNewProfileLoadAllowed(state),
});

const overlayMapDispatchToProps: OverlayDispatchProps = {
  registerDragAndDropOverlay,
  unregisterDragAndDropOverlay,
};

export const DragAndDropOverlay = connect<
  OverlayOwnProps,
  OverlayStateProps,
  OverlayDispatchProps
>(
  overlayMapStateToProps,
  overlayMapDispatchToProps
)(DragAndDropOverlayImpl);
