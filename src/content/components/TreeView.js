import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
import classNames from 'classnames';
import VirtualList from './VirtualList';

const TreeViewHeader = ({ fixedColumns, mainColumn }) => (
  <div className='treeViewHeader'>
    {
      fixedColumns.map(col =>
        <span className={`treeViewHeaderColumn treeViewFixedColumn ${col.propName}`}
              key={col.propName}>
          { col.title }
        </span>)
    }
    <span className={`treeViewHeaderColumn treeViewMainColumn ${mainColumn.propName}`}>
      { mainColumn.title }
    </span>
  </div>
);

TreeViewHeader.propTypes = {
  fixedColumns: PropTypes.arrayOf(PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  })).isRequired,
  mainColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }).isRequired,
};

function reactStringWithHighlightedSubstrings(string, substring, className) {
  if (!substring) {
    return string;
  }
  const lowercaseString = string.toLowerCase();
  const result = [];
  let startAt = 0;
  let nextOccurrence = -1;
  while ((nextOccurrence = lowercaseString.indexOf(substring, startAt)) !== -1) {
    const afterNextOccurrence = nextOccurrence + substring.length;
    result.push(string.substring(startAt, nextOccurrence));
    result.push(<span key={nextOccurrence} className={className}>{string.substring(nextOccurrence, afterNextOccurrence)}</span>);
    startAt = afterNextOccurrence;
  }
  result.push(string.substring(startAt));
  return result;
}

class TreeViewRowFixedColumns extends Component {

  constructor(props) {
    super(props);
    this._onClick = this._onClick.bind(this);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  _onClick(event) {
    const { nodeId, onClick } = this.props;
    onClick(nodeId, event);
  }

  render() {
    const { node, columns, index, selected, highlightString } = this.props;
    const evenOddClassName = (index % 2) === 0 ? 'even' : 'odd';
    return (
      <div className={`treeViewRow treeViewRowFixedColumns ${evenOddClassName} ${selected ? 'selected' : ''}`} style={{height: '16px'}} onClick={this._onClick}>
        {
          columns.map(col =>
            <span className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
                  key={col.propName}>
              { reactStringWithHighlightedSubstrings(node[col.propName], highlightString, 'treeViewHighlighting') }
            </span>)
        }
      </div>
    );
  }
}

TreeViewRowFixedColumns.propTypes = {
  node: PropTypes.object.isRequired,
  nodeId: PropTypes.number.isRequired,
  columns: PropTypes.arrayOf(PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  })).isRequired,
  index: PropTypes.number.isRequired,
  selected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  highlightString: PropTypes.string,
};

class TreeViewRowScrolledColumns extends Component {

  constructor(props) {
    super(props);
    this._onClick = this._onClick.bind(this);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  _onClick(event) {
    const {
      nodeId, isExpanded, onToggle, onClick, onAppendageButtonClick,
    } = this.props;
    if (event.target.classList.contains('treeRowToggleButton')) {
      onToggle(nodeId, !isExpanded, event.altKey === true);
    } else if (event.target.classList.contains('treeViewRowAppendageButton')) {
      if (onAppendageButtonClick) {
        onAppendageButtonClick(nodeId, event.target.getAttribute('data-appendage-button-name'));
      }
    } else {
      onClick(nodeId, event);
    }
  }

  render() {
    const {
      node, depth, mainColumn, appendageColumn, index, canBeExpanded,
      isExpanded, selected, highlightString, appendageButtons,
    } = this.props;
    const evenOddClassName = (index % 2) === 0 ? 'even' : 'odd';
    return (
      <div className={`treeViewRow treeViewRowScrolledColumns ${evenOddClassName} ${selected ? 'selected' : ''} ${node.dim ? 'dim' : ''}`} style={{height: '16px'}} onClick={this._onClick}>
        <span className='treeRowIndentSpacer' style={{ width: `${depth * 10}px` }}/>
        <span className={`treeRowToggleButton ${isExpanded ? 'expanded' : 'collapsed'} ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`} />
        <span className={`treeViewRowColumn treeViewMainColumn ${mainColumn.propName}`}>
          {reactStringWithHighlightedSubstrings(node[mainColumn.propName], highlightString, 'treeViewHighlighting')}
        </span>
        { appendageColumn ? (
          <span className={`treeViewRowColumn treeViewAppendageColumn ${appendageColumn.propName}`}>
            {node[appendageColumn.propName]}
          </span>
          ) : null}
        { appendageButtons ? appendageButtons.map(buttonName => (
            <input className={classNames('treeViewRowAppendageButton', buttonName)}
                   type='button'
                   key={buttonName}
                   data-appendage-button-name={buttonName}
                   value=''/>
          )) : null }
      </div>
    );
  }
}

TreeViewRowScrolledColumns.propTypes = {
  node: PropTypes.object.isRequired,
  nodeId: PropTypes.number.isRequired,
  depth: PropTypes.number.isRequired,
  mainColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }).isRequired,
  appendageColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }),
  appendageButtons: PropTypes.arrayOf(PropTypes.string),
  index: PropTypes.number.isRequired,
  canBeExpanded: PropTypes.bool.isRequired,
  isExpanded: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  selected: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
  onAppendageButtonClick: PropTypes.func,
  highlightString: PropTypes.string,
};

class TreeView extends Component {

  constructor(props) {
    super(props);
    this._renderRow = this._renderRow.bind(this);
    this._toggle = this._toggle.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onRowClicked = this._onRowClicked.bind(this);
    this._specialItems = [props.selectedNodeId];
    this._visibleRows = this._getAllVisibleRows(props);
  }

  scrollSelectionIntoView() {
    if (this.refs.list) {
      const { selectedNodeId, tree } = this.props;
      const rowIndex = this._visibleRows.indexOf(selectedNodeId);
      const depth = tree.getDepth(selectedNodeId);
      this.refs.list.scrollItemIntoView(rowIndex, depth * 10);
    }

  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.selectedNodeId !== this.props.selectedNodeId) {
      this._specialItems = [nextProps.selectedNodeId];
    }
    if (nextProps.tree !== this.props.tree ||
        nextProps.expandedNodeIds !== this.props.expandedNodeIds) {
      this._visibleRows = this._getAllVisibleRows(nextProps);
    }
  }

  _renderRow(nodeId, index, columnIndex) {
    const {
      tree, expandedNodeIds, fixedColumns, mainColumn, appendageColumn,
      selectedNodeId, highlightString, appendageButtons,
      onAppendageButtonClick,
    } = this.props;
    const node = tree.getNode(nodeId);
    if (columnIndex === 0) {
      return (
        <TreeViewRowFixedColumns node={node}
                                 columns={fixedColumns}
                                 nodeId={nodeId}
                                 index={index}
                                 selected={nodeId === selectedNodeId}
                                 onClick={this._onRowClicked}
                                 highlightString={highlightString}/>
      );
    }
    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = expandedNodeIds.includes(nodeId);
    return (
      <TreeViewRowScrolledColumns node={node}
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
                                  highlightString={highlightString}/>
    );
  }

  _addVisibleRowsFromNode(props, arr, nodeId, depth) {
    arr.push(nodeId);
    if (!props.expandedNodeIds.includes(nodeId)) {
      return;
    }
    const children = props.tree.getChildren(nodeId);
    for (let i = 0; i < children.length; i++) {
      this._addVisibleRowsFromNode(props, arr, children[i], depth + 1);
    }
  }

  _getAllVisibleRows(props) {
    const roots = props.tree.getRoots();
    const allRows = [];
    for (let i = 0; i < roots.length; i++) {
      this._addVisibleRowsFromNode(props, allRows, roots[i], 0);
    }
    return allRows;
  }

  _isCollapsed(nodeId) {
    return !this.props.expandedNodeIds.includes(nodeId);
  }

  _addAllDescendants(newSet, nodeId) {
    this.props.tree.getChildren(nodeId).forEach(childId => {
      newSet.add(childId);
      this._addAllDescendants(newSet, childId);
    });
  }

  _toggle(nodeId, newExpanded = this._isCollapsed(nodeId), toggleAll = false) {
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

  _toggleAll(nodeId, newExpanded = this._isCollapsed(nodeId)) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId) {
    this.props.onSelectionChange(nodeId);
  }

  _onRowClicked(nodeId, event) {
    this._select(nodeId);
    if (event.detail === 2) { // double click
      this._toggle(nodeId);
    }
  }

  _onKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    if (event.keyCode < 37 || event.keyCode > 40) {
      if (event.keyCode !== 0 ||
          String.fromCharCode(event.charCode) !== '*') {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.props.selectedNodeId;
    const visibleRows = this._getAllVisibleRows(this.props);
    const selectedRowIndex = visibleRows.findIndex(nodeId => nodeId === selected);

    if (selectedRowIndex === -1) {
      this._select(visibleRows[0]);
      return;
    }

    if (event.keyCode === 37) { // KEY_LEFT
      const isCollapsed = this._isCollapsed(selected);
      if (!isCollapsed) {
        this._toggle(selected);
      } else {
        const parent = this.props.tree.getParent(selected);
        if (parent !== -1) {
          this._select(parent);
        }
      }
    } else if (event.keyCode === 38) { // KEY_UP
      if (selectedRowIndex > 0) {
        this._select(visibleRows[selectedRowIndex - 1]);
      }
    } else if (event.keyCode === 39) { // KEY_RIGHT
      const isCollapsed = this._isCollapsed(selected);
      if (isCollapsed) {
        this._toggle(selected);
      } else {
        // Do KEY_DOWN only if the next element is a child
        if (this.props.tree.hasChildren(selected)) {
          this._select(this.props.tree.getChildren(selected)[0]);
        }
      }
    } else if (event.keyCode === 40) { // KEY_DOWN
      if (selectedRowIndex < visibleRows.length - 1) {
        this._select(visibleRows[selectedRowIndex + 1]);
      }
    } else if (String.fromCharCode(event.charCode) === '*') {
      this._toggleAll(selected);
    }
  }

  focus() {
    this.refs.list.focus();
  }

  render() {
    const { fixedColumns, mainColumn, disableOverscan } = this.props;
    return (
      <div className='treeView'>
        <TreeViewHeader fixedColumns={fixedColumns}
                         mainColumn={mainColumn}/>
        <VirtualList className='treeViewBody'
                     items={this._visibleRows}
                     renderItem={this._renderRow}
                     itemHeight={16}
                     columnCount={2}
                     focusable={true}
                     onKeyDown={this._onKeyDown}
                     specialItems={this._specialItems}
                     disableOverscan={disableOverscan}
                     ref='list'/>
      </div>
    );
  }

}

TreeView.propTypes = {
  fixedColumns: PropTypes.arrayOf(PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  })).isRequired,
  mainColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }).isRequired,
  tree: PropTypes.object.isRequired,
  expandedNodeIds: PropTypes.arrayOf(PropTypes.number).isRequired,
  selectedNodeId: PropTypes.number,
  onExpandedNodesChange: PropTypes.func.isRequired,
  onSelectionChange: PropTypes.func.isRequired,
  highlightString: PropTypes.string,
  appendageColumn: PropTypes.shape({
    propName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
  }),
  appendageButtons: PropTypes.arrayOf(PropTypes.string),
  onAppendageButtonClick: PropTypes.func,
  disableOverscan: PropTypes.bool,
};

export default TreeView;
