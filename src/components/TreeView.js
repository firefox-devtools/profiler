import React, { Component, PropTypes } from 'react';
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

const TreeViewRow = ({ node, depth, fixedColumns, mainColumn, index, canBeExpanded, isExpanded }) => {
  const evenOddClassName = (index % 2) === 0 ? 'even' : 'odd';
  return (
    <div className={`treeViewRow ${evenOddClassName}`} style={{height: '16px'}}>
      {
        fixedColumns.map(col =>
          <span className={`treeViewRowColumn treeViewFixedColumn ${col.propName}`}
                key={col.propName}>
            { node[col.propName] }
          </span>)
      }
      <span className={`treeViewRowColumn treeViewMainColumn ${mainColumn.propName}`}
            style={{ marginLeft: `${depth * 10}px` }}>
        { node[mainColumn.propName] }
      </span>
    </div>
  );
};

class TreeView extends Component {

  constructor(props) {
    super(props);
    this.renderRow = this.renderRow.bind(this);
    this.state = {
      expandedNodeIds: new Set(),
    };
  }

  renderRow({ nodeId, depth }, index) {
    const node = this.props.tree.getNode(nodeId);
    const canBeExpanded = this.props.tree.hasChildren(nodeId);
    const isExpanded = this.state.expandedNodeIds.has(nodeId);
    return (
      <TreeViewRow node={node}
                   fixedColumns={this.props.fixedColumns}
                   mainColumn={this.props.mainColumn}
                   depth={depth}
                   nodeId={nodeId}
                   index={index}
                   canBeExpanded={canBeExpanded}
                   isExpanded={isExpanded} />
    );
  }

  getVisibleRowsFromNode(nodeId, depth) {
    const isExpanded = this.state.expandedNodeIds.has(nodeId);
    const thisNodeRow = { nodeId, depth };
    if (!isExpanded) {
      return [thisNodeRow];
    }
    const children = this.props.tree.getChildren(nodeId);
    const addChildRows = (arr, child) => arr.concat(this.getVisibleRowsFromNode(child, depth + 1));
    return children.reduce(addChildRows, [thisNodeRow]);
  }

  getAllVisibleRows() {
    const roots = this.props.tree.getRoots();
    const addRootRows = (arr, root) => arr.concat(this.getVisibleRowsFromNode(root, 0));
    return roots.reduce(addRootRows, []);
  }

  render() {
    return (
      <div className='treeView'>
        <TreeViewHeader fixedColumns={this.props.fixedColumns}
                         mainColumn={this.props.mainColumn}/>
        <VirtualList className='treeViewBody'
                     items={this.getAllVisibleRows()}
                     renderItem={this.renderRow}
                     itemHeight={16}/>
      </div>
    );
  }

};

export default TreeView;
