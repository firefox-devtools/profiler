/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { Localized } from '@fluent/react';
import * as React from 'react';

import './ProfileRootMessage.css';

type Props = {
  +title?: string,
  +additionalMessage: React.Node,
  +showLoader: boolean,
  +showBackHomeLink: boolean,
  +children: React.Node,
};

export class ProfileRootMessage extends React.PureComponent<Props> {
  render() {
    const { children, additionalMessage, showLoader, showBackHomeLink, title } =
      this.props;
    return (
      <div className="rootMessageContainer">
        <div className="rootMessage">
          <Localized id="ProfileRootMessage--title">
            <h1 className="rootMessageTitle">Firefox Profiler</h1>
          </Localized>
          {title ? <h2>{title}</h2> : null}
          <div className="rootMessageText">
            <p>{children}</p>
          </div>
          {additionalMessage ? (
            <div className="rootMessageAdditional">{additionalMessage}</div>
          ) : null}
          {showBackHomeLink ? (
            <div className="rootBackHomeLink">
              <a href="/">
                <Localized id="ProfileRootMessage--additional">
                  Back to home
                </Localized>
              </a>
            </div>
          ) : null}
          {showLoader ? (
            <div className="loading">
              <div className="loading-div loading-div-1 loading-row-1" />
              <div className="loading-div loading-div-2 loading-row-2" />
              <div className="loading-div loading-div-3 loading-row-3" />
              <div className="loading-div loading-div-4 loading-row-3" />
              <div className="loading-div loading-div-5 loading-row-4" />
              <div className="loading-div loading-div-6 loading-row-4" />
              <div className="loading-div loading-div-7 loading-row-4" />
              <div className="loading-div loading-div-8 loading-row-4" />
              <div className="loading-div loading-div-9 loading-row-4" />
              <div className="loading-div loading-div-10 loading-row-4" />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
}
