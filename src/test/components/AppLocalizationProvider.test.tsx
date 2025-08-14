/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Localized } from '@fluent/react';

import { render, screen, act } from '@testing-library/react';
import {
  AppLocalizationProvider,
  togglePseudoStrategy,
} from 'firefox-profiler/components/app/AppLocalizationProvider';
import { useL10n } from 'firefox-profiler/hooks/useL10n';

describe('AppLocalizationProvider', () => {
  function setup({
    languages,
    missingTranslation,
  }: Partial<{ languages: string[]; missingTranslation: string[] }> = {}) {
    languages = languages ?? ['en-US'];
    missingTranslation = missingTranslation ?? [];

    jest.spyOn(window.navigator, 'languages', 'get').mockReturnValue(languages);

    const translatedText = (language: string) => `This is ${language} Text`;
    const fetchUrlRe = /\/locales\/(?<language>[^/]+)\/app.ftl$/;
    window.fetchMock
      .catch(404) // catchall
      .get(fetchUrlRe, ({ url }: { url: string }) => {
        const matchUrlResult = fetchUrlRe.exec(url);
        if (matchUrlResult) {
          const { language } = matchUrlResult.groups!;
          if (!missingTranslation.includes(language)) {
            return `test-id = ${translatedText(language)}`;
          }
        }
        return '';
      });

    return { translatedText };
  }

  it('renders children only once the localization is ready', async () => {
    setup();
    render(
      <AppLocalizationProvider>
        <div data-testid="content-test-AppLocalizationProvider" />
      </AppLocalizationProvider>
    );

    expect(
      screen.queryByTestId('content-test-AppLocalizationProvider')
    ).not.toBeInTheDocument();

    expect(
      await screen.findByTestId('content-test-AppLocalizationProvider')
    ).toBeInTheDocument();
  });

  it('fetches the en-US FTL strings and renders them', async () => {
    const { translatedText } = setup();
    render(
      <AppLocalizationProvider>
        <Localized id="test-id">
          <span>Fallback String</span>
        </Localized>
      </AppLocalizationProvider>
    );

    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // Now we're testing the LTR pseudo-localization.
    act(() => {
      togglePseudoStrategy('accented');
    });
    expect(await screen.findByText('Ŧħīş īş ḗḗƞ-ŬŞ Ŧḗḗẋŧ')).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // And now the RTL pseudo-localization.
    act(() => {
      togglePseudoStrategy('bidi');
    });
    expect(await screen.findByText(/⊥ɥıs ıs ǝu-∩S ⊥ǝxʇ/)).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('rtl');

    // Back to no pseudo-localization
    act(() => {
      togglePseudoStrategy(null);
    });
    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');
  });

  it('can switch the language using useL10n hook', async () => {
    const { translatedText } = setup();

    function TestComponent() {
      const { requestL10n } = useL10n();

      return (
        <>
          <Localized id="test-id">
            <span>Fallback String</span>
          </Localized>
          <button
            type="button"
            onClick={() => requestL10n(['de'])}
            data-testid="switch-language"
          >
            Switch to German
          </button>
        </>
      );
    }

    render(
      <AppLocalizationProvider>
        <TestComponent />
      </AppLocalizationProvider>
    );

    // Start with american english
    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'en-US');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');

    // Switch to german
    const switchButton = screen.getByTestId('switch-language');
    act(() => {
      switchButton.click();
    });
    expect(await screen.findByText(translatedText('de'))).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    // $FlowExpectError Our version of flow doesn't know about document.dir
    expect(document.dir).toBe('ltr');
  });

  it('fetches FTL strings for all available locales, but not others', async () => {
    const { translatedText } = setup({
      // At the time of this writing, "de" is available but "und" isn't (and
      // probably won't ever be, because this doesn't exist).
      // Please replace the languages in this test if this changes in the future.
      languages: ['de', 'und'],
    });
    render(
      <AppLocalizationProvider>
        <Localized id="test-id">
          <span>Fallback String</span>
        </Localized>
      </AppLocalizationProvider>
    );

    expect(await screen.findByText(translatedText('de'))).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    expect(window.fetch).toHaveFetched('/locales/de/app.ftl', {
      // @ts-expect-error fetch-mock's TypeScript types for toHaveFetched don't know about `credentials`, not sure why
      credentials: 'include',
      mode: 'no-cors',
    });
    expect(window.fetch).toHaveFetched('/locales/en-US/app.ftl', {
      // @ts-expect-error fetch-mock's TypeScript types for toHaveFetched don't know about `credentials`, not sure why
      credentials: 'include',
      mode: 'no-cors',
    });
    expect(window.fetch).toHaveFetchedTimes(2);
  });

  it('falls back properly on en-US if the primary locale lacks a string', async () => {
    const { translatedText } = setup({
      // At the time of this writing, "de" is available.
      // Please replace the languages in this test if this changes in the future.
      languages: ['de'],
      missingTranslation: ['de'],
    });
    render(
      <AppLocalizationProvider>
        <Localized id="test-id">
          <span>Fallback String</span>
        </Localized>
      </AppLocalizationProvider>
    );

    expect(
      await screen.findByText(translatedText('en-US'))
    ).toBeInTheDocument();
    expect(document.documentElement).toHaveAttribute('lang', 'de');
    expect(window.fetch).toHaveFetched('/locales/de/app.ftl', {
      // @ts-expect-error fetch-mock's TypeScript types for toHaveFetched don't know about `credentials`, not sure why
      credentials: 'include',
      mode: 'no-cors',
    });
    expect(window.fetch).toHaveFetched('/locales/en-US/app.ftl', {
      // @ts-expect-error fetch-mock's TypeScript types for toHaveFetched don't know about `credentials`, not sure why
      credentials: 'include',
      mode: 'no-cors',
    });
    expect(window.fetch).toHaveFetchedTimes(2);
  });
});
