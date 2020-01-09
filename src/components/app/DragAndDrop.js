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

type OwnDragAndDropProps = {|
  +className: string,
  +children?: React.Node,
|};

type DispatchDragAndDropProps = {|
  +retrieveProfileFromFile: typeof retrieveProfileFromFile,
|};

type DragAndDropState = {
  isDragging: boolean,
};

type DragAndDropProps = ConnectedProps<
  OwnDragAndDropProps,
  {||},
  DispatchDragAndDropProps
>;

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
        {/* Have the message div as a sibling to the area div
          above. The area div creates its own stacking context, so
          even if it contains children with high z-indexes, the
          message div will still appear on top when shown.*/}
        <div
          className={classNames(
            'homeDrop',
            this.state.isDragging ? 'dragging' : false
          )}
        >
          <div className="homeDropMessage">Drop a saved profile here</div>
        </div>
      </>
    );
  }
}

export default DragAndDrop;
