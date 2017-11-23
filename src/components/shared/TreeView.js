/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import VirtualList from './VirtualList';
import { BackgroundImageStyleDef } from './StyleDef';

import ContextMenuTrigger from './ContextMenuTrigger';

import type { IndexIntoCallNodeTable, Node } from '../../types/profile-derived';
import type { CallTree } from '../../profile-logic/call-tree';
import type { IconWithClassName } from '../../types/reducers';

type RegExpResult = null | ({ index: number, input: string } & string[]);

export type Column = {
  propName: string,
  title: string,
  component?: React.ComponentType<*>,
};

type TreeViewHeaderProps = {
  fixedColumns: Column[],
  mainColumn: Column,
};

const TreeViewHeader = ({ fixedColumns, mainColumn }: TreeViewHeaderProps) =>
  <div className="treeViewHeader">
    {fixedColumns.map(col =>
      <span
        className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName}`}
        key={col.propName}
      >
        {col.title}
      </span>
    )}
    <span
      className={`treeViewHeaderColumn treeViewMainColumn ${mainColumn.propName}`}
    >
      {mainColumn.title}
    </span>
  </div>;

function reactStringWithHighlightedSubstrings(
  string: string,
  re: ?RegExp,
  className: string
) {
  if (!re) {
    return string;
  }

  // Since the regexp is reused and likely global, let's make sure we reset it.
  re.lastIndex = 0;

  const highlighted = [];
  let lastOccurrence = 0;
  let result;
  while ((result = re.exec(string))) {
    const typedResult: RegExpResult = result;
    if (typedResult === null) {
      break;
    }
    highlighted.push(string.substring(lastOccurrence, typedResult.index));
    lastOccurrence = re.lastIndex;
    highlighted.push(
      <span key={typedResult.index} className={className}>
        {typedResult[0]}
      </span>
    );
  }
  highlighted.push(string.substring(lastOccurrence));
  return highlighted;
}

type TreeViewRowFixedColumnsProps = {
  node: Node,
  nodeId: IndexIntoCallNodeTable,
  columns: Column[],
  index: number,
  selected: boolean,
  onClick: (IndexIntoCallNodeTable, SyntheticMouseEvent<>) => mixed,
  highlightRe: RegExp | null,
};

class TreeViewRowFixedColumns extends React.PureComponent<
  TreeViewRowFixedColumnsProps
> {
  constructor(props: TreeViewRowFixedColumnsProps) {
    super(props);
    (this: any)._onClick = this._onClick.bind(this);
  }

  _onClick(event: SyntheticMouseEvent<>) {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  }

  render() {
    const { node, columns, index, selected, highlightRe } = this.props;
    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';
    return (
      <div
        className={`treeViewRow treeViewRowFixedColumns ${evenOddClassName} ${selected
          ? 'selected'
          : ''}`}
        style={{ height: '16px' }}
        onMouseDown={this._onClick}
      >
        {columns.map(col => {
          const RenderComponent = col.component;

          return (
            <span
              className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
              key={col.propName}
            >
              {RenderComponent
                ? <RenderComponent node={node} />
                : reactStringWithHighlightedSubstrings(
                    node[col.propName],
                    highlightRe,
                    'treeViewHighlighting'
                  )}
            </span>
          );
        })}
      </div>
    );
  }
}

type TreeViewRowScrolledColumnsProps = {
  node: Node,
  nodeId: IndexIntoCallNodeTable,
  depth: number,
  mainColumn: Column,
  appendageColumn: Column,
  appendageButtons: string[],
  index: number,
  canBeExpanded: boolean,
  isExpanded: boolean,
  selected: boolean,
  onToggle: (IndexIntoCallNodeTable, boolean, boolean) => mixed,
  onClick: (IndexIntoCallNodeTable, SyntheticMouseEvent<>) => mixed,
  onAppendageButtonClick:
    | ((IndexIntoCallNodeTable | null, string) => mixed)
    | null,
  highlightRe: RegExp | null,
};

class TreeViewRowScrolledColumns extends React.PureComponent<
  TreeViewRowScrolledColumnsProps
> {
  constructor(props: TreeViewRowScrolledColumnsProps) {
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
      node,
      depth,
      mainColumn,
      appendageColumn,
      index,
      canBeExpanded,
      isExpanded,
      selected,
      highlightRe,
      appendageButtons,
    } = this.props;
    const evenOddClassName = index % 2 === 0 ? 'even' : 'odd';

    return (
      <div
        className={`treeViewRow treeViewRowScrolledColumns ${evenOddClassName} ${selected
          ? 'selected'
          : ''} ${node.dim ? 'dim' : ''}`}
        style={{ height: '16px' }}
        onMouseDown={this._onClick}
      >
        <span
          className="treeRowIndentSpacer"
          style={{ width: `${depth * 10}px` }}
        />
        <span
          className={`treeRowToggleButton ${isExpanded
            ? 'expanded'
            : 'collapsed'} ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`}
        />
        <span
          className={`treeViewRowColumn treeViewMainColumn ${mainColumn.propName}`}
        >
          {reactStringWithHighlightedSubstrings(
            node[mainColumn.propName],
            highlightRe,
            'treeViewHighlighting'
          )}
        </span>
        {appendageColumn
          ? <span
              className={`treeViewRowColumn treeViewAppendageColumn ${appendageColumn.propName}`}
            >
              {reactStringWithHighlightedSubstrings(
                node[appendageColumn.propName],
                highlightRe,
                'treeViewHighlighting'
              )}
            </span>
          : null}
        {appendageButtons
          ? appendageButtons.map(buttonName =>
              <input
                className={classNames('treeViewRowAppendageButton', buttonName)}
                type="button"
                key={buttonName}
                data-appendage-button-name={buttonName}
                value=""
              />
            )
          : null}
      </div>
    );
  }
}

type TreeViewProps = {|
  fixedColumns: Column[],
  mainColumn: Column,
  tree: CallTree,
  expandedNodeIds: Array<IndexIntoCallNodeTable | null>,
  selectedNodeId: IndexIntoCallNodeTable | null,
  onExpandedNodesChange: PropTypes.func.isRequired,
  highlightRe?: RegExp | null,
  appendageColumn: Column,
  appendageButtons: string[],
  disableOverscan: boolean,
  icons: IconWithClassName[],
  contextMenu?: React.Element<any>,
  contextMenuId?: string,
  onAppendageButtonClick:
    | ((IndexIntoCallNodeTable | null, string) => mixed)
    | null,
  onSelectionChange: IndexIntoCallNodeTable => mixed,
|};

class TreeView extends React.PureComponent<TreeViewProps> {
  _specialItems: (IndexIntoCallNodeTable | null)[];
  _visibleRows: IndexIntoCallNodeTable[];
  _list: VirtualList | null;

  constructor(props: TreeViewProps) {
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

  componentWillReceiveProps(nextProps: TreeViewProps) {
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

  _renderRow(
    nodeId: IndexIntoCallNodeTable,
    index: number,
    columnIndex: number
  ) {
    const {
      tree,
      expandedNodeIds,
      fixedColumns,
      mainColumn,
      appendageColumn,
      selectedNodeId,
      highlightRe,
      appendageButtons,
      onAppendageButtonClick,
    } = this.props;
    const node = tree.getNode(nodeId);
    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns
          node={node}
          columns={fixedColumns}
          nodeId={nodeId}
          index={index}
          selected={nodeId === selectedNodeId}
          onClick={this._onRowClicked}
          highlightRe={highlightRe || null}
        />
      );
    }
    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = expandedNodeIds.includes(nodeId);
    return (
      <TreeViewRowScrolledColumns
        node={node}
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
        highlightRe={highlightRe || null}
      />
    );
  }

  _addVisibleRowsFromNode(
    props: TreeViewProps,
    arr: IndexIntoCallNodeTable[],
    nodeId: IndexIntoCallNodeTable,
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

  _getAllVisibleRows(props: TreeViewProps) {
    const roots = props.tree.getRoots();
    const allRows = [];
    for (let i = 0; i < roots.length; i++) {
      this._addVisibleRowsFromNode(props, allRows, roots[i], 0);
    }
    return allRows;
  }

  _isCollapsed(nodeId: IndexIntoCallNodeTable) {
    return !this.props.expandedNodeIds.includes(nodeId);
  }

  _addAllDescendants(
    newSet: Set<IndexIntoCallNodeTable | null>,
    nodeId: IndexIntoCallNodeTable
  ) {
    this.props.tree.getChildren(nodeId).forEach(childId => {
      newSet.add(childId);
      this._addAllDescendants(newSet, childId);
    });
  }

  _toggle(
    nodeId: IndexIntoCallNodeTable,
    newExpanded: boolean = this._isCollapsed(nodeId),
    toggleAll: * = false
  ) {
    const newSet = new Set(this.props.expandedNodeIds);
    if (newExpanded) {
      newSet.add(nodeId);
      if (toggleAll) {
        this._addAllDescendants(newSet, nodeId);
      }
    } else {
      newSet.delete(nodeId);
    }
    this.props.onExpandedNodesChange(Array.from(newSet.values()));
  }

  _toggleAll(
    nodeId: IndexIntoCallNodeTable,
    newExpanded: boolean = this._isCollapsed(nodeId)
  ) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId: IndexIntoCallNodeTable) {
    this.props.onSelectionChange(nodeId);
  }

  _onRowClicked(nodeId: IndexIntoCallNodeTable, event: SyntheticMouseEvent<>) {
    this._select(nodeId);
    if (event.detail === 2 && event.button === 0) {
      // double click
      this._toggle(nodeId);
    }
  }

  _onCopy(event: ClipboardEvent) {
    event.preventDefault();
    const { tree, selectedNodeId, mainColumn } = this.props;
    if (selectedNodeId) {
      const node = tree.getNode(selectedNodeId);
      event.clipboardData.setData('text/plain', node[mainColumn.propName]);
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
        this._toggle(selected);
      } else {
        const parent = this.props.tree.getParent(selected);
        if (parent !== -1) {
          this._select(parent);
        }
      }
    } else if (event.keyCode === 38) {
      // KEY_UP
      if (selectedRowIndex > 0) {
        this._select(visibleRows[selectedRowIndex - 1]);
      }
    } else if (event.keyCode === 39) {
      // KEY_RIGHT
      const isCollapsed = this._isCollapsed(selected);
      if (isCollapsed) {
        this._toggle(selected);
      } else {
        // Do KEY_DOWN only if the next element is a child
        if (this.props.tree.hasChildren(selected)) {
          this._select(this.props.tree.getChildren(selected)[0]);
        }
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
    } = this.props;
    return (
      <div className="treeView">
        {icons &&
          icons.map(({ className, icon }) =>
            <BackgroundImageStyleDef
              className={className}
              url={icon}
              key={className}
            />
          )}
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
            disableOverscan={disableOverscan}
            onCopy={this._onCopy}
            ref={ref => {
              this._list = ref;
            }}
          />
        </ContextMenuTrigger>
        {contextMenu}
      </div>
    );
  }
}

TreeView.propTypes = {
  fixedColumns: PropTypes.arrayOf(
    PropTypes.shape({
      propName: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      component: PropTypes.func,
    })
  ).isRequired,
  mainColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }).isRequired,
  tree: PropTypes.object.isRequired,
  expandedNodeIds: PropTypes.arrayOf(PropTypes.number).isRequired,
  selectedNodeId: PropTypes.number,
  onExpandedNodesChange: PropTypes.func.isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  highlightRe: PropTypes.instanceOf(RegExp),
  appendageColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }),
  appendageButtons: PropTypes.arrayOf(PropTypes.string),
  onAppendageButtonClick: PropTypes.func,
  disableOverscan: PropTypes.bool,
  contextMenu: PropTypes.object,
  contextMenuId: PropTypes.string,
  icons: PropTypes.array,
};

export default TreeView;
