/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

/*
 * This file implements a header to be used on top of our content pages. It
 * renders a title as well as links to our github and our home page.
 */

import * as React from 'react';

import { setDataSource } from 'firefox-profiler/actions/profile-view';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './AppHeader.css';

type DispatchProps = {|
  +setDataSource: typeof setDataSource,
|};
type Props = ConnectedProps<{||}, {||}, DispatchProps>;

class AppHeaderImpl extends React.PureComponent<Props> {
  onClick = (e: SyntheticMouseEvent<>) => {
    const { setDataSource } = this.props;
    if (e.ctrlKey || e.metaKey) {
      // The user clearly wanted to open this link in a new tab.
      return;
    }

    e.preventDefault();

    setDataSource('none');
  };

  render() {
    return (
      <header>
        <h1 className="appHeader">
          <span className="appHeaderSlogan">
            <a className="appHeaderLink" href="/" onClick={this.onClick}>
              Firefox Profiler
            </a>
            <span className="appHeaderSubtext">
              {' '}
              &mdash; Web app for Firefox performance analysis
            </span>
          </span>
          <a
            className="appHeaderGithubIcon"
            href="https://github.com/firefox-devtools/profiler"
            target="_blank"
            rel="noopener noreferrer"
            title="Go to our git repository (this opens in a new window)"
          >
            <svg
              width="22"
              height="22"
              className="octicon octicon-mark-github"
              viewBox="0 0 16 16"
              version="1.1"
              aria-label="github"
            >
              <path
                fillRule="evenodd"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
              />
            </svg>
          </a>
        </h1>
      </header>
    );
  }
}

export const AppHeader = explicitConnect<{||}, {||}, DispatchProps>({
  mapDispatchToProps: { setDataSource },
  component: AppHeaderImpl,
});
