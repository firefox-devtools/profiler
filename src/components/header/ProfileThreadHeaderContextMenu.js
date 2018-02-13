/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import {
  hideThread,
  showThread,
  isolateThread,
} from '../../actions/profile-view';
import explicitConnect from '../../utils/connect';
import {
  getThreads,
  getRightClickedThreadIndex,
} from '../../reducers/profile-view';
import { getThreadOrder, getHiddenThreads } from '../../reducers/url-state';
import { getFriendlyThreadName } from '../../profile-logic/profile-data';
import classNames from 'classnames';

import type { Thread, ThreadIndex } from '../../types/profile';
import type { State } from '../../types/reducers';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type StateProps = {|
  +threads: Thread[],
  +threadOrder: ThreadIndex[],
  +hiddenThreads: ThreadIndex[],
  +rightClickedThreadIndex: ThreadIndex,
|};

type DispatchProps = {|
  +hideThread: typeof hideThread,
  +showThread: typeof showThread,
  +isolateThread: typeof isolateThread,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class ProfileThreadHeaderContextMenu extends PureComponent<Props> {
  constructor(props: Props) {
    super(props);
    (this: any)._toggleThreadVisibility = this._toggleThreadVisibility.bind(
      this
    );
  }

  _toggleThreadVisibility(
    _,
    data: {
      threadIndex: ThreadIndex,
      isHidden: boolean,
    }
  ): void {
    const { threadIndex, isHidden } = data;
    const { hideThread, showThread } = this.props;
    if (isHidden) {
      showThread(threadIndex);
    } else {
      hideThread(threadIndex);
    }
  }

  _isolateThread = () => {
    const { isolateThread, rightClickedThreadIndex } = this.props;
    isolateThread(rightClickedThreadIndex);
  };

  render() {
    const {
      threads,
      threadOrder,
      hiddenThreads,
      rightClickedThreadIndex,
    } = this.props;

    const clickedThreadName = getFriendlyThreadName(
      threads,
      threads[rightClickedThreadIndex]
    );

    return (
      <ContextMenu id={'ProfileThreadHeaderContextMenu'}>
        {hiddenThreads.length === threads.length - 1 ? null : (
          <div>
            <MenuItem onClick={this._isolateThread}>
              Only show: {`"${clickedThreadName}"`}
            </MenuItem>
            <div className="react-contextmenu-separator" />
          </div>
        )}
        {threadOrder.map(threadIndex => {
          const isHidden = hiddenThreads.includes(threadIndex);
          return (
            <MenuItem
              key={threadIndex}
              preventClose={true}
              data={{ threadIndex, isHidden }}
              onClick={this._toggleThreadVisibility}
              attributes={{
                className: classNames({ checkable: true, checked: !isHidden }),
              }}
            >
              {getFriendlyThreadName(threads, threads[threadIndex])}
            </MenuItem>
          );
        })}
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: (state: State) => ({
    threads: getThreads(state),
    threadOrder: getThreadOrder(state),
    hiddenThreads: getHiddenThreads(state),
    rightClickedThreadIndex: getRightClickedThreadIndex(state),
  }),
  mapDispatchToProps: { hideThread, showThread, isolateThread },
  component: ProfileThreadHeaderContextMenu,
};
export default explicitConnect(options);
