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

import React, { PureComponent } from 'react';

type StyleDefProps = {
  readonly content: string;
};

export class StyleDef extends PureComponent<StyleDefProps> {
  _dom: HTMLStyleElement | null;

  override componentDidMount() {
    const dom = document.createElement('style');
    dom.textContent = this.props.content;
    const documentHead = document.head;
    if (documentHead) {
      documentHead.appendChild(dom);
      this._dom = dom;
    }
  }

  override componentDidUpdate(prevProps: StyleDefProps) {
    const dom = this._dom;
    if (prevProps.content !== this.props.content && dom) {
      dom.textContent = this.props.content;
    }
  }

  override componentWillUnmount() {
    const dom = this._dom;
    if (dom) {
      dom.remove();
      this._dom = null;
    }
  }

  override render() {
    // The <StyleDef> itself should not appear in the DOM.
    return null;
  }
}

type BackgroundImageStyleDefProps = {
  readonly className: string;
  readonly url: string;
};

export class BackgroundImageStyleDef extends PureComponent<BackgroundImageStyleDefProps> {
  override render() {
    const content = `
      .${this.props.className} {
        background-image: url(${this.props.url});
      }
    `;
    return <StyleDef content={content} />;
  }
}
