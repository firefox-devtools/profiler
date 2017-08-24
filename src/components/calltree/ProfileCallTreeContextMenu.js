/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../../reducers/profile-view';
import { stripFunctionArguments } from '../../profile-logic/function-info';
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
    const stringIndex = funcTable.name[funcIndex];
    const functionCall = stringTable.getString(stringIndex);
    const name = stripFunctionArguments(functionCall);
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

  handleClick(
    event: SyntheticEvent,
    data: { type: 'copyFunctionName' | 'copyStack' }
  ): void {
    switch (data.type) {
      case 'copyFunctionName':
        this.copyFunctionName();
        break;
      case 'copyUrl':
        this.copyUrl();
        break;
      case 'copyStack':
        this.copyStack();
        break;
      case 'mergeCallNode':
        this.addTransformToStack('merge-call-node');
        break;
      case 'mergeFunction':
        this.addTransformToStack('merge-function');
        break;
      case 'mergeSubtree':
        this.addTransformToStack('merge-subtree');
        break;
      case 'focusSubtree':
        this.addTransformToStack('focus-subtree');
        break;
      default:
        throw new Error(`Unknown type ${data.type}`);
    }
  }

  addTransformToStack(
    type:
      | 'focus-subtree'
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

    // Flow just isn't working for me here. I resorted to a switch statement. This really
    // shouldn't be necessary.
    // Tracking issue: https://github.com/facebook/flow/issues/4683
    switch (type) {
      case 'focus-subtree':
        addTransformToStack(threadIndex, {
          type: 'focus-subtree',
          callNodePath: selectedCallNodePath,
          implementation,
          inverted,
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
          inverted,
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
      thread: { funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;
    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
    const isJS = funcTable.isJS[funcIndex];

    return (
      <ContextMenu id={'ProfileCallTreeContextMenu'}>
        <MenuItem onClick={this.handleClick} data={{ type: 'mergeCallNode' }}>
          Merge node into calling function
        </MenuItem>
        <MenuItem onClick={this.handleClick} data={{ type: 'mergeFunction' }}>
          Merge function into caller across the entire tree
        </MenuItem>
        {/* <MenuItem onClick={this.handleClick} data={{ type: 'mergeSubtree' }}>
          Merge subtree into calling function
        </MenuItem> */}
        <MenuItem onClick={this.handleClick} data={{ type: 'focusSubtree' }}>
          Focus on subtree
        </MenuItem>
        <div className="react-contextmenu-separator" />
        <MenuItem
          onClick={this.handleClick}
          data={{ type: 'copyFunctionName' }}
        >
          Copy function name
        </MenuItem>
        {isJS
          ? <MenuItem onClick={this.handleClick} data={{ type: 'copyUrl' }}>
              Copy script URL
            </MenuItem>
          : null}
        <MenuItem onClick={this.handleClick} data={{ type: 'copyStack' }}>
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
