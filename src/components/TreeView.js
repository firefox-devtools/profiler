import React, { Component, PropTypes } from 'react';
import { getCallTree } from '../profile-tree';
import { connect } from 'react-redux';
import TreeRow from './TreeRow';

class VirtualList extends Component {
  computeVisibleRange() {
    if (!this.refs.container) {
      return {firstVisible: 0, lastVisible: 100};
    }
    const outerRect = this.refs.container.getBoundingClientRect();
    const innerRect = this.refs.inner.getBoundingClientRect();
    const overscan = 20;
    const chunkSize = 16;
    let firstVisible = Math.floor((outerRect.top - innerRect.top) / this.props.itemHeight) - overscan;
    firstVisible = Math.floor(firstVisible / chunkSize) * chunkSize;
    let lastVisible = Math.ceil((outerRect.bottom - innerRect.top) / this.props.itemHeight) + overscan;
    lastVisible = Math.ceil(lastVisible / chunkSize) * chunkSize;
    return {firstVisible, lastVisible};
  }
  componentDidMount() {
    this.refs.container.addEventListener('scroll', e => this.forceUpdate());
    this.forceUpdate(); // for initial size
  }
  render() {
    const range = this.computeVisibleRange();
    const { firstVisible, lastVisible } = range;
    const renderedRows = this.props.items.map((item, i) => {
      if (i < firstVisible || i > lastVisible)
        return;
      return <div className={this.props.className+'Row'}
                   key={i}
                   style={{height: this.props.itemHeight + 'px'}}>
                {this.props.renderItem(item)}
            </div>
    });
    return (<div className={this.props.className} ref='container'>
      <div className={this.props.className + 'Inner'} ref='inner'
            style={{
              height: `${this.props.items.length * this.props.itemHeight}px`,
              width: '3000px'
            }}>
        <div className={this.props.className + 'TopSpacer'} key={-1} style={{height: Math.max(0, firstVisible) * this.props.itemHeight + 'px'}}/>
        {renderedRows}
      </div>
    </div>);
  }
}

class TreeView extends Component {
  constructor(props) {
    super(props);
    this.renderRow = this.renderRow.bind(this);
  }
  renderRow({ node, depth }) {
    return <TreeRow node={this._tree.getNode(node)} depth={depth}/>;
  }
  render() {
    const { thread, depthLimit } = this.props;
    this._tree = getCallTree(thread);
    const tree = this._tree;
    function visibleRowsFromNode(node, depth) {
      const visible = (depth <= depthLimit);
      if (!visible) {
        return [];
      }
      return tree.getChildren(node).reduce((arr, child) => arr.concat(visibleRowsFromNode(child, depth + 1)),
              [{ node, depth }]);
    }
    const visibleRows = tree.getRoots().reduce((arr, root) => arr.concat(visibleRowsFromNode(root, 0)), []);
    return (
      <VirtualList className='treeView' items={visibleRows}
          renderItem={this.renderRow}
          itemHeight={15}/>
    );
  }
};
export default connect()(TreeView);
