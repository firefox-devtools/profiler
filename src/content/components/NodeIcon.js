import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';

import { getIconClassNameForNode } from '../reducers/icons';
import actions from '../actions';

class NodeIcon extends PureComponent {
  render() {
    return <div className={`treeRowIcon ${this.props.className || ''}`}></div>;
  }
}

NodeIcon.propTypes = {
  className: PropTypes.string.isRequired,
};

export default connect((state, { node }) => ({
  className: getIconClassNameForNode(state, node),
}), actions)(NodeIcon);
