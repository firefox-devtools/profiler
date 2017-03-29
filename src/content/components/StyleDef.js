// inspired from https://gist.github.com/jviereck/9a71734afcfe848ddbe2 -- simplified
import React, { PureComponent, PropTypes } from 'react';

export class StyleDef extends PureComponent {
  componentDidMount() {
    this._dom = document.createElement('style');
    this._dom.textContent = this.props.content;
    document.head.appendChild(this._dom);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.content !== this.props.content) {
      this._dom.textContent = this.props.content;
    }
  }

  componentWillUnmount() {
    this._dom.remove();
    this._dom = null;
  }

  render() {
    // The <StyleDef> itself should not appear in the DOM.
    return null;
  }
}

StyleDef.propTypes = {
  content: PropTypes.string.isRequired,
};

export class BackgroundImageStyleDef extends StyleDef {
  render() {
    const content = `
      .${this.props.className} {
        background-image: url(${this.props.url});
      }
    `;
    return <StyleDef content={ content } />;
  }
}

BackgroundImageStyleDef.propTypes = {
  className: PropTypes.string.isRequired,
  url: PropTypes.string.isRequired,
};
