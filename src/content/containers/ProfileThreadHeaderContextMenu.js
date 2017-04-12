// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import actions from '../actions';
import { connect } from 'react-redux';
import { getThreads, getThreadOrder } from '../reducers/profile-view';
import { getFriendlyThreadName } from '../profile-data';
import classNames from 'classnames';

import type { Thread, ThreadIndex } from '../../common/types/profile';
import type { Action } from '../actions/types';

type Props = {
  threads: Thread[],
  threadOrder: ThreadIndex[],
  hideThread: ThreadIndex => Action,
  showThread: (Thread[], ThreadIndex) => Action,
}

class ProfileThreadHeaderContextMenu extends PureComponent {

  props: Props

  constructor(props: Props) {
    super(props);
    (this: any).handleClick = this.handleClick.bind(this);
  }

  handleClick(
    event: SyntheticEvent,
    data: { threadIndex: ThreadIndex, isVisible: boolean }
  ): void {
    if (data.isVisible) {
      this.props.hideThread(data.threadIndex);
    } else {
      this.props.showThread(this.props.threads, data.threadIndex);
    }
  }

  render() {
    const { threads, threadOrder } = this.props;

    return (
      <ContextMenu id={'ProfileThreadHeaderContextMenu'}>
        {threads.map((thread, threadIndex) => {
          const isVisible = threadOrder.includes(threadIndex);
          return (
            <MenuItem onClick={this.handleClick}
                      data={{threadIndex, isVisible}}
                      key={threadIndex}
                      preventClose={true}
                      attributes={{
                        className: classNames({ checkable: true, checked: isVisible }),
                      }}>
              {getFriendlyThreadName(threads, thread)}
            </MenuItem>
          );
        })}
      </ContextMenu>
    );
  }
}

export default connect(state => ({
  threads: getThreads(state),
  threadOrder: getThreadOrder(state),
}), actions)(ProfileThreadHeaderContextMenu);
