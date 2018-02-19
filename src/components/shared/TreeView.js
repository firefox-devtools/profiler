/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import VirtualList from './VirtualList';
import { BackgroundImageStyleDef } from './StyleDef';

import ContextMenuTrigger from './ContextMenuTrigger';

import type { IconWithClassName } from '../../types/reducers';

// This is used for the result of RegExp.prototype.exec because Flow doesn't do it.
// See https://github.com/facebook/flow/issues/4099
type RegExpResult = null | ({ index: number, input: string } & string[]);

export type Column = {
  propName: string,
  title: string,
  component?: React.ComponentType<*>,
};

type TreeViewHeaderProps = {|
  +fixedColumns: Column[],
  +mainColumn: Column,
|};

const TreeViewHeader = ({ fixedColumns, mainColumn }: TreeViewHeaderProps) => (
  <div className="treeViewHeader">
    {fixedColumns.map(col => (
      <span
        className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName}`}
        key={col.propName}
      >
        {col.title}
      </span>
    ))}
    <span
      className={`treeViewHeaderColumn treeViewMainColumn ${
        mainColumn.propName
      }`}
    >
      {mainColumn.title}
    </span>
  </div>
);

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

type TreeViewRowFixedColumnsProps<NodeIndex: number, DisplayData: Object> = {
  displayData: DisplayData,
  nodeId: NodeIndex,
  columns: Column[],
  index: number,
  selected: boolean,
  onClick: (NodeIndex, SyntheticMouseEvent<>) => mixed,
  highlightRegExp: RegExp | null,
};

class TreeViewRowFixedColumns<
  NodeIndex: number,
  DisplayData: Object
> extends React.PureComponent<
  TreeViewRowFixedColumnsProps<NodeIndex, DisplayData>
> {
  constructor(props: TreeViewRowFixedColumnsProps<NodeIndex, DisplayData>) {
    super(props);
    (this: any)._onClick = this._onClick.bind(this);
  }

  _onClick(event: SyntheticMouseEvent<>) {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  }

  render() {
    const {
      displayData,
      columns,
      index,
      selected,
      highlightRegExp,
    } = this.props;
    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';
    return (
      <div
        className={`treeViewRow treeViewRowFixedColumns ${evenOddClassName} ${
          selected ? 'selected' : ''
        }`}
        style={{ height: '16px' }}
        onMouseDown={this._onClick}
      >
        {columns.map(col => {
          const RenderComponent = col.component;
          const text = displayData[col.propName] || '';

          return (
            <span
              className={`treeViewRowColumn treeViewFixedColumn ${
                col.propName
              }`}
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

type TreeViewRowScrolledColumnsProps<
  NodeIndex: number,
  DisplayData: Object
> = {|
  +displayData: DisplayData,
  +nodeId: NodeIndex,
  +depth: number,
  +mainColumn: Column,
  +appendageColumn?: Column,
  +appendageButtons?: string[],
  +index: number,
  +canBeExpanded: boolean,
  +isExpanded: boolean,
  +selected: boolean,
  +onToggle: (NodeIndex, boolean, boolean) => mixed,
  +onClick: (NodeIndex, SyntheticMouseEvent<>) => mixed,
  +onAppendageButtonClick?: ((NodeIndex | null, string) => mixed) | null,
  +highlightRegExp: RegExp | null,
|};

class TreeViewRowScrolledColumns<
  NodeIndex: number,
  DisplayData: Object
> extends React.PureComponent<
  TreeViewRowScrolledColumnsProps<NodeIndex, DisplayData>
> {
  constructor(props: TreeViewRowScrolledColumnsProps<NodeIndex, DisplayData>) {
    super(props);
    (this: any)._onClick = this._onClick.bind(this);
  }

  /**
   * In this mousedown handler, we use event delegation so we have to use
   * `target` instead of `currentTarget`.
   */
  _onClick(event: { target: Element } & SyntheticMouseEvent<Element>) {
    const {
      nodeId,
      isExpanded,
      onToggle,
      onClick,
      onAppendageButtonClick,
    } = this.props;
    if (event.target.classList.contains('treeRowToggleButton')) {
      onToggle(nodeId, !isExpanded, event.altKey === true);
    } else if (event.target.classList.contains('treeViewRowAppendageButton')) {
      if (onAppendageButtonClick) {
        onAppendageButtonClick(
          nodeId,
          event.target.getAttribute('data-appendage-button-name') || ''
        );
      }
    } else {
      onClick(nodeId, event);
    }
  }

  render() {
    const {
      displayData,
      depth,
      mainColumn,
      appendageColumn,
      index,
      canBeExpanded,
      isExpanded,
      selected,
      highlightRegExp,
      appendageButtons,
    } = this.props;
    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';

    return (
      <div
        className={`treeViewRow treeViewRowScrolledColumns ${evenOddClassName} ${
          selected ? 'selected' : ''
        } ${displayData.dim ? 'dim' : ''}`}
        style={{ height: '16px' }}
        onMouseDown={this._onClick}
      >
        <span
          className="treeRowIndentSpacer"
          style={{ width: `${depth * 10}px` }}
        />
        <span
          className={`treeRowToggleButton ${
            isExpanded ? 'expanded' : 'collapsed'
          } ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`}
        />
        <span
          className={`treeViewRowColumn treeViewMainColumn ${
            mainColumn.propName
          }`}
        >
          {reactStringWithHighlightedSubstrings(
            displayData[mainColumn.propName],
            highlightRegExp,
            'treeViewHighlighting'
          )}
        </span>
        {appendageColumn ? (
          <span
            className={`treeViewRowColumn treeViewAppendageColumn ${
              appendageColumn.propName
            }`}
          >
            {reactStringWithHighlightedSubstrings(
              displayData[appendageColumn.propName],
              highlightRegExp,
              'treeViewHighlighting'
            )}
          </span>
        ) : null}
        {appendageButtons
          ? appendageButtons.map(buttonName => (
              <input
                className={classNames('treeViewRowAppendageButton', buttonName)}
                type="button"
                key={buttonName}
                data-appendage-button-name={buttonName}
                value=""
              />
            ))
          : null}
      </div>
    );
  }
}

interface Tree<NodeIndex: number, DisplayData: Object> {
  getDepth(NodeIndex): number;
  getRoots(): NodeIndex[];
  getDisplayData(NodeIndex): DisplayData;
  getParent(NodeIndex): NodeIndex;
  getChildren(NodeIndex): NodeIndex[];
  hasChildren(NodeIndex): boolean;
  getAllDescendants(NodeIndex): Set<NodeIndex>;
}

type TreeViewProps<NodeIndex, DisplayData> = {|
  +fixedColumns: Column[],
  +mainColumn: Column,
  +tree: Tree<NodeIndex, DisplayData>,
  +expandedNodeIds: Array<NodeIndex | null>,
  +selectedNodeId: NodeIndex | null,
  +onExpandedNodesChange: (Array<NodeIndex | null>) => mixed,
  +onExpandNode?: NodeIndex => NodeIndex,
  +highlightRegExp?: RegExp | null,
  +appendageColumn?: Column,
  +appendageButtons?: string[],
  +disableOverscan?: boolean,
  +icons?: IconWithClassName[],
  +contextMenu?: React.Element<any>,
  +contextMenuId?: string,
  +maxNodeDepth: number,
  +onAppendageButtonClick?: ((NodeIndex | null, string) => mixed) | null,
  +onSelectionChange: NodeIndex => mixed,
|};

class TreeView<
  NodeIndex: number,
  DisplayData: Object
> extends React.PureComponent<TreeViewProps<NodeIndex, DisplayData>> {
  _specialItems: (NodeIndex | null)[];
  _visibleRows: NodeIndex[];
  _list: VirtualList | null;
  _takeListRef = (list: VirtualList | null) => (this._list = list);

  constructor(props: TreeViewProps<NodeIndex, DisplayData>) {
    super(props);
    (this: any)._renderRow = this._renderRow.bind(this);
    (this: any)._toggle = this._toggle.bind(this);
    (this: any)._onKeyDown = this._onKeyDown.bind(this);
    (this: any)._onCopy = this._onCopy.bind(this);
    (this: any)._onRowClicked = this._onRowClicked.bind(this);
    this._specialItems = [props.selectedNodeId];
    this._visibleRows = this._getAllVisibleRows(props);
    this._list = null;
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

  componentWillReceiveProps(nextProps: TreeViewProps<NodeIndex, DisplayData>) {
    if (nextProps.selectedNodeId !== this.props.selectedNodeId) {
      this._specialItems = [nextProps.selectedNodeId];
    }
    if (
      nextProps.tree !== this.props.tree ||
      nextProps.expandedNodeIds !== this.props.expandedNodeIds
    ) {
      this._visibleRows = this._getAllVisibleRows(nextProps);
    }
  }

  _renderRow(nodeId: NodeIndex, index: number, columnIndex: number) {
    const {
      tree,
      expandedNodeIds,
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      highlightRegExp,
      appendageButtons,
      onAppendageButtonClick,
    } = this.props;
    const displayData = tree.getDisplayData(nodeId);
    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns
          displayData={displayData}
          columns={fixedColumns}
          nodeId={nodeId}
          index={index}
          selected={nodeId === selectedNodeId}
          onClick={this._onRowClicked}
          highlightRegExp={highlightRegExp || null}
        />
      );
    }
    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = expandedNodeIds.includes(nodeId);
    return (
      <TreeViewRowScrolledColumns
        displayData={displayData}
        mainColumn={mainColumn}
        appendageColumn={appendageColumn}
        appendageButtons={appendageButtons}
        depth={tree.getDepth(nodeId)}
        nodeId={nodeId}
        index={index}
        canBeExpanded={canBeExpanded}
        isExpanded={isExpanded}
        onToggle={this._toggle}
        selected={nodeId === selectedNodeId}
        onClick={this._onRowClicked}
        onAppendageButtonClick={onAppendageButtonClick}
        highlightRegExp={highlightRegExp || null}
      />
    );
  }

  _addVisibleRowsFromNode(
    props: TreeViewProps<NodeIndex, DisplayData>,
    arr: NodeIndex[],
    nodeId: NodeIndex,
    depth: number
  ) {
    arr.push(nodeId);
    if (!props.expandedNodeIds.includes(nodeId)) {
      return;
    }
    const children = props.tree.getChildren(nodeId);
    for (let i = 0; i < children.length; i++) {
      this._addVisibleRowsFromNode(props, arr, children[i], depth + 1);
    }
  }

  _getAllVisibleRows(
    props: TreeViewProps<NodeIndex, DisplayData>
  ): NodeIndex[] {
    const roots = props.tree.getRoots();
    const allRows = [];
    for (let i = 0; i < roots.length; i++) {
      this._addVisibleRowsFromNode(props, allRows, roots[i], 0);
    }
    return allRows;
  }

  _isCollapsed(nodeId: NodeIndex): boolean {
    return !this.props.expandedNodeIds.includes(nodeId);
  }

  // This function returns the deepest expanded node, but only if expandAll is
  // false, because in this case it's meaningless.
  _expand(nodeId: NodeIndex, expandAll: * = false): NodeIndex | null {
    const {
      tree,
      expandedNodeIds,
      onExpandedNodesChange,
      onExpandNode,
    } = this.props;

    if (expandAll) {
      const newSet = new Set(expandedNodeIds);
      newSet.add(nodeId);
      for (const descendant of tree.getAllDescendants(nodeId)) {
        newSet.add(descendant);
      }
      onExpandedNodesChange([...newSet]);

      return null;
    } else if (onExpandNode) {
      return onExpandNode(nodeId);
    } else {
      onExpandedNodesChange([...expandedNodeIds, nodeId]);
      return nodeId;
    }
  }

  _collapse(nodeId: NodeIndex) {
    const { expandedNodeIds, onExpandedNodesChange } = this.props;
    onExpandedNodesChange(expandedNodeIds.filter(idx => idx !== nodeId));
  }

  // Returns the deepest expanded child, only if newExpanded is true and
  // toggleAll is false.
  _toggle(
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId),
    toggleAll: * = false
  ) {
    if (newExpanded) {
      this._expand(nodeId, toggleAll);
    } else {
      this._collapse(nodeId);
    }
  }

  _toggleAll(
    nodeId: NodeIndex,
    newExpanded: boolean = this._isCollapsed(nodeId)
  ) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId: NodeIndex) {
    this.props.onSelectionChange(nodeId);
  }

  _onRowClicked(nodeId: NodeIndex, event: SyntheticMouseEvent<>) {
    this._select(nodeId);
    if (event.detail === 2 && event.button === 0) {
      // double click
      this._toggle(nodeId);
    }
  }

  /**
   * Flow doesn't yet know about Clipboard events, so infer what's going on with the
   * event.
   * See: https://github.com/facebook/flow/issues/1856
   */
  _onCopy(event: *) {
    event.preventDefault();
    const { tree, selectedNodeId, mainColumn } = this.props;
    if (selectedNodeId) {
      const displayData = tree.getDisplayData(selectedNodeId);
      event.clipboardData.setData(
        'text/plain',
        displayData[mainColumn.propName]
      );
    }
  }

  _onKeyDown(event: KeyboardEvent) {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.keyCode < 37 || event.keyCode > 40) {
      if (event.keyCode !== 0 || String.fromCharCode(event.charCode) !== '*') {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();

    const { tree } = this.props;
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

    if (event.keyCode === 37) {
      // KEY_LEFT
      const isCollapsed = this._isCollapsed(selected);
      if (!isCollapsed) {
        this._collapse(selected);
      } else {
        const parent = tree.getParent(selected);
        if (parent !== -1) {
          this._select(parent);
          this._collapse(parent);
        }
      }
    } else if (event.keyCode === 38) {
      // KEY_UP
      if (selectedRowIndex > 0) {
        this._select(visibleRows[selectedRowIndex - 1]);
      }
    } else if (event.keyCode === 39) {
      // KEY_RIGHT
      // If the selected element has no children, there's nothing to expand or
      // select.
      if (!tree.hasChildren(selected)) {
        return;
      }

      const deepestChild = this._expand(selected);
      if (deepestChild !== null) {
        const deepestChildChildren = tree.getChildren(deepestChild);
        this._select(deepestChildChildren[0] || deepestChild);
      }
    } else if (event.keyCode === 40) {
      // KEY_DOWN
      if (selectedRowIndex < visibleRows.length - 1) {
        this._select(visibleRows[selectedRowIndex + 1]);
      }
    } else if (String.fromCharCode(event.charCode) === '*') {
      this._toggleAll(selected);
    }
  }

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
      icons,
      maxNodeDepth,
    } = this.props;
    return (
      <div className="treeView">
        {icons &&
          icons.map(({ className, icon }) => (
            <BackgroundImageStyleDef
              className={className}
              url={icon}
              key={className}
            />
          ))}
        <TreeViewHeader fixedColumns={fixedColumns} mainColumn={mainColumn} />
        <ContextMenuTrigger
          id={contextMenuId}
          attributes={{ className: 'treeViewContextMenu' }}
        >
          <VirtualList
            className="treeViewBody"
            items={this._visibleRows}
            renderItem={this._renderRow}
            itemHeight={16}
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

export default TreeView;
