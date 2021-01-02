/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { render } from '@testing-library/react';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';
import { blankStore } from '../fixtures/stores';
import { Provider } from 'react-redux';
import {
  getIsL10nFetching,
  getLocalization,
} from 'firefox-profiler/selectors/l10n';
import { lazilyParsedBundles } from 'firefox-profiler/app-logic/l10n';
import { requestL10n, receiveL10n } from 'firefox-profiler/actions/l10n';
import { ReactLocalization } from '@fluent/react';

describe('AppLocalizationProvider', () => {
  beforeEach(function() {
    const response = (({
      ok: true,
      status: 200,
      headers: {
        get: () => 'text/plain',
      },
      text: () => Promise.resolve('resolved'),
    }: any): Response);
    window.fetch = jest.fn().mockResolvedValue(response);
  });

  afterEach(function() {
    delete window.fetch;
  });

  it('changes the state accordingly when the actions are dispatched', () => {
    const store = blankStore();
    const { dispatch, getState } = store;

    expect(getIsL10nFetching(getState())).toBeFalsy();
    expect(getLocalization(getState())).toEqual(new ReactLocalization([]));
    dispatch(requestL10n());
    expect(getIsL10nFetching(getState())).toBeTruthy();
    const resource = [
      'locale',
      'data-testid = conten-test-ApplocalizationProvider',
    ];
    const bundles = lazilyParsedBundles([resource]);
    const testLocalization = new ReactLocalization(bundles);
    dispatch(receiveL10n(testLocalization));
    expect(getIsL10nFetching(getState())).toBeFalsy();
    expect(getLocalization(getState())).toEqual(testLocalization);
  });

  it('AppLocalizationProvider renders its children', async () => {
    const store = blankStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <div data-testid="content-test-AppLocalizationProvider" />
        </AppLocalizationProvider>
      </Provider>
    );

    expect(
      getByTestId('content-test-AppLocalizationProvider')
    ).toBeInTheDocument();
  });
});
