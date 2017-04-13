import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';

import { getIconClassNameForNode } from '../reducers/icons';
import actions from '../actions';

class NodeIcon extends PureComponent {
  constructor(props) {
    super(props);
    if (props.icon) {
      props.iconStartLoading(props.icon);
    }
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.icon) {
      nextProps.iconStartLoading(nextProps.icon);
    }
  }

  render() {
    return <div className={`treeRowIcon ${this.props.className || ''}`}></div>;
  }
}

NodeIcon.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.string,
  iconStartLoading: PropTypes.func.isRequired,
};

export default connect((state, { node }) => ({
  className: getIconClassNameForNode(state, node),
  icon: node.icon,
}), actions)(NodeIcon);
