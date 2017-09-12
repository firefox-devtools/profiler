/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { getFunctionName } from '../../profile-logic/function-info';
import copy from 'copy-to-clipboard';
import { addTransformToStack } from '../../actions/profile-view';
import {
  getSelectedThreadIndex,
  getImplementationFilter,
  getInvertCallstack,
} from '../../reducers/url-state';

import type { ImplementationFilter } from '../../types/actions';
import type {
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodePath,
} from '../../types/profile-derived';
import type { Thread, ThreadIndex } from '../../types/profile';

type Props = {
  thread: Thread,
  threadIndex: ThreadIndex,
  callNodeInfo: CallNodeInfo,
  implementation: ImplementationFilter,
  selectedCallNodePath: CallNodePath,
  selectedCallNodeIndex: IndexIntoCallNodeTable,
  inverted: boolean,
  addTransformToStack: typeof addTransformToStack,
};

require('./ProfileCallTreeContextMenu.css');

class ProfileCallTreeContextMenu extends PureComponent {
  props: Props;
  constructor(props: Props) {
    super(props);
    (this: any).handleClick = this.handleClick.bind(this);
  }

  copyFunctionName(): void {
    const {
      selectedCallNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
    const isJS = funcTable.isJS[funcIndex];
    const stringIndex = funcTable.name[funcIndex];
    const functionCall = stringTable.getString(stringIndex);
    const name = isJS ? functionCall : getFunctionName(functionCall);
    copy(name);
  }

  copyUrl(): void {
    const {
      selectedCallNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
    const stringIndex = funcTable.fileName[funcIndex];
    if (stringIndex !== null) {
      const fileName = stringTable.getString(stringIndex);
      copy(fileName);
    }
  }

  copyStack(): void {
    const {
      selectedCallNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    let stack = '';
    let callNodeIndex = selectedCallNodeIndex;

    do {
      const funcIndex = callNodeTable.func[callNodeIndex];
      const stringIndex = funcTable.name[funcIndex];
      stack += stringTable.getString(stringIndex) + '\n';
      callNodeIndex = callNodeTable.prefix[callNodeIndex];
    } while (callNodeIndex !== -1);

    copy(stack);
  }

  handleClick(event: SyntheticEvent, data: { type: string }): void {
    const { type } = data;
    switch (type) {
      case 'copy-function-name':
        this.copyFunctionName();
        break;
      case 'copy-url':
        this.copyUrl();
        break;
      case 'copy-stack':
        this.copyStack();
        break;
      case 'merge-call-node':
      case 'merge-function':
      case 'merge-subtree':
      case 'focus-subtree':
      case 'focus-function':
        this.addTransformToStack(type);
        break;
      default:
        throw new Error(`Unknown type ${data.type}`);
    }
  }

  addTransformToStack(
    type:
      | 'focus-subtree'
      | 'focus-function'
      | 'merge-subtree'
      | 'merge-call-node'
      | 'merge-function'
  ): void {
    const {
      addTransformToStack,
      threadIndex,
      implementation,
      selectedCallNodePath,
      inverted,
    } = this.props;

    switch (type) {
      case 'focus-subtree':
        addTransformToStack(threadIndex, {
          type: 'focus-subtree',
          callNodePath: selectedCallNodePath,
          implementation,
          inverted,
        });
        break;
      case 'focus-function':
        addTransformToStack(threadIndex, {
          type: 'focus-function',
          funcIndex: selectedCallNodePath[selectedCallNodePath.length - 1],
        });
        break;
      case 'merge-subtree':
        addTransformToStack(threadIndex, {
          type: 'merge-subtree',
          callNodePath: selectedCallNodePath,
          implementation,
          inverted,
        });
        break;
      case 'merge-call-node':
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: selectedCallNodePath,
          implementation,
        });
        break;
      case 'merge-function':
        addTransformToStack(threadIndex, {
          type: 'merge-function',
          funcIndex: selectedCallNodePath[selectedCallNodePath.length - 1],
        });
        break;
      default:
        throw new Error('Type not found.');
    }
  }

  render() {
    const {
      selectedCallNodeIndex,
      inverted,
      thread: { funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;
    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
    const isJS = funcTable.isJS[funcIndex];

    return (
      <ContextMenu id={'ProfileCallTreeContextMenu'}>
        {inverted
          ? null
          : <MenuItem
              onClick={this.handleClick}
              data={{ type: 'merge-call-node' }}
            >
              <span className="profileCallTreeContextMenuIcon profileCallTreeContextMenuIconMerge" />
              Merge node into calling function
            </MenuItem>}
        <MenuItem onClick={this.handleClick} data={{ type: 'merge-function' }}>
          <span className="profileCallTreeContextMenuIcon profileCallTreeContextMenuIconMerge" />
          Merge function into caller across the entire tree
        </MenuItem>
        {/* <MenuItem onClick={this.handleClick} data={{ type: 'mergeSubtree' }}>
          Merge subtree into calling function
        </MenuItem> */}
        <MenuItem onClick={this.handleClick} data={{ type: 'focus-subtree' }}>
          <span className="profileCallTreeContextMenuIcon profileCallTreeContextMenuIconFocus" />
          Focus on subtree
        </MenuItem>
        <MenuItem onClick={this.handleClick} data={{ type: 'focus-function' }}>
          <span className="profileCallTreeContextMenuIcon profileCallTreeContextMenuIconFocus" />
          {inverted
            ? 'Focus on calls made by this function'
            : 'Focus on function'}
        </MenuItem>
        <div className="react-contextmenu-separator" />
        <MenuItem
          onClick={this.handleClick}
          data={{ type: 'copy-function-name' }}
        >
          Copy function name
        </MenuItem>
        {isJS
          ? <MenuItem onClick={this.handleClick} data={{ type: 'copy-url' }}>
              Copy script URL
            </MenuItem>
          : null}
        <MenuItem onClick={this.handleClick} data={{ type: 'copy-stack' }}>
          Copy stack
        </MenuItem>
      </ContextMenu>
    );
  }
}

export default connect(
  state => ({
    thread: selectedThreadSelectors.getFilteredThread(state),
    threadIndex: getSelectedThreadIndex(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    implementation: getImplementationFilter(state),
    inverted: getInvertCallstack(state),
    selectedCallNodePath: selectedThreadSelectors.getSelectedCallNodePath(
      state
    ),
    selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
      state
    ),
  }),
  { addTransformToStack }
)(ProfileCallTreeContextMenu);
