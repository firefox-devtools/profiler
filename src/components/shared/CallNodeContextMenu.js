/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent, Fragment } from 'react';
import { ContextMenu, MenuItem } from 'react-contextmenu';
import explicitConnect from '../../utils/connect';
import { selectedThreadSelectors } from '../../reducers/profile-view';
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
} from '../../reducers/url-state';
import {
  convertToTransformType,
  assertExhaustiveCheck,
} from '../../utils/flow';

import type { TransformType } from '../../types/transforms';
import type { ImplementationFilter, TabSlug } from '../../types/actions';
import type {
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodePath,
} from '../../types/profile-derived';
import type { Thread, ThreadIndex } from '../../types/profile';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {|
  forceOpenForTests?: boolean,
|};

type StateProps = {|
  +thread: Thread,
  +threadIndex: ThreadIndex,
  +callNodeInfo: CallNodeInfo,
  +implementation: ImplementationFilter,
  +inverted: boolean,
  +selectedCallNodePath: CallNodePath,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
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
      selectedCallNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
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
      selectedCallNodeIndex,
      thread: { stringTable, funcTable },
      callNodeInfo: { callNodeTable },
    } = this.props;

    if (selectedCallNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

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

    if (selectedCallNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

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
      selectedCallNodePath,
      inverted,
      thread,
    } = this.props;
    const selectedFunc = selectedCallNodePath[selectedCallNodePath.length - 1];

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
          funcIndex: selectedFunc,
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
      selectedCallNodeIndex,
      callNodeInfo,
    } = this.props;
    if (selectedCallNodeIndex === null) {
      throw new Error(
        "The context menu assumes there is a selected call node and there wasn't one."
      );
    }

    expandAllCallNodeDescendants(
      threadIndex,
      selectedCallNodeIndex,
      callNodeInfo
    );
  }

  getNameForSelectedResource(): string | null {
    const {
      selectedCallNodePath,
      thread: { funcTable, stringTable, resourceTable, libs },
    } = this.props;

    const funcIndex = selectedCallNodePath[selectedCallNodePath.length - 1];
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
    const { selectedCallNodePath, thread, implementation } = this.props;
    const funcIndex = selectedCallNodePath[selectedCallNodePath.length - 1];
    if (funcIndex === undefined) {
      return false;
    }
    // Do the easy thing first, see if this function was called by itself.
    if (selectedCallNodePath[selectedCallNodePath.length - 2] === funcIndex) {
      return true;
    }

    // Do a full check of the stackTable for recursion.
    return funcHasRecursiveCall(thread, implementation, funcIndex);
  }

  componentWillReceiveProps(nextProps: Props) {
    if (nextProps.selectedCallNodeIndex === null && this.state.isShown) {
      // If the menu was visible while selectedCallNodeIndex was
      // changed to null, the onHide callback will not execute when
      // null is returned below. Call _menuHidden() here to be ensure
      // the visibility state is updated.
      this._hideMenu();
    }
  }

  renderContextMenuContents() {
    const {
      selectedCallNodeIndex,
      inverted,
      thread: { funcTable },
      callNodeInfo: { callNodeTable },
      selectedTab,
    } = this.props;

    if (selectedCallNodeIndex === null) {
      return <div />;
    }

    const funcIndex = callNodeTable.func[selectedCallNodeIndex];
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
    return (
      <ContextMenu
        id={'CallNodeContextMenu'}
        onShow={this._showMenu}
        onHide={this._hideMenu}
      >
        {this.state.isShown ? (
          this.renderContextMenuContents()
        ) : (
          // ContextMenu expects at least 1 child.
          <div />
        )}
      </ContextMenu>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: state => ({
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
    selectedTab: getSelectedTab(state),
  }),
  mapDispatchToProps: {
    addTransformToStack,
    expandAllCallNodeDescendants,
    setCallNodeContextMenuVisibility,
  },
  component: CallNodeContextMenu,
};
export default explicitConnect(options);
