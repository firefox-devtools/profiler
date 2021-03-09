/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { ReactLocalization, Localized } from '@fluent/react';

import { render } from 'firefox-profiler/test/fixtures/testing-library';
import { lazilyParsedBundles } from 'firefox-profiler/app-logic/l10n';
import { AppLocalizationProvider } from 'firefox-profiler/components/app/AppLocalizationProvider';
import {
  getL10nFetchingPhase,
  getLocalization,
  getPrimaryLocale,
  getDirection,
} from 'firefox-profiler/selectors/l10n';
import {
  requestL10n,
  receiveL10n,
  setupLocalization,
} from 'firefox-profiler/actions/l10n';

import { blankStore } from '../fixtures/stores';
import { coerceMatchingShape } from '../../utils/flow';

describe('AppLocalizationProvider', () => {
  afterEach(function() {
    delete window.fetch;
  });

  function setup(language = 'en-US') {
    const store = blankStore();
    const { dispatch, getState } = store;

    const translatedText = `This is ${language} Text`;

    jest
      .spyOn(window.navigator, 'languages', 'get')
      .mockReturnValue([language]);

    const fetch = jest.fn().mockImplementation((fetchUrl: string) => {
      if (fetchUrl === `/locales/${language}/app.ftl`) {
        const response = (({
          ok: true,
          status: 200,
          headers: {
            get: () => 'text/plain',
          },
          text: () => Promise.resolve(`test-id = ${translatedText}`),
        }: any): Response);

        return Promise.resolve(response);
      }
      return Promise.reject(
        coerceMatchingShape<Response>({
          ok: false,
          status: 404,
          statusText: 'Not found',
        })
      );
    });
    (window: any).fetch = fetch;
    return { store, dispatch, getState, translatedText };
  }

  it('changes the state accordingly when the actions are dispatched', () => {
    const { dispatch, getState } = setup();
    expect(getL10nFetchingPhase(getState())).toBe('not-fetching');
    expect(getLocalization(getState())).toEqual(new ReactLocalization([]));
    dispatch(requestL10n());
    expect(getL10nFetchingPhase(getState())).toBe('fetching-ftl');
    const resource = [
      'locale',
      'data-testid = content-test-ApplocalizationProvider',
    ];
    const bundles = lazilyParsedBundles([resource]);
    const testLocalization = new ReactLocalization(bundles);
    dispatch(receiveL10n(testLocalization, 'en-US', 'ltr'));
    expect(getL10nFetchingPhase(getState())).toBe('done-fetching');
    expect(getLocalization(getState())).toEqual(testLocalization);
    expect(getPrimaryLocale(getState())).toEqual('en-US');
    expect(getDirection(getState())).toEqual('ltr');
  });

  it('renders its children', async () => {
    const { store } = setup();
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

  it('fetches the en-US FTL strings and renders them', async () => {
    const { store, dispatch, translatedText } = setup();
    const { findByText } = render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <Localized id="test-id">
            <span>Fallback String</span>
          </Localized>
        </AppLocalizationProvider>
      </Provider>
    );

    expect(await findByText(translatedText)).toBeTruthy();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // Now we're testing the LTR pseudo-localization.
    dispatch(setupLocalization(navigator.languages, 'accented'));
    expect(await findByText('Ŧħīş īş ḗḗƞ-ŬŞ Ŧḗḗẋŧ')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // And now the RTL pseudo-localization.
    dispatch(setupLocalization(navigator.languages, 'bidi'));
    expect(await findByText(/⊥ɥıs ıs ǝu-∩S ⊥ǝxʇ/)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('rtl');
  });
});
