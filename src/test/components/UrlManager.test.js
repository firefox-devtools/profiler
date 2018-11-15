/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { mount } from 'enzyme';

import { getIsUrlSetupDone } from '../../reducers/app';
import UrlManager from '../../components/app/UrlManager';
import { blankStore } from '../fixtures/stores';
import { getDataSource } from '../../reducers/url-state';

describe('UrlManager', function() {
  function setup(urlPath: ?string) {
    if (typeof urlPath === 'string') {
      // jsdom doesn't allow us to rewrite window.location. Instead, use the
      // History API to properly set the current location.
      window.history.pushState(undefined, 'perf.html', urlPath);
    }
    const store = blankStore();
    const { dispatch, getState } = store;

    const createUrlManager = () =>
      mount(
        <Provider store={store}>
          <UrlManager>Contents</UrlManager>
        </Provider>
      );
    return { dispatch, getState, createUrlManager };
  }

  it('sets up the URL', function() {
    const { getState, createUrlManager } = setup();
    expect(getIsUrlSetupDone(getState())).toBe(false);
    createUrlManager();
    expect(getIsUrlSetupDone(getState())).toBe(true);
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
