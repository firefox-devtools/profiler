import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';

import { getIconClassNameForNode } from '../reducers/app';
import actions from '../actions';

const icons = new Map();

function getIconForNode(node) {
  if (!node.icon) {
    return Promise.resolve(null);
  }

  if (icons.has(node.icon)) {
    return icons.get(node.icon);
  }

  const result = new Promise(resolve => {
    const image = new Image();
    image.src = node.icon;
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      resolve(node.icon);
    };
    image.onerror = () => {
      resolve(null);
    };
  });

  icons.set(node.icon, result);
  return result;
}

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
