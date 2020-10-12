/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, Fragment } from 'react';
import { MenuItem } from 'react-contextmenu';
import ContextMenu from '../shared/ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import { funcHasRecursiveCall } from 'firefox-profiler/profile-logic/transforms';
import { getFunctionName } from 'firefox-profiler/profile-logic/function-info';
import copy from 'copy-to-clipboard';
import {
  addTransformToStack,
  expandAllCallNodeDescendants,
  setContextMenuVisibility,
} from '../../actions/profile-view';
import {
  getSelectedTab,
  getImplementationFilter,
  getInvertCallstack,
} from '../../selectors/url-state';
import { getRightClickedCallNodeInfo } from '../../selectors/right-clicked-call-node';
import { getThreadSelectorsFromThreadsKey } from '../../selectors/per-thread';

import {
  convertToTransformType,
  assertExhaustiveCheck,
} from '../../utils/flow';

import type {
  TransformType,
  ImplementationFilter,
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodePath,
  Thread,
  ThreadsKey,
} from 'firefox-profiler/types';

import type { TabSlug } from '../../app-logic/tabs-handling';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +thread: Thread | null,
  +threadsKey: ThreadsKey | null,
  +callNodeInfo: CallNodeInfo | null,
  +rightClickedCallNodePath: CallNodePath | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +implementation: ImplementationFilter,
  +inverted: boolean,
  +selectedTab: TabSlug,
|};

type DispatchProps = {|
  +addTransformToStack: typeof addTransformToStack,
  +expandAllCallNodeDescendants: typeof expandAllCallNodeDescendants,
  +setContextMenuVisibility: typeof setContextMenuVisibility,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

require('./CallNodeContextMenu.css');

class CallNodeContextMenu extends PureComponent<Props> {
  _hidingTimeout: TimeoutID | null = null;

  // Using setTimeout here is a bit complex, but is necessary to make the menu
  // work fine when we want to display it somewhere when it's already open
  // somewhere else.
  // This is the order of events in such a situation:
  // 0. The menu is open somewhere, it means the user right clicked somewhere
  //     previously, and as a result some node has the "right clicked" status.
  // 1. The user right clicks on another node. This is actually happening in
  //    several events, the first event is "mousedown": this is where our own
  //    components react for right click (both our TreeView and our charts)
  //    and thus this is when the "right clicked" item is set in our store. BTW
  //    this triggers a rerender of this component.
  // 2. Then the event "mouseup" happens but we don't do anything for it for right
  //    clicks.
  // 3. Then the event "contextmenu" is triggered. This is the event that the
  //    context menu library reacts to: first it closes the previous menu, then
  //    opens the new one. This means that `_onHide` is called first for the
  //    first menu, then `_onShow` for the second menu.
  //    The problem here is that the call to `setContextMenuVisibility` we do in
  //    `onHide` resets the value for the "right clicked" item. This is normally
  //    what we want when the user closes the menu, but this case where the menu
  //    is still open but for another node, we don't want to reset this value
  //    which was set earlier when handling the "mousedown" event.
  //    To avoid this problem we use this `setTimeout` call to delay the reset
  //    just a bit, just in case we get a `_onShow` call right after that.
  _onShow = () => {
    clearTimeout(this._hidingTimeout);
    this.props.setContextMenuVisibility(true);
  };

  _onHide = () => {
    this._hidingTimeout = setTimeout(() => {
      this._hidingTimeout = null;
      this.props.setContextMenuVisibility(false);
    });
  };

  _getFunctionName(): string {
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const {
      callNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = rightClickedCallNodeInfo;

    const funcIndex = callNodeTable.func[callNodeIndex];
    const isJS = funcTable.isJS[funcIndex];
    const stringIndex = funcTable.name[funcIndex];
    const functionCall = stringTable.getString(stringIndex);
    const name = isJS ? functionCall : getFunctionName(functionCall);
    return name;
  }

  lookupFunctionOnSearchfox(): void {
    const name = this._getFunctionName();
    window.open(
      `https://searchfox.org/mozilla-central/search?q=${encodeURIComponent(
        name
      )}`,
      '_blank'
    );
  }

  copyFunctionName(): void {
    copy(this._getFunctionName());
  }

  copyUrl(): void {
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const {
      callNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = rightClickedCallNodeInfo;

    const funcIndex = callNodeTable.func[callNodeIndex];
    const stringIndex = funcTable.fileName[funcIndex];
    if (stringIndex !== null) {
      const fileName = stringTable.getString(stringIndex);
      copy(fileName);
    }
  }

  copyStack(): void {
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const {
      callNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = rightClickedCallNodeInfo;

    let stack = '';
    let curCallNodeIndex = callNodeIndex;

    do {
      const funcIndex = callNodeTable.func[curCallNodeIndex];
      const stringIndex = funcTable.name[funcIndex];
      stack += stringTable.getString(stringIndex) + '\n';
      curCallNodeIndex = callNodeTable.prefix[curCallNodeIndex];
    } while (curCallNodeIndex !== -1);

    copy(stack);
  }

  _handleClick = (event: SyntheticEvent<>, data: { type: string }): void => {
    const { type } = data;

    const transformType = convertToTransformType(type);
    if (transformType) {
      this.addTransformToStack(transformType);
      return;
    }

    switch (type) {
      case 'searchfox':
        this.lookupFunctionOnSearchfox();
        break;
      case 'copy-function-name':
        this.copyFunctionName();
        break;
      case 'copy-url':
        this.copyUrl();
        break;
      case 'copy-stack':
        this.copyStack();
        break;
      case 'expand-all':
        this.expandAll();
        break;
      default:
        throw new Error(`Unknown type ${type}`);
    }
  };

  addTransformToStack(type: TransformType): void {
    const { addTransformToStack, implementation, inverted } = this.props;
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const { threadsKey, callNodePath, thread } = rightClickedCallNodeInfo;
    const selectedFunc = callNodePath[callNodePath.length - 1];

    switch (type) {
      case 'focus-subtree':
        addTransformToStack(threadsKey, {
          type: 'focus-subtree',
          callNodePath: callNodePath,
          implementation,
          inverted,
        });
        break;
      case 'focus-function':
        addTransformToStack(threadsKey, {
          type: 'focus-function',
          funcIndex: selectedFunc,
        });
        break;
      case 'merge-call-node':
        addTransformToStack(threadsKey, {
          type: 'merge-call-node',
          callNodePath: callNodePath,
          implementation,
        });
        break;
      case 'merge-function':
        addTransformToStack(threadsKey, {
          type: 'merge-function',
          funcIndex: selectedFunc,
        });
        break;
      case 'drop-function':
        addTransformToStack(threadsKey, {
          type: 'drop-function',
          funcIndex: selectedFunc,
        });
        break;
      case 'collapse-resource': {
        const { funcTable } = thread;
        const resourceIndex = funcTable.resource[selectedFunc];
        // A new collapsed func will be inserted into the table at the end. Deduce
        // the index here.
        const collapsedFuncIndex = funcTable.length;
        addTransformToStack(threadsKey, {
          type: 'collapse-resource',
          resourceIndex,
          collapsedFuncIndex,
          implementation,
        });
        break;
      }
      case 'collapse-direct-recursion': {
        addTransformToStack(threadsKey, {
          type: 'collapse-direct-recursion',
          funcIndex: selectedFunc,
          implementation,
        });
        break;
      }
      case 'collapse-function-subtree': {
        addTransformToStack(threadsKey, {
          type: 'collapse-function-subtree',
          funcIndex: selectedFunc,
        });
        break;
      }
      default:
        assertExhaustiveCheck(type);
    }
  }

  expandAll(): void {
    const { expandAllCallNodeDescendants } = this.props;
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const {
      threadsKey,
      callNodeIndex,
      callNodeInfo,
    } = rightClickedCallNodeInfo;

    expandAllCallNodeDescendants(threadsKey, callNodeIndex, callNodeInfo);
  }

  getNameForSelectedResource(): string | null {
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const {
      callNodePath,
      thread: { funcTable, stringTable, resourceTable, libs },
    } = rightClickedCallNodeInfo;

    const funcIndex = callNodePath[callNodePath.length - 1];
    if (funcIndex === undefined) {
      return null;
    }
    const isJS = funcTable.isJS[funcIndex];

    if (isJS) {
      const fileNameIndex = funcTable.fileName[funcIndex];
      return fileNameIndex === null
        ? null
        : stringTable.getString(fileNameIndex);
    }
    const resourceIndex = funcTable.resource[funcIndex];
    if (resourceIndex === -1) {
      return null;
    }
    const libIndex = resourceTable.lib[resourceIndex];
    if (libIndex === undefined || libIndex === null || libIndex === -1) {
      return null;
    }
    return libs[libIndex].name;
  }

  /**
   * Determine if this CallNode represent a recursive function call.
   */
  isRecursiveCall(): boolean {
    const { implementation } = this.props;
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      console.error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
      return false;
    }

    const { callNodePath, thread } = rightClickedCallNodeInfo;
    const funcIndex = callNodePath[callNodePath.length - 1];

    if (funcIndex === undefined) {
      return false;
    }

    // Do the easy thing first, see if this function was called by itself.
    if (callNodePath[callNodePath.length - 2] === funcIndex) {
      return true;
    }

    // Do a full check of the stackTable for recursion.
    return funcHasRecursiveCall(thread, implementation, funcIndex);
  }

  getRightClickedCallNodeInfo(): null | {|
    +thread: Thread,
    +threadsKey: ThreadsKey,
    +callNodeInfo: CallNodeInfo,
    +callNodePath: CallNodePath,
    +callNodeIndex: IndexIntoCallNodeTable,
  |} {
    const {
      thread,
      threadsKey,
      callNodeInfo,
      rightClickedCallNodePath,
      rightClickedCallNodeIndex,
    } = this.props;

    if (
      thread &&
      threadsKey !== null &&
      callNodeInfo &&
      rightClickedCallNodePath &&
      typeof rightClickedCallNodeIndex === 'number'
    ) {
      return {
        thread,
        threadsKey,
        callNodeInfo,
        callNodePath: rightClickedCallNodePath,
        callNodeIndex: rightClickedCallNodeIndex,
      };
    }

    return null;
  }

  renderContextMenuContents() {
    const { inverted, selectedTab } = this.props;
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      console.error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
      return <div />;
    }

    const {
      callNodeIndex,
      thread: { funcTable },
      callNodeInfo: { callNodeTable },
    } = rightClickedCallNodeInfo;

    const funcIndex = callNodeTable.func[callNodeIndex];
    const isJS = funcTable.isJS[funcIndex];
    // This could be the C++ library, or the JS filename.
    const nameForResource = this.getNameForSelectedResource();
    const showExpandAll = selectedTab === 'calltree';

    return (
      <Fragment>
        {inverted ? null : (
          <MenuItem
            onClick={this._handleClick}
            data={{ type: 'merge-call-node' }}
          >
            <span className="callNodeContextMenuIcon callNodeContextMenuIconMerge" />
            Merge node into calling function
          </MenuItem>
        )}
        <MenuItem onClick={this._handleClick} data={{ type: 'merge-function' }}>
          <span className="callNodeContextMenuIcon callNodeContextMenuIconMerge" />
          Merge function into caller across the entire tree
        </MenuItem>
        <MenuItem onClick={this._handleClick} data={{ type: 'focus-subtree' }}>
          <span className="callNodeContextMenuIcon callNodeContextMenuIconFocus" />
          Focus on subtree
        </MenuItem>
        <MenuItem onClick={this._handleClick} data={{ type: 'focus-function' }}>
          <span className="callNodeContextMenuIcon callNodeContextMenuIconFocus" />
          {inverted
            ? 'Focus on calls made by this function'
            : 'Focus on function'}
        </MenuItem>
        <MenuItem
          onClick={this._handleClick}
          data={{ type: 'collapse-function-subtree' }}
        >
          <span className="callNodeContextMenuIcon callNodeContextMenuIconCollapse" />
          Collapse function’s subtree across the entire tree
        </MenuItem>
        {nameForResource ? (
          <MenuItem
            onClick={this._handleClick}
            data={{ type: 'collapse-resource' }}
          >
            <span className="callNodeContextMenuIcon callNodeContextMenuIconCollapse" />
            Collapse functions in{' '}
            <span className="callNodeContextMenuLabel">{nameForResource}</span>
          </MenuItem>
        ) : null}
        {this.isRecursiveCall() ? (
          <MenuItem
            onClick={this._handleClick}
            data={{ type: 'collapse-direct-recursion' }}
          >
            <span className="callNodeContextMenuIcon callNodeContextMenuIconCollapse" />
            Collapse direct recursion
          </MenuItem>
        ) : null}
        <MenuItem onClick={this._handleClick} data={{ type: 'drop-function' }}>
          <span className="callNodeContextMenuIcon callNodeContextMenuIconDrop" />
          Drop samples with this function
        </MenuItem>
        <div className="react-contextmenu-separator" />
        {showExpandAll ? (
          <Fragment>
            <MenuItem onClick={this._handleClick} data={{ type: 'expand-all' }}>
              Expand all
            </MenuItem>
            <div className="react-contextmenu-separator" />
          </Fragment>
        ) : null}
        <MenuItem onClick={this._handleClick} data={{ type: 'searchfox' }}>
          Look up the function name on Searchfox
        </MenuItem>
        <MenuItem
          onClick={this._handleClick}
          data={{ type: 'copy-function-name' }}
        >
          Copy function name
        </MenuItem>
        {isJS ? (
          <MenuItem onClick={this._handleClick} data={{ type: 'copy-url' }}>
            Copy script URL
          </MenuItem>
        ) : null}
        <MenuItem onClick={this._handleClick} data={{ type: 'copy-stack' }}>
          Copy stack
        </MenuItem>
      </Fragment>
    );
  }

  render() {
    const rightClickedCallNodeInfo = this.getRightClickedCallNodeInfo();

    if (rightClickedCallNodeInfo === null) {
      return null;
    }

    return (
      <ContextMenu
        id="CallNodeContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        {this.renderContextMenuContents()}
      </ContextMenu>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    const rightClickedCallNodeInfo = getRightClickedCallNodeInfo(state);

    let thread = null;
    let threadsKey = null;
    let callNodeInfo = null;
    let rightClickedCallNodePath = null;
    let rightClickedCallNodeIndex = null;

    if (rightClickedCallNodeInfo !== null) {
      const selectors = getThreadSelectorsFromThreadsKey(
        rightClickedCallNodeInfo.threadsKey
      );

      thread = selectors.getThread(state);
      threadsKey = rightClickedCallNodeInfo.threadsKey;
      callNodeInfo = selectors.getCallNodeInfo(state);
      rightClickedCallNodePath = rightClickedCallNodeInfo.callNodePath;
      rightClickedCallNodeIndex = selectors.getRightClickedCallNodeIndex(state);
    }

    return {
      thread,
      threadsKey,
      callNodeInfo,
      rightClickedCallNodePath,
      rightClickedCallNodeIndex,
      implementation: getImplementationFilter(state),
      inverted: getInvertCallstack(state),
      selectedTab: getSelectedTab(state),
    };
  },
  mapDispatchToProps: {
    addTransformToStack,
    expandAllCallNodeDescendants,
    setContextMenuVisibility,
  },
  component: CallNodeContextMenu,
});
