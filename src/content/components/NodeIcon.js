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

    this._mounted = false;

    this.state = {
      className: null,
    };

    this._updateState(props);
  }

  componentWillMount() {
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.node !== this.props.node) {
      this._updateState(nextProps);
    }
  }

  _updateState(props) {
    getIconForNode(props.node)
      .then(icon => {
        if (icon && props.node === this.props.node) {
          const className = props.onDisplayIcon(icon);
          if (this._mounted) {
            this.setState({ className });
          } else {
            this.state = { className };
          }
        }
      });
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
