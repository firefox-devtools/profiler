import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';

let TreeRow = ({ node, depth }) => {
  return (<div className='treeRow'>
      <span className='treeRowCol0 treeRowCol'>{ node.totalTime }</span>
      <span className='treeRowCol1 treeRowCol' style={{ marginLeft: `${depth * 10}px` }}>{ node.name }</span>
  </div>);
};
export default TreeRow;
