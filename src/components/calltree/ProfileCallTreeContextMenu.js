/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem, SubMenu } from 'react-contextmenu';
import { mergeFunction, mergeSubtree } from '../../actions/profile-view';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { stripFunctionArguments } from '../../profile-logic/function-info';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import copy from 'copy-to-clipboard';

import type {
  IndexIntoFuncStackTable,
  FuncStackInfo,
} from '../../types/profile-derived';
import type {
  Thread,
  ThreadIndex,
  IndexIntoFuncTable,
} from '../../types/profile';

type Props = {
  thread: Thread,
  threadIndex: ThreadIndex,
  funcStackInfo: FuncStackInfo,
  selectedFuncStack: IndexIntoFuncStackTable,
  mergeFunction: typeof mergeFunction,
  mergeSubtree: typeof mergeSubtree,
};

require('./ProfileCallTreeContextMenu.css');

class ProfileCallTreeContextMenu extends PureComponent {
  constructor(props: Props) {
    super(props);
    (this: any).copyFunctionName = this.copyFunctionName.bind(this);
    (this: any).copyStack = this.copyStack.bind(this);
    (this: any).mergeFunction = this.mergeFunction.bind(this);
    (this: any).mergeSubtree = this.mergeSubtree.bind(this);
  }

  getSelectedFuncIndex(): IndexIntoFuncTable {
    const { selectedFuncStack, funcStackInfo: { funcStackTable } } = this.props;

    return funcStackTable.func[selectedFuncStack];
  }

  copyFunctionName(): void {
    const {
      selectedFuncStack,
      thread: { stringTable, funcTable },
      funcStackInfo: { funcStackTable },
    } = this.props;

    const funcIndex = funcStackTable.func[selectedFuncStack];
    const stringIndex = funcTable.name[funcIndex];
    const functionCall = stringTable.getString(stringIndex);
    const name = stripFunctionArguments(functionCall);
    copy(name);
  }

  copyStack(): void {
    const {
      selectedFuncStack,
      thread: { stringTable, funcTable },
      funcStackInfo: { funcStackTable },
    } = this.props;

    let stack = '';
    let funcStackIndex = selectedFuncStack;

    do {
      const funcIndex = funcStackTable.func[funcStackIndex];
      const stringIndex = funcTable.name[funcIndex];
      stack += stringTable.getString(stringIndex) + '\n';
      funcStackIndex = funcStackTable.prefix[funcStackIndex];
    } while (funcStackIndex !== -1);

    copy(stack);
  }

  mergeFunction(): void {
    const { threadIndex } = this.props;
    this.props.mergeFunction(this.getSelectedFuncIndex(), threadIndex);
  }

  mergeSubtree(): void {
    const { threadIndex } = this.props;
    this.props.mergeSubtree(this.getSelectedFuncIndex(), threadIndex);
  }

  render() {
    return (
      <ContextMenu id={'ProfileCallTreeContextMenu'}>
        <SubMenu title="Copy" hoverDelay={200}>
          <MenuItem onClick={this.copyFunctionName}>Function Name</MenuItem>
          <MenuItem onClick={this.copyStack}>Stack</MenuItem>
        </SubMenu>
        <SubMenu title="Merge into caller" hoverDelay={200}>
          <MenuItem onClick={this.mergeFunction}>
            This function{' '}
            <span className="profileCallTreeContextMenuLabel">
              across entire thread
            </span>
          </MenuItem>
          <MenuItem onClick={this.mergeSubtree}>
            This subtree{' '}
            <span className="profileCallTreeContextMenuLabel">
              across entire thread
            </span>
          </MenuItem>
        </SubMenu>
      </ContextMenu>
    );
  }
}

export default connect(
  state => {
    const threadIndex = getSelectedThreadIndex(state);
    return {
      threadIndex,
      thread: selectedThreadSelectors.getFilteredThread(state),
      funcStackInfo: selectedThreadSelectors.getFuncStackInfo(state),
      selectedFuncStack: selectedThreadSelectors.getSelectedFuncStack(state),
    };
  },
  { mergeFunction, mergeSubtree }
)(ProfileCallTreeContextMenu);
