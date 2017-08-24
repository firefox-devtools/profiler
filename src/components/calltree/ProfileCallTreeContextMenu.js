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
        this.addTransformToStack(type);
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

    // This switch statement could be simplified, but Flow can't figure out what's going
    // on with the unions of Transforms.
    //
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
              Merge node into calling function
            </MenuItem>}
        <MenuItem onClick={this.handleClick} data={{ type: 'merge-function' }}>
          Merge function into caller across the entire tree
        </MenuItem>
        {/* <MenuItem onClick={this.handleClick} data={{ type: 'mergeSubtree' }}>
          Merge subtree into calling function
        </MenuItem> */}
        <MenuItem onClick={this.handleClick} data={{ type: 'focus-subtree' }}>
          Focus on subtree
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
