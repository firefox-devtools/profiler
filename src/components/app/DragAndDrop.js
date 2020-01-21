/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import { retrieveProfileFromFile } from '../../actions/receive-profile';
import type { ConnectedProps } from '../../utils/connect';

import './DragAndDrop.css';

function _dragPreventDefault(event: DragEvent) {
  event.preventDefault();
}

type OwnProps = {|
  +className?: string,
  +children?: React.Node,
  +render?: React.Node => React.Node,
|};

type DispatchProps = {|
  +retrieveProfileFromFile: typeof retrieveProfileFromFile,
|};

type DragAndDropState = {
  isDragging: boolean,
};

type DragAndDropProps = ConnectedProps<OwnProps, {||}, DispatchProps>;

// TODO Add documentation

/**
 * Creates a target area to drop files on. A dropped file will be
 * loaded into the profiler.
 */
class DragAndDrop extends React.PureComponent<
  DragAndDropProps,
  DragAndDropState
> {
  state = {
    isDragging: false,
  };

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
    this.setState({ isDragging: true });
  };

  _stopDragging = (event: Event) => {
    event.preventDefault();
    this.setState({ isDragging: false });
  };

  _handleProfileDrop = (event: DragEvent) => {
    event.preventDefault();
    this.setState({ isDragging: false });

    if (!event.dataTransfer) {
      return;
    }

    const { files } = event.dataTransfer;
    if (files.length > 0) {
      this.props.retrieveProfileFromFile(files[0]);
    }
  };

  render() {
    const { className, children, render } = this.props;

    const message = (
      <div
        className={classNames(
          'dragAndDropMessageWrapper',
          this.state.isDragging ? 'dragging' : false
        )}
      >
        <div className="dragAndDropMessage">Drop a saved profile here</div>
      </div>
    );

    return (
      <>
        <div
          className={classNames(className, 'dragAndDropArea')}
          onDragEnter={this._startDragging}
          onDragExit={this._stopDragging}
          onDrop={this._handleProfileDrop}
        >
          {render ? render(message) : children}
        </div>
        {/* If we weren't provided a render prop, have the message div
          as a sibling to the area div above. The area div creates its
          own stacking context, so even if it contains children with
          high z-indexes, the message div will still appear on top
          when shown.*/
        render === undefined && message}
      </>
    );
  }
}

export default DragAndDrop;
