import React, { PureComponent, PropTypes } from 'react';
import StyleDef from './StyleDef';
import DefaultFavicon from '../../../res/default-favicon.svg';

const failedIcons = new Set();

function sanitizeCSSClass(className) {
  return className.replace(/[/:.+>< ~()#,]/g, '_');
}

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
