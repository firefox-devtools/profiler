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

import type { Store } from 'firefox-profiler/types';

import './Root.css';

type RootProps = {
  store: Store,
};

import { DragAndDrop } from './DragAndDrop';

export class Root extends PureComponent<RootProps> {
  render() {
    const { store } = this.props;
    return (
      <ErrorBoundary message="Uh oh, some error happened in profiler.firefox.com.">
        <Provider store={store}>
          <DragAndDrop>
            <UrlManager>
              <ServiceWorkerManager />
              <ProfileLoader />
              <AppViewRouter />
              <FooterLinks />
            </UrlManager>
          </DragAndDrop>
        </Provider>
      </ErrorBoundary>
    );
  }
}
