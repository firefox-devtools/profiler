/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, Fragment } from 'react';
import { MenuItem } from 'react-contextmenu';
import ContextMenu from '../shared/ContextMenu';
import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { funcHasRecursiveCall } from '../../profile-logic/transforms';
import { getFunctionName } from '../../profile-logic/function-info';
import copy from 'copy-to-clipboard';
import {
  addTransformToStack,
  expandAllCallNodeDescendants,
  setCallNodeContextMenuVisibility,
} from '../../actions/profile-view';
import {
  getSelectedTab,
  getSelectedThreadIndex,
  getImplementationFilter,
  getInvertCallstack,
} from '../../selectors/url-state';
import {
  convertToTransformType,
  assertExhaustiveCheck,
} from '../../utils/flow';

import type { TransformType } from '../../types/transforms';
import type { ImplementationFilter } from '../../types/actions';
import type { TabSlug } from '../../app-logic/tabs-handling';
import type {
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodePath,
} from '../../types/profile-derived';
import type { Thread, ThreadIndex } from '../../types/profile';
import type { ConnectedProps } from '../../utils/connect';

type OwnProps = {|
  forceOpenForTests?: boolean,
|};

type StateProps = {|
  +thread: Thread,
  +threadIndex: ThreadIndex,
  +callNodeInfo: CallNodeInfo,
  +implementation: ImplementationFilter,
  +inverted: boolean,
  +callNodePath: CallNodePath | null,
  +callNodeIndex: IndexIntoCallNodeTable | null,
  +selectedTab: TabSlug,
|};

type DispatchProps = {|
  +addTransformToStack: typeof addTransformToStack,
  +expandAllCallNodeDescendants: typeof expandAllCallNodeDescendants,
  +setCallNodeContextMenuVisibility: typeof setCallNodeContextMenuVisibility,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

type State = {|
  isShown: boolean,
|};

require('./CallNodeContextMenu.css');

class CallNodeContextMenu extends PureComponent<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      isShown: Boolean(this.props.forceOpenForTests),
    };
  }

  _showMenu = () => {
    this.props.setCallNodeContextMenuVisibility(true);
    this.setState({ isShown: true });
  };

  _hideMenu = () => {
    this.props.setCallNodeContextMenuVisibility(false);
    this.setState({ isShown: false });
  };

  _getFunctionName(): string {
    const {
      callNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (callNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

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
    const {
      callNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (callNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const funcIndex = callNodeTable.func[callNodeIndex];
    const stringIndex = funcTable.fileName[funcIndex];
    if (stringIndex !== null) {
      const fileName = stringTable.getString(stringIndex);
      copy(fileName);
    }
  }

  copyStack(): void {
    const {
      callNodePath,
      thread: { stringTable, funcTable },
    } = this.props;

    if (callNodePath === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const stack = callNodePath
      .map(funcIndex => {
        const stringIndex = funcTable.name[funcIndex];
        return stringTable.getString(stringIndex);
      })
      .reverse()
      .join('\n');

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
    const {
      addTransformToStack,
      threadIndex,
      implementation,
      callNodePath,
      inverted,
      thread,
    } = this.props;

    if (callNodePath === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const selectedFunc = callNodePath[callNodePath.length - 1];

    switch (type) {
      case 'focus-subtree':
        addTransformToStack(threadIndex, {
          type: 'focus-subtree',
          callNodePath: callNodePath,
          implementation,
          inverted,
        });
        break;
      case 'focus-function':
        addTransformToStack(threadIndex, {
          type: 'focus-function',
          funcIndex: selectedFunc,
        });
        break;
      case 'merge-call-node':
        addTransformToStack(threadIndex, {
          type: 'merge-call-node',
          callNodePath: callNodePath,
          implementation,
        });
        break;
      case 'merge-function':
        addTransformToStack(threadIndex, {
          type: 'merge-function',
          funcIndex: selectedFunc,
        });
        break;
      case 'drop-function':
        addTransformToStack(threadIndex, {
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
        addTransformToStack(threadIndex, {
          type: 'collapse-resource',
          resourceIndex,
          collapsedFuncIndex,
          implementation,
        });
        break;
      }
      case 'collapse-direct-recursion': {
        addTransformToStack(threadIndex, {
          type: 'collapse-direct-recursion',
          funcIndex: selectedFunc,
          implementation,
        });
        break;
      }
      case 'collapse-function-subtree': {
        addTransformToStack(threadIndex, {
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
    const {
      expandAllCallNodeDescendants,
      threadIndex,
      callNodeIndex,
      callNodeInfo,
    } = this.props;
    if (callNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    expandAllCallNodeDescendants(threadIndex, callNodeIndex, callNodeInfo);
  }

  getNameForSelectedResource(): string | null {
    const {
      callNodePath,
      thread: { funcTable, stringTable, resourceTable, libs },
    } = this.props;

    if (callNodePath === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

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
    const { callNodePath, thread, implementation } = this.props;

    if (callNodePath === null) {
      console.error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
      return false;
    }

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

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.callNodeIndex === null && this.state.isShown) {
      // If the menu was visible while callNodeIndex was
      // changed to null, the onHide callback will not execute when
      // null is returned below. Call _menuHidden() here to be ensure
      // the visibility state is updated.
      this._hideMenu();
    }
  }

  renderContextMenuContents() {
    const {
      callNodeIndex,
      inverted,
      thread: { funcTable },
      callNodeInfo: { callNodeTable },
      selectedTab,
    } = this.props;

    if (callNodeIndex === null) {
      console.error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
      return <div />;
    }

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
          {'Collapse function’s subtree across the entire tree'}
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
    const { callNodeIndex } = this.props;

    if (callNodeIndex === null) {
      return null;
    }

    return (
      <ContextMenu
        id="CallNodeContextMenu"
        onShow={this._showMenu}
        onHide={this._hideMenu}
      >
        {this.state.isShown ? this.renderContextMenuContents() : null}
      </ContextMenu>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    thread: selectedThreadSelectors.getFilteredThread(state),
    threadIndex: getSelectedThreadIndex(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    implementation: getImplementationFilter(state),
    inverted: getInvertCallstack(state),
    callNodePath: selectedThreadSelectors.getRightClickedCallNodePath(state),
    callNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(state),
    selectedTab: getSelectedTab(state),
  }),
  mapDispatchToProps: {
    addTransformToStack,
    expandAllCallNodeDescendants,
    setCallNodeContextMenuVisibility,
  },
  component: CallNodeContextMenu,
});
