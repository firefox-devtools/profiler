/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import classNames from 'classnames';
import { retrieveProfileFromFile } from 'firefox-profiler/actions/receive-profile';
import { BrowserConnection } from 'firefox-profiler/app-logic/browser-connection';
import { ConnectedProps } from 'firefox-profiler/utils/connect';
import explicitConnect from 'firefox-profiler/utils/connect';

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
  getBrowserConnection,
} from 'firefox-profiler/selectors/app';

import './DragAndDrop.css';

function _dragPreventDefault(event: DragEvent) {
  event.preventDefault();
}

type OwnProps = {
  readonly className?: string;
  readonly children?: React.ReactNode;
};

type StateProps = {
  readonly isNewProfileLoadAllowed: boolean;
  readonly useDefaultOverlay: boolean;
  readonly browserConnection: BrowserConnection | null;
};

type DispatchProps = {
  readonly retrieveProfileFromFile: typeof retrieveProfileFromFile;
  readonly startDragging: typeof startDragging;
  readonly stopDragging: typeof stopDragging;
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
type DragLocation = 'INSIDE' | 'OUTSIDE';

class DragAndDropImpl extends React.PureComponent<Props> {
  // Keeps track of the nesting of dragenter / dragleave events.
  // As the mouse moves over various nested elements inside this element,
  // every time the mouse enters a new element, we first get the dragenter
  // event for that new element and then a dragleave for the previous element.
  _enteredElements: Set<HTMLElement> = new Set<HTMLElement>();

  _updateDragLocation(
    event: React.DragEvent<HTMLDivElement>
  ): [DragLocation, DragLocation] {
    const before = this._enteredElements.size > 0 ? 'INSIDE' : 'OUTSIDE';

    // Remove any elements which have been removed from our container since the
    // last enter / leave, for example via react DOM updates.
    // `container` is always our container div; we use currentTarget here so that
    // we don't have to set up a react ref for the element.
    const container = event.currentTarget;
    this._enteredElements = new Set<HTMLElement>(
      [...this._enteredElements].filter((el) => container.contains(el))
    );

    // Add or remove event.target to/from this._enteredElements.
    if (event.target instanceof HTMLElement) {
      const target = event.target;
      if (event.type === 'dragenter') {
        this._enteredElements.add(target);
      } else if (event.type === 'dragleave') {
        this._enteredElements.delete(target);
      }
    }

    const after = this._enteredElements.size > 0 ? 'INSIDE' : 'OUTSIDE';
    return [before, after];
  }

  _resetDragLocation() {
    this._enteredElements = new Set<HTMLElement>();
  }

  override componentDidMount() {
    // Prevent dropping files on the document.
    document.addEventListener('drag', _dragPreventDefault, false);
    document.addEventListener('dragover', _dragPreventDefault, false);
    document.addEventListener('drop', _dragPreventDefault, false);
  }

  override componentWillUnmount() {
    document.removeEventListener('drag', _dragPreventDefault, false);
    document.removeEventListener('dragover', _dragPreventDefault, false);
    document.removeEventListener('drop', _dragPreventDefault, false);
  }

  _onDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const [before, after] = this._updateDragLocation(event);
    if (before === 'OUTSIDE' && after === 'INSIDE') {
      this.props.startDragging();
    }
  };

  _onDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const [before, after] = this._updateDragLocation(event);
    if (before === 'INSIDE' && after === 'OUTSIDE') {
      this.props.stopDragging();
    }
  };

  _handleProfileDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    this._resetDragLocation();
    this.props.stopDragging();

    if (!event.dataTransfer || !this.props.isNewProfileLoadAllowed) {
      return;
    }

    const { files } = event.dataTransfer;
    if (files.length > 0) {
      this.props.retrieveProfileFromFile(
        files[0],
        this.props.browserConnection
      );
    }
  };

  override render() {
    const { className, children } = this.props;

    return (
      <>
        <div
          className={classNames(className, 'dragAndDropArea')}
          onDragEnter={this._onDragEnter}
          onDragLeave={this._onDragLeave}
          onDrop={this._handleProfileDrop}
        >
          {children}
        </div>
        {
          /* Put the default overlay here if it is to be used. The
          dragAndDropArea div creates its own stacking context, so
          even if it contains children with high z-indexes, the
          default overlay will still appear on top when shown.*/
          this.props.useDefaultOverlay ? (
            <DragAndDropOverlay isDefault={true} />
          ) : null
        }
      </>
    );
  }
}

export const DragAndDrop = explicitConnect<OwnProps, StateProps, DispatchProps>(
  {
    mapStateToProps: (state) => ({
      isNewProfileLoadAllowed: getIsNewProfileLoadAllowed(state),
      useDefaultOverlay: !getIsDragAndDropOverlayRegistered(state),
      browserConnection: getBrowserConnection(state),
    }),
    mapDispatchToProps: {
      retrieveProfileFromFile,
      startDragging,
      stopDragging,
    },
    component: DragAndDropImpl,
  }
);

type OverlayOwnProps = {
  readonly isDefault?: boolean;
};
type OverlayStateProps = {
  readonly isDragging: boolean;
  readonly isNewProfileLoadAllowed: boolean;
};
type OverlayDispatchProps = {
  readonly registerDragAndDropOverlay: typeof registerDragAndDropOverlay;
  readonly unregisterDragAndDropOverlay: typeof unregisterDragAndDropOverlay;
};
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
  override componentDidMount() {
    if (!this.props.isDefault) {
      this.props.registerDragAndDropOverlay();
    }
  }

  override componentWillUnmount() {
    if (!this.props.isDefault) {
      this.props.unregisterDragAndDropOverlay();
    }
  }

  override render() {
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

export const DragAndDropOverlay = explicitConnect<
  OverlayOwnProps,
  OverlayStateProps,
  OverlayDispatchProps
>({
  mapStateToProps: (state) => ({
    isDragging: getIsDragAndDropDragging(state),
    isNewProfileLoadAllowed: getIsNewProfileLoadAllowed(state),
  }),
  mapDispatchToProps: {
    registerDragAndDropOverlay,
    unregisterDragAndDropOverlay,
  },
  component: DragAndDropOverlayImpl,
});
