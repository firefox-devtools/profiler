/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';
import { Provider } from 'react-redux';
import { UrlManager } from './UrlManager';
import { FooterLinks } from './FooterLinks';
import {
  NonLocalizedErrorBoundary,
  LocalizedErrorBoundary,
} from './ErrorBoundary';
import { AppViewRouter } from './AppViewRouter';
import { ProfileLoader } from './ProfileLoader';
import { ServiceWorkerManager } from './ServiceWorkerManager';
import { WindowTitle } from './WindowTitle';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';

import { Store } from 'firefox-profiler/types';

import './Root.css';

type RootProps = {
  store: Store;
};

import { DragAndDrop } from './DragAndDrop';

export class Root extends PureComponent<RootProps> {
  override render() {
    const { store } = this.props;
    return (
      <NonLocalizedErrorBoundary message="Uh oh, some unknown error happened in profiler.firefox.com.">
        <Provider store={store}>
          <AppLocalizationProvider>
            <Localized
              id="Root--error-boundary-message"
              attrs={{ message: true }}
            >
              <LocalizedErrorBoundary message="Uh oh, some unknown error happened in profiler.firefox.com.">
                <DragAndDrop>
                  <UrlManager>
                    <ServiceWorkerManager />
                    <ProfileLoader />
                    <AppViewRouter />
                    <FooterLinks />
                    <WindowTitle />
                  </UrlManager>
                </DragAndDrop>
              </LocalizedErrorBoundary>
            </Localized>
          </AppLocalizationProvider>
        </Provider>
      </NonLocalizedErrorBoundary>
    );
  }
}
