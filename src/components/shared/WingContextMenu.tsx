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
import {
  getProfileViewOptions,
  getShouldDisplaySearchfox,
} from 'firefox-profiler/selectors/profile';
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

// Context provided to data-table menu items so they can compute visibility,
// label, and l10n vars from the current right-clicked function.
type MenuItemContext = {
  readonly funcIndex: IndexIntoFuncTable;
  readonly callNodeTables: ReadonlyArray<CallNodeTable>;
  readonly nameForResource: string | null;
};

// A descriptor for a transform menu item. The data table below drives the
// rendering of the menu, instead of repeating identical JSX three times.
type TransformMenuItem = {
  readonly transform: TransformType;
  readonly shortcut: string;
  readonly icon: string;
  readonly l10nId: string;
  readonly content: (ctx: MenuItemContext) => string;
  readonly visible?: (ctx: MenuItemContext) => boolean;
  readonly l10nVars?: (ctx: MenuItemContext) => Record<string, string>;
  readonly l10nElems?: Record<string, React.ReactElement>;
};

const MENU_ITEMS: ReadonlyArray<TransformMenuItem> = [
  {
    transform: 'merge-function',
    shortcut: 'm',
    icon: 'Merge',
    l10nId: 'CallNodeContextMenu--transform-merge-function',
    content: () => 'Merge function',
  },
  {
    transform: 'focus-function',
    shortcut: 'f',
    icon: 'Focus',
    l10nId: 'CallNodeContextMenu--transform-focus-function',
    content: () => 'Focus on function',
  },
  {
    transform: 'focus-self',
    shortcut: 'S',
    icon: 'FocusSelf',
    l10nId: 'CallNodeContextMenu--transform-focus-self',
    content: () => 'Focus on self only',
  },
  {
    transform: 'collapse-function-subtree',
    shortcut: 'c',
    icon: 'Collapse',
    l10nId: 'CallNodeContextMenu--transform-collapse-function-subtree',
    content: () => 'Collapse function',
  },
  {
    transform: 'collapse-resource',
    shortcut: 'C',
    icon: 'Collapse',
    l10nId: 'CallNodeContextMenu--transform-collapse-resource',
    content: ({ nameForResource }) => `Collapse ${nameForResource}`,
    visible: ({ nameForResource }) => nameForResource !== null,
    l10nVars: ({ nameForResource }) => ({
      nameForResource: nameForResource ?? '',
    }),
    l10nElems: { strong: <strong /> },
  },
  {
    transform: 'collapse-recursion',
    shortcut: 'r',
    icon: 'Collapse',
    l10nId: 'CallNodeContextMenu--transform-collapse-recursion',
    content: () => 'Collapse recursion',
    visible: ({ funcIndex, callNodeTables }) =>
      callNodeTables.some((t) => funcHasRecursiveCall(t, funcIndex)),
  },
  {
    transform: 'collapse-direct-recursion',
    shortcut: 'R',
    icon: 'Collapse',
    l10nId: 'CallNodeContextMenu--transform-collapse-direct-recursion-only',
    content: () => 'Collapse direct recursion only',
    visible: ({ funcIndex, callNodeTables }) =>
      callNodeTables.some((t) => funcHasDirectRecursiveCall(t, funcIndex)),
  },
  {
    transform: 'drop-function',
    shortcut: 'd',
    icon: 'Drop',
    l10nId: 'CallNodeContextMenu--transform-drop-function',
    content: () => 'Drop samples with this function',
  },
];

type StateProps = {
  readonly thread: Thread | null;
  readonly threadsKey: ThreadsKey | null;
  readonly funcIndex: IndexIntoFuncTable | null;
  // Call node tables in which to check for recursion. Multiple tables are
  // useful for the self wing menu, where the focusSelf-filtered table may
  // reveal recursion that the regular table hides.
  readonly callNodeTables: ReadonlyArray<CallNodeTable>;
  readonly implementation: ImplementationFilter;
  readonly displaySearchfox: boolean;
};

type DispatchProps = {
  readonly addTransformToStack: typeof addTransformToStack;
  readonly addCollapseResourceTransformToStack: typeof addCollapseResourceTransformToStack;
  readonly setContextMenuVisibility: typeof setContextMenuVisibility;
};

// The DOM id is baked in by each connected variant below; the impl receives
// it as a regular prop.
type Props = ConnectedProps<{}, StateProps, DispatchProps> & {
  readonly id: string;
};

class WingContextMenuImpl extends PureComponent<Props> {
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
  } {
    const { thread, threadsKey, funcIndex } = this.props;
    if (thread !== null && threadsKey !== null && funcIndex !== null) {
      return { thread, threadsKey, funcIndex };
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
          `The transform "${type}" is not supported in the wing context menu.`
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

  renderTransformMenuItem(item: TransformMenuItem, ctx: MenuItemContext) {
    return (
      <MenuItem
        key={item.transform}
        onClick={this._handleClick}
        data={{ type: item.transform }}
      >
        <span
          className={`react-contextmenu-icon callNodeContextMenuIcon${item.icon}`}
        />
        <Localized
          id={item.l10nId}
          attrs={{ title: true }}
          vars={item.l10nVars ? item.l10nVars(ctx) : undefined}
          elems={item.l10nElems}
        >
          <div className="react-contextmenu-item-content" title={oneLine``}>
            {item.content(ctx)}
          </div>
        </Localized>
        <kbd className="callNodeContextMenuShortcut">{item.shortcut}</kbd>
      </MenuItem>
    );
  }

  renderContextMenuContents() {
    const { displaySearchfox, callNodeTables } = this.props;
    const info = this._getRightClickedInfo();

    if (info === null) {
      console.error(
        "The context menu assumes there is a right-clicked function and there wasn't one."
      );
      return <div />;
    }

    const ctx: MenuItemContext = {
      funcIndex: info.funcIndex,
      callNodeTables,
      nameForResource: this.getNameForSelectedResource(),
    };

    const renderedItems = MENU_ITEMS.filter(
      (item) => !item.visible || item.visible(ctx)
    ).map((item) => this.renderTransformMenuItem(item, ctx));

    return (
      <>
        {renderedItems}

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
        id={this.props.id}
        className="callNodeContextMenu"
        onShow={this._onShow}
        onHide={this._onHide}
      >
        {this.renderContextMenuContents()}
      </ContextMenu>
    );
  }
}

const dispatchToProps: DispatchProps = {
  addTransformToStack,
  addCollapseResourceTransformToStack,
  setContextMenuVisibility,
};

// Connected variant used by the function list and self wing: the right-clicked
// function comes from the rightClickedFunction profile-view state. Recursion
// detection considers both the regular call node table and the self wing's
// call node table (where the focusSelf filter may surface recursion that the
// regular table hides).
export const FunctionListContextMenu = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state: State) => {
    const rightClickedFunction =
      getProfileViewOptions(state).rightClickedFunction;

    if (rightClickedFunction === null) {
      return {
        thread: null,
        threadsKey: null,
        funcIndex: null,
        callNodeTables: [],
        implementation: getImplementationFilter(state),
        displaySearchfox: getShouldDisplaySearchfox(state),
      };
    }

    const selectors = getThreadSelectorsFromThreadsKey(
      rightClickedFunction.threadsKey
    );
    const callNodeTables: CallNodeTable[] = [
      selectors.getCallNodeInfo(state).getCallNodeTable(),
      selectors.getSelfWingCallNodeInfo(state).getCallNodeTable(),
    ];

    return {
      thread: selectors.getFilteredThread(state),
      threadsKey: rightClickedFunction.threadsKey,
      funcIndex: rightClickedFunction.functionIndex,
      callNodeTables,
      implementation: getImplementationFilter(state),
      displaySearchfox: getShouldDisplaySearchfox(state),
    };
  },
  mapDispatchToProps: dispatchToProps,
  component: (props) => (
    <WingContextMenuImpl {...props} id="FunctionListContextMenu" />
  ),
});

// Connected variant used by the lower wing: the right-clicked function comes
// from a right-clicked call node in the LOWER_WING area. Only the regular
// call node table is consulted for recursion.
export const LowerWingContextMenu = explicitConnect<
  {},
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state: State) => {
    const rightClickedCallNodeInfo = getRightClickedCallNodeInfo(state);

    if (
      rightClickedCallNodeInfo === null ||
      rightClickedCallNodeInfo.area !== 'LOWER_WING'
    ) {
      return {
        thread: null,
        threadsKey: null,
        funcIndex: null,
        callNodeTables: [],
        implementation: getImplementationFilter(state),
        displaySearchfox: getShouldDisplaySearchfox(state),
      };
    }

    const selectors = getThreadSelectorsFromThreadsKey(
      rightClickedCallNodeInfo.threadsKey
    );
    const callNodeTables: CallNodeTable[] = [
      selectors.getCallNodeInfo(state).getCallNodeTable(),
    ];

    return {
      thread: selectors.getFilteredThread(state),
      threadsKey: rightClickedCallNodeInfo.threadsKey,
      funcIndex: selectors.getLowerWingRightClickedFuncIndex(state),
      callNodeTables,
      implementation: getImplementationFilter(state),
      displaySearchfox: getShouldDisplaySearchfox(state),
    };
  },
  mapDispatchToProps: dispatchToProps,
  component: (props) => (
    <WingContextMenuImpl {...props} id="LowerWingContextMenu" />
  ),
});
