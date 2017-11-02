/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import { hideThread, showThread } from '../../actions/profile-view';
import { connect } from 'react-redux';
import { getThreads } from '../../reducers/profile-view';
import { getThreadOrder, getHiddenThreads } from '../../reducers/url-state';
import { getFriendlyThreadName } from '../../profile-logic/profile-data';
import classNames from 'classnames';

import type { Thread, ThreadIndex } from '../../types/profile';
import type { State } from '../../types/reducers';

type Props = {|
  threads: Thread[],
  threadOrder: ThreadIndex[],
  hiddenThreads: ThreadIndex[],
  hideThread: typeof hideThread,
  showThread: typeof showThread,
|};

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
      threadOrder: ThreadIndex[],
      hiddenThreads: ThreadIndex[],
      threadIndex: ThreadIndex,
      isHidden: boolean,
    }
  ): void {
    const { threadOrder, hiddenThreads, threadIndex, isHidden } = data;
    const { hideThread, showThread } = this.props;
    if (isHidden) {
      showThread(threadIndex);
    } else {
      hideThread(threadIndex, threadOrder, hiddenThreads);
    }
  }

  render() {
    const { threads, threadOrder, hiddenThreads } = this.props;

    return (
      <ContextMenu id={'ProfileThreadHeaderContextMenu'}>
        {threadOrder.map(threadIndex => {
          const isHidden = hiddenThreads.includes(threadIndex);
          return (
            <MenuItem
              key={threadIndex}
              preventClose={true}
              data={{ threadOrder, hiddenThreads, threadIndex, isHidden }}
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

export default connect(
  (state: State) => ({
    threads: getThreads(state),
    threadOrder: getThreadOrder(state),
    hiddenThreads: getHiddenThreads(state),
  }),
  { hideThread, showThread }
)(ProfileThreadHeaderContextMenu);
