/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';
import { Provider } from 'react-redux';
import { UrlManager } from './UrlManager';
import { FooterLinks } from './FooterLinks';
import { ErrorBoundary } from './ErrorBoundary';
import { AppViewRouter } from './AppViewRouter';
import { ProfileLoader } from './ProfileLoader';
import { ServiceWorkerManager } from './ServiceWorkerManager';
import { WindowTitle } from './WindowTitle';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';
import { createBrowserConnection } from 'firefox-profiler/app-logic/browser-connection';

import type { BrowserConnectionStatus } from 'firefox-profiler/app-logic/browser-connection';
import type { Store } from 'firefox-profiler/types';

import './Root.css';

type RootProps = {
  store: Store,
};

type StateProps = {|
  browserConnectionStatus: BrowserConnectionStatus,
|};

import { DragAndDrop } from './DragAndDrop';

export class Root extends PureComponent<RootProps, StateProps> {
  state = {
    browserConnectionStatus: { status: 'WAITING' },
  };

  render() {
    const { store } = this.props;
    const { browserConnectionStatus } = this.state;

    const browserConnection =
      browserConnectionStatus.status === 'ESTABLISHED'
        ? browserConnectionStatus.browserConnection
        : null;

    return (
      <ErrorBoundary message="Uh oh, some error happened in profiler.firefox.com.">
        <Provider store={store}>
          <AppLocalizationProvider>
            <DragAndDrop browserConnection={browserConnection}>
              <UrlManager browserConnectionStatus={browserConnectionStatus}>
                <ServiceWorkerManager />
                <ProfileLoader
                  browserConnectionStatus={browserConnectionStatus}
                />
                <AppViewRouter
                  browserConnectionStatus={browserConnectionStatus}
                />
                <FooterLinks />
                <WindowTitle />
              </UrlManager>
            </DragAndDrop>
          </AppLocalizationProvider>
        </Provider>
      </ErrorBoundary>
    );
  }

  componentDidMount() {
    createBrowserConnection().then((browserConnectionStatus) => {
      this.setState({ browserConnectionStatus });
    });
  }
}
