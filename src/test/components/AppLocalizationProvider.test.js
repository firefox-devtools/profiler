/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { Provider } from 'react-redux';
import { ReactLocalization, Localized } from '@fluent/react';

import { render, screen } from '@testing-library/react';
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
  afterEach(function () {
    delete window.fetch;
  });

  function setup({
    languages,
    missingTranslation,
  }: $Shape<{| languages: string[], missingTranslation: string[] |}> = {}) {
    languages = languages ?? ['en-US'];
    missingTranslation = missingTranslation ?? [];

    const store = blankStore();
    const { dispatch, getState } = store;

    jest.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);

    const translatedText = (language) => `This is ${language} Text`;
    const fetchUrlRe = /^\/locales\/(?<language>[^/]+)\/app.ftl$/;
    const fetch = jest.fn().mockImplementation((fetchUrl: string) => {
      const matchUrlResult = fetchUrlRe.exec(fetchUrl);
      if (matchUrlResult) {
        // $FlowExpectError Our Flow doesn't know about named groups.
        const { language } = matchUrlResult.groups;
        const response = (({
          ok: true,
          status: 200,
          headers: {
            get: () => 'text/plain',
          },
          text: () =>
            Promise.resolve(
              missingTranslation.includes(language)
                ? ``
                : `test-id = ${translatedText(language)}`
            ),
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

  it(`renders children only once the localization is ready`, async () => {
    const { store } = setup();
    render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <div data-testid="content-test-AppLocalizationProvider" />
        </AppLocalizationProvider>
      </Provider>
    );

    expect(
      screen.queryByTestId('content-test-AppLocalizationProvider')
    ).not.toBeInTheDocument();

    expect(
      await screen.findByTestId('content-test-AppLocalizationProvider')
    ).toBeInTheDocument();
  });

  it('fetches the en-US FTL strings and renders them', async () => {
    const { store, dispatch, translatedText } = setup();
    render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <Localized id="test-id">
            <span>Fallback String</span>
          </Localized>
        </AppLocalizationProvider>
      </Provider>
    );

    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // Now we're testing the LTR pseudo-localization.
    dispatch(setupLocalization(navigator.languages, 'accented'));
    expect(await screen.findByText('Ŧħīş īş ḗḗƞ-ŬŞ Ŧḗḗẋŧ')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // And now the RTL pseudo-localization.
    dispatch(setupLocalization(navigator.languages, 'bidi'));
    expect(await screen.findByText(/⊥ɥıs ıs ǝu-∩S ⊥ǝxʇ/)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('rtl');
  });

  it('fetches FTL strings for all available locales, but not others', async () => {
    const { store, translatedText } = setup({
      // At the time of this  writing, "de" is available but "und" isn't (and
      // probably won't ever be, because this doesn't exist).
      // Please replace the languages in this test if this changes in the future.
      languages: ['de', 'und'],
    });
    render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <Localized id="test-id">
            <span>Fallback String</span>
          </Localized>
        </AppLocalizationProvider>
      </Provider>
    );

    expect(await screen.findByText(translatedText('de'))).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    expect(window.fetch).toBeCalledWith('/locales/de/app.ftl');
    expect(window.fetch).toBeCalledWith('/locales/en-US/app.ftl');
    expect(window.fetch).toBeCalledTimes(2);
  });

  it('falls back properly on en-US if the primary locale lacks a string', async () => {
    const { store, translatedText } = setup({
      // At the time of this  writing, "de" is available.
      // Please replace the languages in this test if this changes in the future.
      languages: ['de'],
      missingTranslation: ['de'],
    });
    render(
      <Provider store={store}>
        <AppLocalizationProvider>
          <Localized id="test-id">
            <span>Fallback String</span>
          </Localized>
        </AppLocalizationProvider>
      </Provider>
    );

    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    expect(window.fetch).toBeCalledWith('/locales/de/app.ftl');
    expect(window.fetch).toBeCalledWith('/locales/en-US/app.ftl');
    expect(window.fetch).toBeCalledTimes(2);
  });
});
