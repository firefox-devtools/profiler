/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import './FooterLinks.css';

type State = {| hide: boolean |};

export class FooterLinks extends PureComponent<{||}, State> {
  _onClick = () => {
    this.setState({ hide: true });
  };

  state = {
    hide: false,
  };

  render() {
    if (this.state.hide) {
      return null;
    }
    return (
      <div className="appFooterLinks">
        <button
          aria-label="Hide links to legal information"
          title="Hide links to legal information"
          className="appFooterLinksClose"
          type="button"
          onClick={this._onClick}
        >
          ✕
        </button>
        <a
          className="appFooterLinksLink"
          href="https://www.mozilla.org/about/legal/terms/mozilla"
          target="_blank"
          rel="noopener noreferrer"
        >
          Legal
        </a>
        <a
          className="appFooterLinksLink"
          href="https://www.mozilla.org/privacy/websites"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy
        </a>
        <a
          className="appFooterLinksLink"
          href="https://www.mozilla.org/privacy/websites/#cookies"
          target="_blank"
          rel="noopener noreferrer"
        >
          Cookies
        </a>
      </div>
    );
  }
}
