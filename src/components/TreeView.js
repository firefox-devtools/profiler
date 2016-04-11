import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

let TreeView = ({ tree, depthLimit }) => {
  // TODO: don't reconstruct tree if funcStackTable and samples haven't changed
  function renderNode(node, depth) {
    if (depth > depthLimit) {
      return '';
    }
    return '  '.repeat(depth) + node._totalSampleCount + ' ' + node._name + '\n' +
      node._children.map(child => renderNode(child, depth + 1)).join('');
  }
  return (
    <div> { renderNode(tree, 0) } </div>
  );
};
export default connect()(TreeView);
