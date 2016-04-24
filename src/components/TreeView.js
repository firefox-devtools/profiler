import React, { Component, PropTypes } from 'react';
import shallowCompare from 'react-addons-shallow-compare';
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

const TreeViewRow = ({ node, nodeId, depth, fixedColumns, mainColumn, index, canBeExpanded, isExpanded, onToggle, selected, onClick }) => {
  const evenOddClassName = (index % 2) === 0 ? 'even' : 'odd';
  const clickHandler = e => {
    if (e.target.classList.contains('treeRowToggleButton')) {
      onToggle(nodeId, !isExpanded, e.altKey === true);
    } else {
      onClick(nodeId);
    }
  }
  return (
    <div className={`treeViewRow ${evenOddClassName} ${selected ? 'selected' : ''}`} style={{height: '16px'}} onClick={clickHandler}>
      {
        fixedColumns.map(col =>
          <span className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
                key={col.propName}>
            { node[col.propName] }
          </span>)
      }
      <span className={`treeRowToggleButton ${isExpanded ? 'expanded' : 'collapsed'} ${canBeExpanded ? 'canBeExpanded' : 'leaf'}`}
            style={{ marginLeft: `${depth * 10}px` }}/>
      <span className={`treeViewRowColumn treeViewMainColumn ${mainColumn.propName}`}>
        { node[mainColumn.propName] }
      </span>
    </div>
  );
};

class TreeView extends Component {

  constructor(props) {
    super(props);
    this._renderRow = this._renderRow.bind(this);
    this._toggle = this._toggle.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onRowClicked = this._onRowClicked.bind(this);
    this.state = {
      expandedNodeIds: new Set(),
      selectedNodeId: -1
    };
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  _renderRow({ nodeId, depth }, index) {
    const { tree } = this.props;
    const { selectedNodeId, expandedNodeIds } = this.state;
    const node = tree.getNode(nodeId);
    const canBeExpanded = tree.hasChildren(nodeId);
    const isExpanded = expandedNodeIds.has(nodeId);
    return (
      <TreeViewRow node={node}
                   fixedColumns={this.props.fixedColumns}
                   mainColumn={this.props.mainColumn}
                   depth={depth}
                   nodeId={nodeId}
                   index={index}
                   canBeExpanded={canBeExpanded}
                   isExpanded={isExpanded}
                   onToggle={this._toggle}
                   selected={nodeId === selectedNodeId}
                   onClick={this._onRowClicked}/>
    );
  }

  _getVisibleRowsFromNode(nodeId, depth) {
    const isExpanded = this.state.expandedNodeIds.has(nodeId);
    const thisNodeRow = { nodeId, depth };
    if (!isExpanded) {
      return [thisNodeRow];
    }
    const children = this.props.tree.getChildren(nodeId);
    const addChildRows = (arr, child) => arr.concat(this._getVisibleRowsFromNode(child, depth + 1));
    return children.reduce(addChildRows, [thisNodeRow]);
  }

  _getAllVisibleRows() {
    const roots = this.props.tree.getRoots();
    const addRootRows = (arr, root) => arr.concat(this._getVisibleRowsFromNode(root, 0));
    return roots.reduce(addRootRows, []);
  }

  _isCollapsed(nodeId) {
    return !this.state.expandedNodeIds.has(nodeId);
  }

  _toggle(nodeId, newExpanded = this._isCollapsed(nodeId), toggleAll = false) {
    if (newExpanded) {
      const newExpandedNodeIds = new Set(this.state.expandedNodeIds);
      newExpandedNodeIds.add(nodeId);
      this.setState({expandedNodeIds: newExpandedNodeIds});
    } else {
      const newExpandedNodeIds = new Set(this.state.expandedNodeIds);
      newExpandedNodeIds.delete(nodeId);
      this.setState({expandedNodeIds: newExpandedNodeIds});
    }
  }

  _toggleAll(nodeId, newExpanded = this._isCollapsed(nodeId)) {
    this._toggle(nodeId, newExpanded, true);
  }

  _select(nodeId) {
    this.setState({ selectedNodeId: nodeId });
    this.props.onSelectionChange(nodeId);
  }

  _onRowClicked(nodeId) {
    this._select(nodeId);
  }

  _onKeyDown(event) {
    console.log('keydown', event);

    if (event.ctrlKey || event.altKey || event.metaKey)
      return;

    if (event.keyCode < 37 || event.keyCode > 40) {
      if (event.keyCode != 0 ||
          String.fromCharCode(event.charCode) != '*') {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();

    const selected = this.state.selectedNodeId;
    const visibleRows = this._getAllVisibleRows();
    const selectedRowIndex = visibleRows.findIndex(({nodeId}) => nodeId === selected);

    if (selectedRowIndex === -1) {
      this._select(visibleRows[0].nodeId);
      return;
    }

    if (event.keyCode == 37) { // KEY_LEFT
      var isCollapsed = this._isCollapsed(selected);
      if (!isCollapsed) {
        this._toggle(selected);
      } else {
        var parent = this.props.tree.getParent(selected); 
        if (parent != -1) {
          this._select(parent);
        }
      }
    } else if (event.keyCode == 38) { // KEY_UP
      if (selectedRowIndex > 0) {
        this._select(visibleRows[selectedRowIndex - 1].nodeId);
      }
    } else if (event.keyCode == 39) { // KEY_RIGHT
      var isCollapsed = this._isCollapsed(selected);
      if (isCollapsed) {
        this._toggle(selected);
      } else {
        // Do KEY_DOWN only if the next element is a child
        if (this.props.tree.hasChildren(selected)) {
          this._select(this.props.tree.getChildren(selected)[0]);
        }
      }
    } else if (event.keyCode == 40) { // KEY_DOWN
      if (selectedRowIndex < visibleRows.length - 1) {
        this._select(visibleRows[selectedRowIndex + 1].nodeId);
      }
    } else if (String.fromCharCode(event.charCode) == '*') {
      this._toggleAll(selected);
    }
  }

  render() {
    const { fixedColumns, mainColumn } = this.props;
    this._visibleRows = this._getAllVisibleRows();
    return (
      <div className='treeView'>
        <TreeViewHeader fixedColumns={this.props.fixedColumns}
                         mainColumn={this.props.mainColumn}/>
        <VirtualList className='treeViewBody'
                     items={this._visibleRows}
                     renderItem={this._renderRow}
                     itemHeight={16}
                     focusable={true}
                     onKeyDown={this._onKeyDown}/>
      </div>
    );
  }

};

export default TreeView;
