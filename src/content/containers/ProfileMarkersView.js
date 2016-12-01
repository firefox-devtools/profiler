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
    const { markers } = this._thread;
    return markers.data[markerIndex] !== null &&
           ('stack' in markers.data[markerIndex]);
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
      const { markers, stringTable } = this._thread;
      let category = 'unknown';
      let name = stringTable.getString(markers.name[markerIndex]);
      if (markers.data[markerIndex]) {
        if ('category' in markers.data[markerIndex]) {
          category = markers.data[markerIndex].category;
        }
        if (markers.data[markerIndex].type === 'tracing') {
          if (category === 'log') {
            // name is actually the whole message that was sent to fprintf_stderr. Would you consider that.
            if (name.length > 100) {
              name = name.substring(0, 100) + '...';
            }
          } else {
            name = `[${markers.data[markerIndex].interval}] ${name}`;
          }
        }
      }
      node = {
        timestamp: `${((markers.time[markerIndex] - this._zeroAt) / 1000).toFixed(3)}s`,
        name,
        category,
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
      { propName: 'category', title: 'Category' },
    ];
    this._mainColumn = { propName: 'name', title: '' };
    this._expandedNodeIds = [];
    this._onExpandedNodeIdsChange = () => {};
    this._onSelectionChange = this._onSelectionChange.bind(this);
  }

  componentDidMount() {
    this.focus();
  }

  focus() {
    this.refs.treeView.focus();
  }

  _onSelectionChange(selectedMarker) {
    const { threadIndex, changeSelectedMarker } = this.props;
    changeSelectedMarker(threadIndex, selectedMarker);
  }

  render() {
    const { thread, zeroAt, selectedMarker } = this.props;
    const tree = new MarkerTree(thread, zeroAt);
    return (
      <div className='profileMarkersView'>
        <TreeView tree={tree}
                  fixedColumns={this._fixedColumns}
                  mainColumn={this._mainColumn}
                  onSelectionChange={this._onSelectionChange}
                  onExpandedNodesChange={this._onExpandedNodeIdsChange}
                  selectedNodeId={selectedMarker}
                  expandedNodeIds={this._expandedNodeIds}
                  ref='treeView'/>
      </div>
    );
  }
}

ProfileMarkersView.propTypes = {
  thread: PropTypes.object.isRequired,
  threadIndex: PropTypes.number.isRequired,
  selectedMarker: PropTypes.number.isRequired,
  zeroAt: PropTypes.number.isRequired,
  changeSelectedMarker: PropTypes.func.isRequired,
};

export default connect((state, props) => ({
  threadIndex: getSelectedThreadIndex(state, props),
  thread: selectedThreadSelectors.getRangeSelectionFilteredThread(state, props),
  selectedMarker: selectedThreadSelectors.getViewOptions(state, props).selectedMarker,
  zeroAt: getZeroAt(state, props),
}), actions)(ProfileMarkersView);
