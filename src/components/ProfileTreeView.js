import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import TreeView from './TreeView';
import { getCallTree } from '../profile-tree';

const ProfileTreeView = ({ thread, depthLimit, interval }) => {
  return (
    <TreeView tree={getCallTree(thread, interval)}
              depthLimit={depthLimit}
              fixedColumns={[
                { propName: 'totalTime', title: 'Running Time' },
                { propName: 'totalTimePercent', title: '' },
                { propName: 'selfTime', title: 'Self' },
              ]}
              mainColumn={{propName:'name', title: ''}} />
  );
}
export default connect()(ProfileTreeView);
