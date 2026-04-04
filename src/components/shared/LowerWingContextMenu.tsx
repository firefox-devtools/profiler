/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import { PureComponent } from 'react';
import { MenuItem } from '@firefox-devtools/react-contextmenu';
import { Localized } from '@fluent/react';

import { ContextMenu } from './ContextMenu';
import explicitConnect from 'firefox-profiler/utils/connect';
import {
  funcHasDirectRecursiveCall,
  funcHasRecursiveCall,
} from 'firefox-profiler/profile-logic/transforms';
import { getFunctionName } from 'firefox-profiler/profile-logic/function-info';

import copy from 'copy-to-clipboard';
import {
  addTransformToStack,
  addCollapseResourceTransformToStack,
  setContextMenuVisibility,
} from 'firefox-profiler/actions/profile-view';
import { getImplementationFilter } from 'firefox-profiler/selectors/url-state';
import { getThreadSelectorsFromThreadsKey } from 'firefox-profiler/selectors/per-thread';
import { getShouldDisplaySearchfox } from 'firefox-profiler/selectors/profile';
import { getRightClickedCallNodeInfo } from 'firefox-profiler/selectors/right-clicked-call-node';
import { oneLine } from 'common-tags';

import {
  convertToTransformType,
  assertExhaustiveCheck,
} from 'firefox-profiler/utils/types';

import type {
  TransformType,
  ImplementationFilter,
  IndexIntoFuncTable,
  Thread,
  ThreadsKey,
  CallNodeTable,
  State,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './CallNodeContextMenu.css';

type StateProps = {
  readonly thread: Thread | null;
  readonly threadsKey: ThreadsKey | null;
  readonly rightClickedFuncIndex: IndexIntoFuncTable | null;
  readonly callNodeTable: CallNodeTable | null;
  readonly implementation: ImplementationFilter;
  readonly displaySearchfox: boolean;
};

type DispatchProps = {
  readonly addTransformToStack: typeof addTransformToStack;
  readonly addCollapseResourceTransformToStack: typeof addCollapseResourceTransformToStack;
  readonly setContextMenuVisibility: typeof setContextMenuVisibility;
};

type Props = ConnectedProps<{}, StateProps, DispatchProps>;

class LowerWingContextMenuImpl extends PureComponent<Props> {
  _hidingTimeout: NodeJS.Timeout | null = null;

  _onShow = () => {
    if (this._hidingTimeout) {
      clearTimeout(this._hidingTimeout);
    }
    this.props.setContextMenuVisibility(true);
  };

  _onHide = () => {
    this._hidingTimeout = setTimeout(() => {
      this._hidingTimeout = null;
      this.props.setContextMenuVisibility(false);
    });
  };

  _getRightClickedInfo(): null | {
    readonly thread: Thread;
    readonly threadsKey: ThreadsKey;
    readonly funcIndex: IndexIntoFuncTable;
    readonly callNodeTable: CallNodeTable;
  } {
    const { thread, threadsKey, rightClickedFuncIndex, callNodeTable } =
      this.props;
    if (
      thread !== null &&
      threadsKey !== null &&
      rightClickedFuncIndex !== null &&
      callNodeTable !== null
    ) {
      return {
        thread,
        threadsKey,
        funcIndex: rightClickedFuncIndex,
        callNodeTable,
      };
    }
    return null;
  }

  _getFunctionName(): string {
    const info = this._getRightClickedInfo();
    if (info === null) {
      throw new Error(
        "The context menu assumes there is a right-clicked function and there wasn't one."
      );
    }
    const {
      thread: { stringTable, funcTable },
      funcIndex,
    } = info;
    const isJS = funcTable.isJS[funcIndex];
    const functionCall = stringTable.getString(funcTable.name[funcIndex]);
    return isJS ? functionCall : getFunctionName(functionCall);
  }

  lookupFunctionOnSearchfox(): void {
    window.open(
      `https://searchfox.org/mozilla-central/search?q=${encodeURIComponent(
        this._getFunctionName()
      )}`,
      '_blank'
    );
  }

  copyFunctionName(): void {
    copy(this._getFunctionName());
  }

  getNameForSelectedResource(): string | null {
    const info = this._getRightClickedInfo();
    if (info === null) {
      throw new Error(
        "The context menu assumes there is a right-clicked function and there wasn't one."
      );
    }
    const {
      thread: { funcTable, stringTable, resourceTable, sources },
      funcIndex,
    } = info;
    const isJS = funcTable.isJS[funcIndex];
    if (isJS) {
      const sourceIndex = funcTable.source[funcIndex];
      if (sourceIndex === null) {
        return null;
      }
      return stringTable.getString(sources.filename[sourceIndex]);
    }
    const resourceIndex = funcTable.resource[funcIndex];
    if (resourceIndex === -1) {
      return null;
    }
    return stringTable.getString(resourceTable.name[resourceIndex]);
  }

  addTransformToStack(type: TransformType): void {
    const {
      addTransformToStack,
      addCollapseResourceTransformToStack,
      implementation,
    } = this.props;
    const info = this._getRightClickedInfo();
    if (info === null) {
      throw new Error(
        "The context menu assumes there is a right-clicked function and there wasn't one."
      );
    }
    const { threadsKey, thread, funcIndex } = info;

    switch (type) {
      case 'focus-function':
        addTransformToStack(threadsKey, {
          type: 'focus-function',
          funcIndex,
        });
        break;
      case 'focus-self':
        addTransformToStack(threadsKey, {
          type: 'focus-self',
          funcIndex,
          implementation,
        });
        break;
      case 'merge-function':
        addTransformToStack(threadsKey, {
          type: 'merge-function',
          funcIndex,
        });
        break;
      case 'drop-function':
        addTransformToStack(threadsKey, {
          type: 'drop-function',
          funcIndex,
        });
        break;
      case 'collapse-resource': {
        const resourceIndex = thread.funcTable.resource[funcIndex];
        addCollapseResourceTransformToStack(
          threadsKey,
          resourceIndex,
          implementation
        );
        break;
      }
      case 'collapse-direct-recursion':
        addTransformToStack(threadsKey, {
          type: 'collapse-direct-recursion',
          funcIndex,
          implementation,
        });
        break;
      case 'collapse-recursion':
        addTransformToStack(threadsKey, {
          type: 'collapse-recursion',
          funcIndex,
        });
        break;
      case 'collapse-function-subtree':
        addTransformToStack(threadsKey, {
          type: 'collapse-function-subtree',
          funcIndex,
        });
        break;
      case 'focus-subtree':
      case 'merge-call-node':
      case 'focus-category':
      case 'filter-samples':
        throw new Error(
          `The transform "${type}" is not supported in the lower wing context menu.`
        );
      default:
        assertExhaustiveCheck(type);
    }
  }

  _handleClick = (
    _event: React.ChangeEvent<HTMLElement>,
    data: { type: string }
  ): void => {
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
      default:
        throw new Error(`Unknown type ${type}`);
    }
  };

  renderTransformMenuItem(props: {
    readonly l10nId: string;
    readonly content: React.ReactNode;
    readonly onClick: (
      event: React.ChangeEvent<HTMLElement>,
      data: { type: string }
    ) => void;
    readonly transform: string;
    readonly shortcut: string;
    readonly icon: string;
    readonly title: string;
    readonly l10nVars?: Record<string, string>;
    readonly l10nElems?: Record<string, React.ReactElement>;
  }) {
    return (
      <MenuItem onClick={props.onClick} data={{ type: props.transform }}>
        <span
          className={`react-contextmenu-icon callNodeContextMenuIcon${props.icon}`}
        />
        <Localized
          id={props.l10nId}
          attrs={{ title: true }}
          vars={props.l10nVars}
          elems={props.l10nElems}
        >
          <div
            className="react-contextmenu-item-content"
            title={oneLine`${props.title}`}
          >
            {props.content}
          </div>
        </Localized>
        <kbd className="callNodeContextMenuShortcut">{props.shortcut}</kbd>
      </MenuItem>
    );
  }

  renderContextMenuContents() {
    const { displaySearchfox } = this.props;
    const info = this._getRightClickedInfo();

    if (info === null) {
      console.error(
        "The context menu assumes there is a right-clicked function and there wasn't one."
      );
      return <div />;
    }

    const { funcIndex, callNodeTable } = info;
    const nameForResource = this.getNameForSelectedResource();

    return (
      <>
        {this.renderTransformMenuItem({
          l10nId: 'CallNodeContextMenu--transform-merge-function',
          shortcut: 'm',
          icon: 'Merge',
          onClick: this._handleClick,
          transform: 'merge-function',
          title: '',
          content: 'Merge function',
        })}

        {this.renderTransformMenuItem({
          l10nId: 'CallNodeContextMenu--transform-focus-function',
          shortcut: 'f',
          icon: 'Focus',
          onClick: this._handleClick,
          transform: 'focus-function',
          title: '',
          content: 'Focus on function',
        })}

        {this.renderTransformMenuItem({
          l10nId: 'CallNodeContextMenu--transform-focus-self',
          shortcut: 'S',
          icon: 'FocusSelf',
          onClick: this._handleClick,
          transform: 'focus-self',
          title: '',
          content: 'Focus on self only',
        })}

        {this.renderTransformMenuItem({
          l10nId: 'CallNodeContextMenu--transform-collapse-function-subtree',
          shortcut: 'c',
          icon: 'Collapse',
          onClick: this._handleClick,
          transform: 'collapse-function-subtree',
          title: '',
          content: 'Collapse function',
        })}

        {nameForResource
          ? this.renderTransformMenuItem({
              l10nId: 'CallNodeContextMenu--transform-collapse-resource',
              l10nVars: { nameForResource },
              l10nElems: { strong: <strong /> },
              shortcut: 'C',
              icon: 'Collapse',
              onClick: this._handleClick,
              transform: 'collapse-resource',
              title: '',
              content: `Collapse ${nameForResource}`,
            })
          : null}

        {funcHasRecursiveCall(callNodeTable, funcIndex)
          ? this.renderTransformMenuItem({
              l10nId: 'CallNodeContextMenu--transform-collapse-recursion',
              shortcut: 'r',
              icon: 'Collapse',
              onClick: this._handleClick,
              transform: 'collapse-recursion',
              title: '',
              content: 'Collapse recursion',
            })
          : null}

        {funcHasDirectRecursiveCall(callNodeTable, funcIndex)
          ? this.renderTransformMenuItem({
              l10nId:
                'CallNodeContextMenu--transform-collapse-direct-recursion-only',
              shortcut: 'R',
              icon: 'Collapse',
              onClick: this._handleClick,
              transform: 'collapse-direct-recursion',
              title: '',
              content: 'Collapse direct recursion only',
            })
          : null}

        {this.renderTransformMenuItem({
          l10nId: 'CallNodeContextMenu--transform-drop-function',
          shortcut: 'd',
          icon: 'Drop',
          onClick: this._handleClick,
          transform: 'drop-function',
          title: '',
          content: 'Drop samples with this function',
        })}

        <div className="react-contextmenu-separator" />

        {displaySearchfox ? (
          <Localized id="CallNodeContextMenu--searchfox">
            <MenuItem onClick={this._handleClick} data={{ type: 'searchfox' }}>
              Look up the function name on Searchfox
            </MenuItem>
          </Localized>
        ) : null}
        <Localized id="CallNodeContextMenu--copy-function-name">
          <MenuItem
            onClick={this._handleClick}
            data={{ type: 'copy-function-name' }}
          >
            Copy function name
          </MenuItem>
        </Localized>
      </>
    );
  }

  override render() {
    if (this._getRightClickedInfo() === null) {
      return null;
    }

    return (
      <ContextMenu
        id="LowerWingContextMenu"
        className="callNodeContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        {this.renderContextMenuContents()}
      </ContextMenu>
    );
  }
}

export const LowerWingContextMenu = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state: State) => {
    const rightClickedCallNodeInfo = getRightClickedCallNodeInfo(state);

    let thread = null;
    let threadsKey = null;
    let rightClickedFuncIndex = null;
    let callNodeTable = null;

    if (
      rightClickedCallNodeInfo !== null &&
      rightClickedCallNodeInfo.area === 'LOWER_WING'
    ) {
      const selectors = getThreadSelectorsFromThreadsKey(
        rightClickedCallNodeInfo.threadsKey
      );
      thread = selectors.getFilteredThread(state);
      threadsKey = rightClickedCallNodeInfo.threadsKey;
      rightClickedFuncIndex =
        selectors.getLowerWingRightClickedFuncIndex(state);
      // Use the non-inverted call node table for recursion detection.
      callNodeTable = selectors.getCallNodeInfo(state).getCallNodeTable();
    }

    return {
      thread,
      threadsKey,
      rightClickedFuncIndex,
      callNodeTable,
      implementation: getImplementationFilter(state),
      displaySearchfox: getShouldDisplaySearchfox(state),
    };
  },
  mapDispatchToProps: {
    addTransformToStack,
    addCollapseResourceTransformToStack,
    setContextMenuVisibility,
  },
  component: LowerWingContextMenuImpl,
});
