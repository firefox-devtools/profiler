/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// This file uses extensive use of Object generic trait bounds, which is a false
// positive for this rule.
/* eslint-disable flowtype/no-weak-types */

import * as React from 'react';
import classNames from 'classnames';
import memoize from 'memoize-immutable';
import { Localized } from '@fluent/react';

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

/**
 * A component that accepts falsy values as the `id` prop for `Localized`.
 * `Localized` throws a warning if the `id` field is empty or null. This is made
 * to silence those warnings by directy rendering the children for that case instead.
 */
function PermissiveLocalized(props: React.ElementConfig<typeof Localized>) {
  const { children, id } = props;
  return id ? <Localized {...props}>{children}</Localized> : children;
}

// This is used for the result of RegExp.prototype.exec because Flow doesn't do it.
// See https://github.com/facebook/flow/issues/4099
type RegExpResult = null | ({ index: number, input: string } & string[]);
type NodeIndex = number;

export type Column<DisplayData: Object> = {|
  +propName: string,
  +titleL10nId: string,
  +component?: React.ComponentType<{|
    displayData: DisplayData,
  |}>,
|};

type TreeViewHeaderProps<DisplayData: Object> = {|
  +fixedColumns: Column<DisplayData>[],
  +mainColumn: Column<DisplayData>,
  +onSort: (number) => void,
  +columnSortDirections?: Array<boolean | null>,
|};

// columns start at 1
export class ColumnSortState {
  sortedColumns: number[];

  // -column: sort descending, +column: sort ascending, start by sorting last column
  constructor(sortedColumns: number[]) {
    this.sortedColumns = sortedColumns;
  }

  _sortColumn(column: number) {
    const sortedColumns = this.sortedColumns.filter(
      (c) => c !== column && c !== -column
    );
    sortedColumns.push(column);
    return new ColumnSortState(sortedColumns);
  }

  push(column: number) {
    return this._sortColumn(-this._sortState(column));
  }

  _sortState(column: number) {
    return this.sortedColumns
      .filter((c) => c === column || c === -column)
      .concat(-column)[0];
  }

  getSortStateArr(sortableColumns: Set<number>): Array<boolean | null> {
    const arr = new Array(Math.max(...sortableColumns) + 1).fill(null);
    for (const column of sortableColumns) {
      arr[column] = this._sortState(column) < 0;
    }
    return arr;
  }
}

class TreeViewHeader<DisplayData: Object> extends React.PureComponent<
  TreeViewHeaderProps<DisplayData>
> {
  _onSort = (e: Event) => {
    const { onSort } = this.props;
    onSort(Number(e.target.getAttribute('data-column')));
  };

  render() {
    const { fixedColumns, mainColumn, columnSortDirections } = this.props;
    if (fixedColumns.length === 0 && !mainColumn.titleL10nId) {
      // If there is nothing to display in the header, do not render it.
      return null;
    }
    return (
      <div className="treeViewHeader">
        {fixedColumns.map((col, i) => {
          let sortClass = '';
          if (columnSortDirections) {
            if (columnSortDirections[i + 1] === true) {
              sortClass = 'sortAscending';
            } else if (columnSortDirections[i + 1] === false) {
              sortClass = 'sortDescending';
            }
          }
          return (
            <PermissiveLocalized
              id={col.titleL10nId}
              attrs={{ title: true }}
              key={col.propName}
            >
              <span
                className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName} ${sortClass}`}
                data-column={i}
                onClick={this._onSort}
              ></span>
            </PermissiveLocalized>
          );
        })}
        <PermissiveLocalized
          id={mainColumn.titleL10nId}
          attrs={{ title: true }}
        >
          <span
            className={`treeViewHeaderColumn treeViewMainColumn ${mainColumn.propName}`}
          ></span>
        </PermissiveLocalized>
      </div>
    );
  }
}

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
        {columns.map((col) => {
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
        {
          /* The category square is out of the treeview column element because we
            reduce the opacity for that element in some cases (with the "dim"
            class).
          */
          displayData.categoryColor && displayData.categoryName ? (
            <span
              className={`colored-square category-color-${displayData.categoryColor}`}
              title={displayData.categoryName}
            />
          ) : null
        }
        <span
          className={classNames(
            'treeViewRowColumn',
            'treeViewMainColumn',
            mainColumn.propName,
            {
              dim: displayData.isFrameLabel,
            }
          )}
        >
          {displayData.badge ? (
            <Localized
              id={displayData.badge.localizationId}
              vars={displayData.badge.vars}
              attrs={{ title: true }}
            >
              <span
                className={`treeBadge ${displayData.badge.name}`}
                title={displayData.badge.titleFallback}
              >
                {displayData.badge.contentFallback}
              </span>
            </Localized>
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
  +onSelectionChange: (NodeIndex) => mixed,
  +onRightClickSelection?: (NodeIndex) => mixed,
  +onEnterKey?: (NodeIndex) => mixed,
  +onDoubleClick?: (NodeIndex) => mixed,
  +rowHeight: CssPixels,
  +indentWidth: CssPixels,
  +onKeyDown?: (SyntheticKeyboardEvent<>) => void,
  // number: column number, -1: first larger, 0: same, 1: first smaller
  +compareColumn?: (DisplayData, DisplayData, number) => number,
  +initialSortedColumns?: ColumnSortState,
  +onSort?: (ColumnSortState) => void,
  +sortableColumns?: Set<number>,
|};

type TreeViewState = {|
  sortedColumns: ColumnSortState,
|};

export class TreeView<DisplayData: Object> extends React.PureComponent<
  TreeViewProps<DisplayData>,
  TreeViewState
> {
  _list: VirtualList<NodeIndex> | null = null;
  _takeListRef = (list: VirtualList<NodeIndex> | null) => (this._list = list);
  state = { sortedColumns: new ColumnSortState([]) };

  constructor(props: TreeViewProps<DisplayData>) {
    super(props);
    if (props.initialSortedColumns) {
      this.state.sortedColumns = props.initialSortedColumns;
    }
  }

  // The tuple `specialItems` always contains 2 elements: the first element is
  // the selected node id (if any), and the second element is the right clicked
  // id (if any).
  _computeSpecialItemsMemoized = memoize(
    (
      selectedNodeId: NodeIndex | null,
      rightClickedNodeId: ?NodeIndex
    ): [NodeIndex | void, NodeIndex | void] => [
      selectedNodeId ?? undefined,
      rightClickedNodeId ?? undefined,
    ],
    { limit: 1 }
  );

  _computeExpandedNodesMemoized = memoize(
    (expandedNodeIds: Array<NodeIndex | null>) =>
      new Set<NodeIndex | null>(expandedNodeIds),
    { limit: 1 }
  );

  _computeAllVisibleRowsMemoized = memoize(
    (
      tree: Tree<DisplayData>,
      expandedNodes: Set<NodeIndex | null>,
      sortedColumns: ColumnSortState,
      compareColumn: ?(DisplayData, DisplayData, number) => number
    ) => {
      function sortNodes(nodeIds: Array<NodeIndex>): Array<NodeIndex> {
        if (!compareColumn) {
          return nodeIds;
        }
        let sortedNodeIds = nodeIds;
        for (let i = 0; i < sortedColumns.sortedColumns.length; i++) {
          const column = sortedColumns.sortedColumns[i];
          const absColumn = Math.abs(column);
          const sign = column < 0 ? -1 : 1;
          sortedNodeIds = sortedNodeIds.sort((a, b) => {
            return (
              sign *
              ((compareColumn: any): (
                DisplayData,
                DisplayData,
                number
              ) => number)(
                tree.getDisplayData(a),
                tree.getDisplayData(b),
                absColumn
              )
            );
          });
        }
        return sortedNodeIds;
      }

      function _addVisibleRowsFromNode(tree, expandedNodes, arr, nodeId) {
        arr.push(nodeId);
        if (!expandedNodes.has(nodeId)) {
          return;
        }
        const children = sortNodes(tree.getChildren(nodeId));
        for (let i = 0; i < children.length; i++) {
          _addVisibleRowsFromNode(tree, expandedNodes, arr, children[i]);
        }
      }

      const roots = sortNodes(tree.getRoots());
      const allRows = [];
      for (let i = 0; i < roots.length; i++) {
        _addVisibleRowsFromNode(tree, expandedNodes, allRows, roots[i]);
      }
      return allRows;
    },
    { limit: 1 }
  );

  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  scrollSelectionIntoView() {
    const { selectedNodeId, tree } = this.props;
    if (this._list && selectedNodeId !== null) {
      const list = this._list; // this temp variable so that flow knows that it's non-null
      const rowIndex = this._getAllVisibleRows().indexOf(selectedNodeId);
      const depth = tree.getDepth(selectedNodeId);
      list.scrollItemIntoView(rowIndex, depth * 10);
    }
  }

  _renderRow = (nodeId: NodeIndex, index: number, columnIndex: number) => {
    const {
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      rightClickedNodeId,
      highlightRegExp,
      rowHeight,
      indentWidth,
    } = this.props;
    const { tree } = this.props;
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

  _getExpandedNodes(): Set<NodeIndex | null> {
    return this._computeExpandedNodesMemoized(this.props.expandedNodeIds);
  }

  _getAllVisibleRows(): NodeIndex[] {
    const { tree, compareColumn } = this.props;
    return this._computeAllVisibleRowsMemoized(
      tree,
      this._getExpandedNodes(),
      this.state.sortedColumns,
      compareColumn
    );
  }

  _getSpecialItems(): [NodeIndex | void, NodeIndex | void] {
    const { selectedNodeId, rightClickedNodeId } = this.props;
    return this._computeSpecialItemsMemoized(
      selectedNodeId,
      rightClickedNodeId
    );
  }

  _isCollapsed(nodeId: NodeIndex): boolean {
    return !this._getExpandedNodes().has(nodeId);
  }

  _toggle = (
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId),
    toggleAll: boolean = false
  ) => {
    const newSet = new Set(this._getExpandedNodes());
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
      if (this.props.onDoubleClick) {
        this.props.onDoubleClick(nodeId);
      } else {
        this._toggle(nodeId);
      }
    }
  };

  _onCopy = (event: ClipboardEvent) => {
    event.preventDefault();
    const { selectedNodeId, mainColumn } = this.props;
    const { tree } = this.props;
    if (selectedNodeId) {
      const displayData = tree.getDisplayData(selectedNodeId);
      const clipboardData: DataTransfer = (event: any).clipboardData;
      clipboardData.setData('text/plain', displayData[mainColumn.propName]);
    }
  };

  _onKeyDown = (event: SyntheticKeyboardEvent<>) => {
    if (this.props.onKeyDown) {
      this.props.onKeyDown(event);
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
    const visibleRows = this._getAllVisibleRows();
    const selectedRowIndex = visibleRows.findIndex(
      (nodeId) => nodeId === selected
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

  /* This method is used by users of this component. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus() {
    if (this._list) {
      this._list.focus();
    }
  }

  _onSort = (column: number) => {
    if (
      !this.props.sortableColumns ||
      !this.props.sortableColumns.has(column)
    ) {
      return;
    }
    const newSortedColumns = this.state.sortedColumns.push(column);
    this.setState({
      sortedColumns: newSortedColumns,
    });
    if (this.props.onSort) {
      this.props.onSort(newSortedColumns);
    }
  };

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
      sortableColumns,
    } = this.props;
    const { sortedColumns } = this.state;
    const columnSortDirections =
      sortableColumns && sortedColumns
        ? sortedColumns.getSortStateArr(sortableColumns)
        : undefined;
    return (
      <div className="treeView">
        <TreeViewHeader
          fixedColumns={fixedColumns}
          mainColumn={mainColumn}
          onSort={this._onSort}
          columnSortDirections={columnSortDirections}
        />
        <ContextMenuTrigger
          id={contextMenuId ?? 'unknown'}
          disable={!contextMenuId}
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
            items={this._getAllVisibleRows()}
            renderItem={this._renderRow}
            itemHeight={rowHeight}
            columnCount={2}
            focusable={true}
            onKeyDown={this._onKeyDown}
            specialItems={this._getSpecialItems()}
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
