import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from '../components/TreeView';
import { getZeroAt, selectedThreadSelectors, getSelectedThreadIndex } from '../selectors/';
import * as actions from '../actions';

class MarkerTree {
  constructor(thread, zeroAt) {
    this._thread = thread;
    this._zeroAt = zeroAt;
    this._nodes = new Map();
  }

  getRoots() {
    const markerIndices = [];
    for (let i = 0; i < this._thread.markers.length; i++) {
      markerIndices.push(i);
    }
    return markerIndices;
  }

  getChildren(markerIndex) {
    return markerIndex === -1 ? this.getRoots() : [];
  }

  hasChildren(markerIndex) {
    return markerIndex === -1;
  }

  getParent() {
    return null;
  }

  getDepth() {
    return 0;
  }

  hasSameNodeIds(tree) {
    return this._thread.markers === tree._thread.markers;
  }

  /**
   * Return an object with information about the node with index markerIndex.
   * @param  {[type]} markerIndex [description]
   * @return {[type]}             [description]
   */
  getNode(markerIndex) {
    let node = this._nodes.get(markerIndex);
    if (node === undefined) {
      node = {
        timestamp: `${((this._thread.markers.time[markerIndex] - this._zeroAt) / 1000).toFixed(2)}s`,
        category: 'unknown',
        name: this._thread.stringTable.getString(this._thread.markers.name[markerIndex]),
      };
      this._nodes.set(markerIndex, node);
    }
    return node;
  }
}

class ProfileMarkersView extends Component {
  constructor(props) {
    super(props);
    this._fixedColumns = [
      { propName: 'timestamp', title: 'Time Stamp' },
      { propName: 'category', title: '' },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._expandedNodeIds = [];
    this._onExpandedNodeIdsChange = () => {};
  }

  componentDidMount() {
    this.focus();
  }

  focus() {
    this.refs.treeView.focus();
  }

  render() {
    const tree = new MarkerTree(this.props.thread, this.props.zeroAt);
    return (
      <div className='profileMarkersView'>
        <TreeView tree={tree}
                  fixedColumns={this._fixedColumns}
                  mainColumn={this._mainColumn}
                  onSelectionChange={this._onExpandedNodeIdsChange}
                  onExpandedNodesChange={this._onExpandedNodeIdsChange}
                  selectedNodeId={0}
                  expandedNodeIds={this._expandedNodeIds}
                  ref='treeView'/>
      </div>
    );
  }
}

ProfileMarkersView.propTypes = {
  thread: PropTypes.object.isRequired,
  zeroAt: PropTypes.number.isRequired,
};

export default connect((state, props) => ({
  threadIndex: getSelectedThreadIndex(state, props),
  thread: selectedThreadSelectors.getRangeSelectionFilteredThread(state, props),
  zeroAt: getZeroAt(state, props),
}), actions)(ProfileMarkersView);
