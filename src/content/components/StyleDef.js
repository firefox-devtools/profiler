/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// inspired from https://gist.github.com/jviereck/9a71734afcfe848ddbe2 -- simplified
//
// Because JSX isn't nice with CSS content because of the braces, we use a
// component to make this a lot easier.
// This component is extremely simple: especially there is no deduplication like
// the initial code tried to do. We think it's better to include it only when
// needed with some simple logic than having a complex code to detect
// duplication.


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
