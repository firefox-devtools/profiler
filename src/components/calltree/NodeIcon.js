/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';

import { getIconClassNameForNode } from '../../reducers/icons';
import actions from '../../actions';

type Props = {
  className: string,
  icon: string,
  iconStartLoading: string => void,
};

class NodeIcon extends PureComponent<Props> {
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
    return <div className={`treeRowIcon ${this.props.className || ''}`} />;
  }
}

NodeIcon.propTypes = {
  className: PropTypes.string,
  icon: PropTypes.string,
  iconStartLoading: PropTypes.func.isRequired,
};

export default connect(
  (state, { node }) => ({
    className: getIconClassNameForNode(state, node),
    icon: node.icon,
  }),
  actions
)(NodeIcon);
