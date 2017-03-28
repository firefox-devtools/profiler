import React, { PureComponent, PropTypes } from 'react';
import DefaultFavicon from '../../../res/default-favicon.svg';

const failedIcons = new Set();

class NodeIcon extends PureComponent {
  constructor(props) {
    super(props);

    this._onIconError = this._onIconError.bind(this);

    this.state = {
      icon: this._getIconForNode(props.node),
    };
  }

  _updateState(props) {
    this.setState({
      icon: this._getIconForNode(props.node),
    });
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.node !== this.props.node) {
      this._updateState(nextProps);
    }
  }

  _onIconError(failedUrl) {
    failedIcons.add(failedUrl);
    this._updateState(this.props);
  }

  _getIconForNode(node) {
    if (!node.icon) {
      return null;
    }
    return failedIcons.has(node.icon) ? DefaultFavicon : node.icon;
  }

  render() {
    return <img
            src={this.state.icon}
            referrerPolicy='no-referrer'
            className='treeRowIcon'
            onError={ e => this._onIconError(e.target.src) } />;
  }
}

NodeIcon.propTypes = {
  node: PropTypes.object.isRequired,
};

export default NodeIcon;
