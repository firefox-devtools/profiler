import React, { PureComponent, PropTypes } from 'react';

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
  constructor(props) {
    super(props);

    this.state = {
      className: null,
    };
    this._updateState(props);
  }

  _updateState(props) {
    getIconForNode(props.node)
      .then(icon => icon && this.setState({
        className: this.props.onDisplayIcon(icon),
      }));
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.node !== this.props.node) {
      this._updateState(nextProps);
    }
  }

  render() {
    return <div className={`treeRowIcon ${this.state.className || ''}`}></div>;
  }
}

NodeIcon.propTypes = {
  node: PropTypes.object.isRequired,
  onDisplayIcon: PropTypes.func.isRequired,
};

export default NodeIcon;
