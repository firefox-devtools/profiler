/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { render } from 'react-testing-library';

import { getUrlSetupPhase } from '../../selectors/app';
import UrlManager from '../../components/app/UrlManager';
import { blankStore } from '../fixtures/stores';
import { getDataSource } from '../../selectors/url-state';

describe('UrlManager', function() {
  function setup(urlPath: ?string) {
    if (typeof urlPath === 'string') {
      // jsdom doesn't allow us to rewrite window.location. Instead, use the
      // History API to properly set the current location.
      window.history.pushState(undefined, 'profiler.firefox.com', urlPath);
    }
    const store = blankStore();
    const { dispatch, getState } = store;

    const createUrlManager = () =>
      render(
        <Provider store={store}>
          <UrlManager>Contents</UrlManager>
        </Provider>
      );
    return { dispatch, getState, createUrlManager };
  }

  it('sets up the URL', function() {
    const { getState, createUrlManager } = setup();
    expect(getUrlSetupPhase(getState())).toBe('initial-load');
    createUrlManager();
    expect(getUrlSetupPhase(getState())).toBe('loading-profile');
  });

  it('has no data source by default', function() {
    const { getState, createUrlManager } = setup();
    createUrlManager();
    expect(getDataSource(getState())).toMatch('none');
  });

  it('sets the data source to from-addon', function() {
    const { getState, createUrlManager } = setup('/from-addon/');
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();
    expect(getDataSource(getState())).toMatch('from-addon');
  });

  it('redirects from-file back to no data source', function() {
    const { getState, createUrlManager } = setup('/from-file/');
    expect(getDataSource(getState())).toMatch('none');
    createUrlManager();
    expect(getDataSource(getState())).toMatch('none');
  });
});
