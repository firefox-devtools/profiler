import React, { PureComponent, PropTypes } from 'react';
import StyleDef from './StyleDef';
import DefaultFavicon from '../../../res/default-favicon.svg';

const icons = new Map();

function getIconForNode(node) {
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
      resolve(DefaultFavicon);
    };
  });

  icons.set(node.icon, result);
  return result;
}

function sanitizeCSSClass(className) {
  return className.replace(/[/:.+>< ~()#,]/g, '_');
}

class NodeIcon extends PureComponent {
  constructor(props) {
    super(props);

    this.state = {
      icon: null,
    };
    this._updateState(props);
  }

  _updateState(props) {
    getIconForNode(props.node)
      .then(icon => this.setState({ icon }));
  }

  componentWillReceiveProps(nextProps) {
    if (nextProps.node !== this.props.node) {
      this._updateState(nextProps);
    }
  }

  render() {
    if (!this.state.icon) {
      return <div className='treeRowIcon'></div>;
    }

    const className = sanitizeCSSClass(this.state.icon);
    const stylesheet = `
      .${className} {
        background-image: url(${this.state.icon});
      }
    `;
    return <div className={`treeRowIcon ${className}`}>
             <StyleDef content={ stylesheet } />
           </div>;
  }
}

NodeIcon.propTypes = {
  node: PropTypes.object.isRequired,
};

export default NodeIcon;
