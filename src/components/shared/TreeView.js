/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file uses extensive use of Object generic trait bounds, which is a false
// positive for this rule.
/* eslint-disable flowtype/no-weak-types */

import * as React from 'react';
import classNames from 'classnames';

import { VirtualList } from './VirtualList';

import { ContextMenuTrigger } from './ContextMenuTrigger';

import type { CssPixels } from 'firefox-profiler/types';

import './TreeView.css';

/**
 * This number is used to decide how many lines the selection moves when the
 * user presses PageUp or PageDown.
 * It's big enough to be useful, but small enough to always be less than one
 * window. Of course the correct number should depend on the height of the
 * viewport, but this is more complex, and an hardcoded number is good enough in
 * this case.
 */
const PAGE_KEYS_DELTA = 15;

// This is used for the result of RegExp.prototype.exec because Flow doesn't do it.
// See https://github.com/facebook/flow/issues/4099
type RegExpResult = null | ({ index: number, input: string } & string[]);
type NodeIndex = number;

export type Column<DisplayData: Object> = {|
  +propName: string,
  +title: string,
  +tooltip?: string,
  +component?: React.ComponentType<{|
    displayData: DisplayData,
  |}>,
|};

type TreeViewHeaderProps<DisplayData: Object> = {|
  +fixedColumns: Column<DisplayData>[],
  +mainColumn: Column<DisplayData>,
|};

const TreeViewHeader = <DisplayData: Object>({
  fixedColumns,
  mainColumn,
}: TreeViewHeaderProps<DisplayData>) => {
  if (fixedColumns.length === 0 && !mainColumn.title) {
    // If there is nothing to display in the header, do not render it.
    return null;
  }
  return (
    <div className="treeViewHeader">
      {fixedColumns.map(col => (
        <span
          className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName}`}
          key={col.propName}
          title={col.tooltip}
        >
          {col.title}
        </span>
      ))}
      <span
        className={`treeViewHeaderColumn treeViewMainColumn ${mainColumn.propName}`}
      >
        {mainColumn.title}
      </span>
    </div>
  );
};

function reactStringWithHighlightedSubstrings(
  string: string,
  regExp: RegExp | null,
  className: string
) {
  if (!regExp) {
    return string;
  }

  // Since the regexp is reused and likely global, let's make sure we reset it.
  regExp.lastIndex = 0;

  const highlighted = [];
  let lastOccurrence = 0;
  let result;
  while ((result = regExp.exec(string))) {
    const typedResult: RegExpResult = result;
    if (typedResult === null) {
      break;
    }
    highlighted.push(string.substring(lastOccurrence, typedResult.index));
    lastOccurrence = regExp.lastIndex;
    highlighted.push(
      <span key={typedResult.index} className={className}>
        {typedResult[0]}
      </span>
    );
  }
  highlighted.push(string.substring(lastOccurrence));
  return highlighted;
}

type TreeViewRowFixedColumnsProps<DisplayData: Object> = {|
  +displayData: DisplayData,
  +nodeId: NodeIndex,
  +columns: Column<DisplayData>[],
  +index: number,
  +isSelected: boolean,
  +isRightClicked: boolean,
  +onClick: (NodeIndex, SyntheticMouseEvent<>) => mixed,
  +highlightRegExp: RegExp | null,
  +rowHeightStyle: { height: CssPixels, lineHeight: string },
|};

class TreeViewRowFixedColumns<DisplayData: Object> extends React.PureComponent<
  TreeViewRowFixedColumnsProps<DisplayData>
> {
  _onClick = (event: SyntheticMouseEvent<>) => {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  };

  render() {
    const {
      displayData,
      columns,
      index,
      isSelected,
      isRightClicked,
      highlightRegExp,
      rowHeightStyle,
    } = this.props;
    return (
      <div
        className={classNames('treeViewRow', 'treeViewRowFixedColumns', {
          even: index % 2 === 0,
          odd: index % 2 !== 0,
          isSelected,
          isRightClicked,
        })}
        style={rowHeightStyle}
        onMouseDown={this._onClick}
      >
        {columns.map(col => {
          const RenderComponent = col.component;
          const text = displayData[col.propName] || '';

          return (
            <span
              className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
              key={col.propName}
              title={text}
            >
              {RenderComponent ? (
                <RenderComponent displayData={displayData} />
              ) : (
                reactStringWithHighlightedSubstrings(
                  text,
                  highlightRegExp,
                  'treeViewHighlighting'
                )
              )}
            </span>
          );
        })}
      </div>
    );
  }
}

type TreeViewRowScrolledColumnsProps<DisplayData: Object> = {|
  +displayData: DisplayData,
  +nodeId: NodeIndex,
  +depth: number,
  +mainColumn: Column<DisplayData>,
  +appendageColumn?: Column<DisplayData>,
  +index: number,
  +canBeExpanded: boolean,
  +isExpanded: boolean,
  +isSelected: boolean,
  +isRightClicked: boolean,
  +onToggle: (NodeIndex, boolean, boolean) => mixed,
  +onClick: (NodeIndex, SyntheticMouseEvent<>) => mixed,
  +highlightRegExp: RegExp | null,
  // React converts height into 'px' values, while lineHeight is valid in
  // non-'px' units.
  +rowHeightStyle: { height: CssPixels, lineHeight: string },
  +indentWidth: CssPixels,
|};

// This is a false-positive, as it's used as a generic trait bounds.
class TreeViewRowScrolledColumns<
  DisplayData: Object
> extends React.PureComponent<TreeViewRowScrolledColumnsProps<DisplayData>> {
  /**
   * In this mousedown handler, we use event delegation so we have to use
   * `target` instead of `currentTarget`.
   */
  _onMouseDown = (
    event: { target: Element } & SyntheticMouseEvent<Element>
  ) => {
    const { nodeId, onClick } = this.props;
    if (!event.target.classList.contains('treeRowToggleButton')) {
      onClick(nodeId, event);
    }
  };

  _onToggleClick = (
    event: { target: Element } & SyntheticMouseEvent<Element>
  ) => {
    const { nodeId, isExpanded, onToggle } = this.props;
    onToggle(nodeId, !isExpanded, event.altKey === true);
  };

  render() {
    const {
      displayData,
      depth,
      mainColumn,
      appendageColumn,
      index,
      canBeExpanded,
      isExpanded,
      isSelected,
      isRightClicked,
      highlightRegExp,
      rowHeightStyle,
      indentWidth,
      nodeId,
    } = this.props;
    const RenderComponent = mainColumn.component;

    // By default there's no 'aria-expanded' attribute.
    let ariaExpanded = null;

    // if a node can be expanded (has children), and is not expanded yet,
    // aria-expanded is false.
    if (canBeExpanded) {
      ariaExpanded = false;
    }

    // If a node is expanded, ariaExpanded is true.
    if (isExpanded) {
      ariaExpanded = true;
    }
    // Cleaning up self time display so we can use it in aria-label below.
    let selfDisplay = displayData.selfTimeUnit;
    if (selfDisplay === '—') {
      selfDisplay = '0ms';
    }

    return (
      <div
        className={classNames('treeViewRow', 'treeViewRowScrolledColumns', {
          even: index % 2 === 0,
          odd: index % 2 !== 0,
          isSelected,
          isRightClicked,
          dim: displayData.isFrameLabel,
        })}
        style={rowHeightStyle}
        onMouseDown={this._onMouseDown}
        // The following attributes are important for accessibility.
        aria-expanded={ariaExpanded}
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-label={displayData.ariaLabel}
        // The role and id attributes are used along with aria-activedescendant
        // (set on the parent), to manage the virtual focus of the tree items.
        // The "virtual" focus changes with the arrow keys.
        role="treeitem"
        id={`treeViewRow-${nodeId}`}
      >
        <span
          className="treeRowIndentSpacer"
          style={{ width: `${depth * indentWidth}px` }}
        />
        <span
          className={`treeRowToggleButton ${
            isExpanded ? 'expanded' : 'collapsed'
          } ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`}
          onClick={this._onToggleClick}
        />
        <span
          className={`treeViewRowColumn treeViewMainColumn ${mainColumn.propName}`}
        >
          {displayData.categoryColor && displayData.categoryName ? (
            <span
              className={`colored-square category-color-${displayData.categoryColor}`}
              title={displayData.categoryName}
            />
          ) : null}
          {RenderComponent ? (
            <RenderComponent displayData={displayData} />
          ) : (
            reactStringWithHighlightedSubstrings(
              displayData[mainColumn.propName],
              highlightRegExp,
              'treeViewHighlighting'
            )
          )}
        </span>
        {appendageColumn ? (
          <span
            className={`treeViewRowColumn treeViewAppendageColumn ${appendageColumn.propName}`}
          >
            {reactStringWithHighlightedSubstrings(
              displayData[appendageColumn.propName],
              highlightRegExp,
              'treeViewHighlighting'
            )}
          </span>
        ) : null}
      </div>
    );
  }
}

interface Tree<DisplayData: Object> {
  getDepth(NodeIndex): number;
  getRoots(): NodeIndex[];
  getDisplayData(NodeIndex): DisplayData;
  getParent(NodeIndex): NodeIndex;
  getChildren(NodeIndex): NodeIndex[];
  hasChildren(NodeIndex): boolean;
  getAllDescendants(NodeIndex): Set<NodeIndex>;
}

type TreeViewProps<DisplayData> = {|
  +fixedColumns: Column<DisplayData>[],
  +mainColumn: Column<DisplayData>,
  +tree: Tree<DisplayData>,
  +expandedNodeIds: Array<NodeIndex | null>,
  +selectedNodeId: NodeIndex | null,
  +rightClickedNodeId?: NodeIndex | null,
  +onExpandedNodesChange: (Array<NodeIndex | null>) => mixed,
  +highlightRegExp?: RegExp | null,
  +appendageColumn?: Column<DisplayData>,
  +disableOverscan?: boolean,
  +contextMenu?: React.Element<any>,
  +contextMenuId?: string,
  +maxNodeDepth: number,
  +onSelectionChange: NodeIndex => mixed,
  +onRightClickSelection?: NodeIndex => mixed,
  +onEnterKey?: NodeIndex => mixed,
  +rowHeight: CssPixels,
  +indentWidth: CssPixels,
  +onKeyDown?: (SyntheticKeyboardEvent<>, null | NodeIndex) => void,
|};

export class TreeView<DisplayData: Object> extends React.PureComponent<
  TreeViewProps<DisplayData>
> {
  _specialItems: [NodeIndex | void, NodeIndex | void];
  _visibleRows: NodeIndex[];
  _expandedNodes: Set<NodeIndex | null>;
  _list: VirtualList<NodeIndex> | null = null;
  _takeListRef = (list: VirtualList<NodeIndex> | null) => (this._list = list);

  constructor(props: TreeViewProps<DisplayData>) {
    super(props);

    this._updateSpecialItems(props);
    this._expandedNodes = new Set(props.expandedNodeIds);
    this._visibleRows = this._getAllVisibleRows(props);
  }

  // The tuple `_specialItems` always contains 2 elements: the first element is
  // the selected node id (if any), and the second element is the right clicked
  // id (if any).
  // This method will always change the tuple, so we take care to call it only
  // if one of these values changes.
  _updateSpecialItems(props: TreeViewProps<DisplayData>) {
    this._specialItems = [undefined, undefined];

    if (props.selectedNodeId !== null) {
      this._specialItems[0] = props.selectedNodeId;
    }

    if (
      props.rightClickedNodeId !== undefined &&
      props.rightClickedNodeId !== null
    ) {
      this._specialItems[1] = props.rightClickedNodeId;
    }
  }

  scrollSelectionIntoView() {
    const { selectedNodeId, tree } = this.props;
    if (this._list && selectedNodeId !== null) {
      const list = this._list; // this temp variable so that flow knows that it's non-null
      const rowIndex = this._visibleRows.indexOf(selectedNodeId);
      const depth = tree.getDepth(selectedNodeId);
      list.scrollItemIntoView(rowIndex, depth * 10);
    }
  }

  UNSAFE_componentWillReceiveProps(nextProps: TreeViewProps<DisplayData>) {
    const hasNewSelectedNode =
      nextProps.selectedNodeId !== this.props.selectedNodeId;
    const hasNewRightClickedNode =
      nextProps.rightClickedNodeId !== this.props.rightClickedNodeId;

    if (hasNewSelectedNode || hasNewRightClickedNode) {
      this._updateSpecialItems(nextProps);
    }

    if (
      nextProps.tree !== this.props.tree ||
      nextProps.expandedNodeIds !== this.props.expandedNodeIds
    ) {
      this._expandedNodes = new Set(nextProps.expandedNodeIds);
      this._visibleRows = this._getAllVisibleRows(nextProps);
    }
  }

  _renderRow = (nodeId: NodeIndex, index: number, columnIndex: number) => {
    const {
      tree,
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      rightClickedNodeId,
      highlightRegExp,
      rowHeight,
      indentWidth,
    } = this.props;
    const displayData = tree.getDisplayData(nodeId);
    // React converts height into 'px' values, while lineHeight is valid in
    // non-'px' units.
    const rowHeightStyle = { height: rowHeight, lineHeight: `${rowHeight}px` };

    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns
          displayData={displayData}
          columns={fixedColumns}
          nodeId={nodeId}
          index={index}
          isSelected={nodeId === selectedNodeId}
          isRightClicked={nodeId === rightClickedNodeId}
          onClick={this._onRowClicked}
          highlightRegExp={highlightRegExp || null}
          rowHeightStyle={rowHeightStyle}
        />
      );
    }

    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = canBeExpanded && !this._isCollapsed(nodeId);

    return (
      <TreeViewRowScrolledColumns
        rowHeightStyle={rowHeightStyle}
        displayData={displayData}
        mainColumn={mainColumn}
        appendageColumn={appendageColumn}
        depth={tree.getDepth(nodeId)}
        nodeId={nodeId}
        index={index}
        canBeExpanded={canBeExpanded}
        isExpanded={isExpanded}
        isSelected={nodeId === selectedNodeId}
        isRightClicked={nodeId === rightClickedNodeId}
        onToggle={this._toggle}
        onClick={this._onRowClicked}
        highlightRegExp={highlightRegExp || null}
        indentWidth={indentWidth}
      />
    );
  };

  _addVisibleRowsFromNode(
    props: TreeViewProps<DisplayData>,
    arr: NodeIndex[],
    nodeId: NodeIndex,
    depth: number
  ) {
    arr.push(nodeId);
    if (this._isCollapsed(nodeId)) {
      return;
    }
    const children = props.tree.getChildren(nodeId);
    for (let i = 0; i < children.length; i++) {
      this._addVisibleRowsFromNode(props, arr, children[i], depth + 1);
    }
  }

  _getAllVisibleRows(props: TreeViewProps<DisplayData>): NodeIndex[] {
    const roots = props.tree.getRoots();
    const allRows = [];
    for (let i = 0; i < roots.length; i++) {
      this._addVisibleRowsFromNode(props, allRows, roots[i], 0);
    }
    return allRows;
  }

  _isCollapsed(nodeId: NodeIndex): boolean {
    return !this._expandedNodes.has(nodeId);
  }

  _toggle = (
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId),
    toggleAll: boolean = false
  ) => {
    const newSet = new Set(this._expandedNodes);
    if (newExpanded) {
      newSet.add(nodeId);
      if (toggleAll) {
        for (const descendant of this.props.tree.getAllDescendants(nodeId)) {
          newSet.add(descendant);
        }
      }
    } else {
      newSet.delete(nodeId);
    }
    this.props.onExpandedNodesChange(Array.from(newSet.values()));
  };

  _toggleAll(
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId)
  ) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId: NodeIndex) {
    this.props.onSelectionChange(nodeId);
  }

  _rightClickSelect(nodeId: NodeIndex) {
    if (this.props.onRightClickSelection) {
      this.props.onRightClickSelection(nodeId);
    } else {
      this._select(nodeId);
    }
  }

  _onRowClicked = (nodeId: NodeIndex, event: SyntheticMouseEvent<>) => {
    if (event.button === 0) {
      this._select(nodeId);
    } else if (event.button === 2) {
      this._rightClickSelect(nodeId);
    }

    if (event.detail === 2 && event.button === 0) {
      // double click
      this._toggle(nodeId);
    }
  };

  _onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    const { tree, selectedNodeId, mainColumn } = this.props;
    if (selectedNodeId) {
      const displayData = tree.getDisplayData(selectedNodeId);
      const clipboardData: DataTransfer = (event: any).clipboardData;
      clipboardData.setData('text/plain', displayData[mainColumn.propName]);
    }
  };

  _onKeyDown = (event: SyntheticKeyboardEvent<>) => {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event, this.props.selectedNodeId);
    }

    const hasModifier = event.ctrlKey || event.altKey;
    const isNavigationKey =
      event.key.startsWith('Arrow') ||
      event.key.startsWith('Page') ||
      event.key === 'Home' ||
      event.key === 'End';
    const isAsteriskKey = event.key === '*';
    const isEnterKey = event.key === 'Enter';

    if (hasModifier || (!isNavigationKey && !isAsteriskKey && !isEnterKey)) {
      // No key events that we care about were found, so don't try and handle them.
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.props.selectedNodeId;
    const visibleRows = this._getAllVisibleRows(this.props);
    const selectedRowIndex = visibleRows.findIndex(
      nodeId => nodeId === selected
    );

    if (selected === null || selectedRowIndex === -1) {
      // the first condition is redundant, but it makes flow happy
      this._select(visibleRows[0]);
      return;
    }

    if (isNavigationKey) {
      switch (event.key) {
        case 'ArrowUp': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the Home gesture
            this._select(visibleRows[0]);
            break;
          }

          if (selectedRowIndex > 0) {
            this._select(visibleRows[selectedRowIndex - 1]);
          }
          break;
        }
        case 'ArrowDown': {
          if (event.metaKey) {
            // On MacOS this is a common shortcut for the End gesture
            this._select(visibleRows[visibleRows.length - 1]);
            break;
          }

          if (selectedRowIndex < visibleRows.length - 1) {
            this._select(visibleRows[selectedRowIndex + 1]);
          }
          break;
        }
        case 'PageUp': {
          if (selectedRowIndex > 0) {
            const nextRow = Math.max(0, selectedRowIndex - PAGE_KEYS_DELTA);
            this._select(visibleRows[nextRow]);
          }
          break;
        }
        case 'PageDown': {
          if (selectedRowIndex < visibleRows.length - 1) {
            const nextRow = Math.min(
              visibleRows.length - 1,
              selectedRowIndex + PAGE_KEYS_DELTA
            );
            this._select(visibleRows[nextRow]);
          }
          break;
        }
        case 'Home': {
          this._select(visibleRows[0]);
          break;
        }
        case 'End': {
          this._select(visibleRows[visibleRows.length - 1]);
          break;
        }
        case 'ArrowLeft': {
          const isCollapsed = this._isCollapsed(selected);
          if (!isCollapsed) {
            this._toggle(selected);
          } else {
            const parent = this.props.tree.getParent(selected);
            if (parent !== -1) {
              this._select(parent);
            }
          }
          break;
        }
        case 'ArrowRight': {
          const isCollapsed = this._isCollapsed(selected);
          if (isCollapsed) {
            this._toggle(selected);
          } else {
            // Do KEY_DOWN only if the next element is a child
            if (this.props.tree.hasChildren(selected)) {
              this._select(this.props.tree.getChildren(selected)[0]);
            }
          }
          break;
        }
        default:
          throw new Error('Unhandled navigation key.');
      }
    }

    if (isAsteriskKey) {
      this._toggleAll(selected);
    }

    if (isEnterKey) {
      const { onEnterKey, selectedNodeId } = this.props;
      if (onEnterKey && selectedNodeId !== null) {
        onEnterKey(selectedNodeId);
      }
    }
  };

  focus() {
    if (this._list) {
      this._list.focus();
    }
  }

  render() {
    const {
      fixedColumns,
      mainColumn,
      disableOverscan,
      contextMenu,
      contextMenuId,
      maxNodeDepth,
      rowHeight,
      selectedNodeId,
    } = this.props;
    return (
      <div className="treeView">
        <TreeViewHeader fixedColumns={fixedColumns} mainColumn={mainColumn} />
        <ContextMenuTrigger
          id={contextMenuId}
          attributes={{ className: 'treeViewContextMenu' }}
        >
          <VirtualList
            className="treeViewBody"
            ariaRole="tree"
            ariaLabel="Call tree"
            // This attribute exposes the current active child element,
            // while keeping focus on the parent (call tree).
            ariaActiveDescendant={
              selectedNodeId !== null ? `treeViewRow-${selectedNodeId}` : null
            }
            items={this._visibleRows}
            renderItem={this._renderRow}
            itemHeight={rowHeight}
            columnCount={2}
            focusable={true}
            onKeyDown={this._onKeyDown}
            specialItems={this._specialItems}
            disableOverscan={!!disableOverscan}
            onCopy={this._onCopy}
            // If there is a deep call node depth, expand the width, or else keep it
            // at 3000 wide.
            containerWidth={Math.max(3000, maxNodeDepth * 10 + 2000)}
            ref={this._takeListRef}
          />
        </ContextMenuTrigger>
        {contextMenu}
      </div>
    );
  }
}
