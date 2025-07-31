/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import explicitConnect from 'firefox-profiler/utils/connect';
import { LocalizationProvider, ReactLocalization } from '@fluent/react';
import { negotiateLanguages } from '@fluent/langneg';

import * as React from 'react';
import {
  getLocalization,
  getPrimaryLocale,
  getDirection,
  getRequestedLocales,
  getPseudoStrategy,
} from 'firefox-profiler/selectors/l10n';
import { requestL10n, receiveL10n } from 'firefox-profiler/actions/l10n';
import {
  AVAILABLE_LOCALES,
  DEFAULT_LOCALE,
  fetchMessages,
  lazilyParsedBundles,
  getLocaleDirection,
} from 'firefox-profiler/app-logic/l10n';

import { ensureExists } from 'firefox-profiler/utils/flow';
import type { Localization } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type FetchProps = {
  +requestedLocales: null | string[],
  +pseudoStrategy: null | 'accented' | 'bidi',
  +receiveL10n: typeof receiveL10n,
};

/**
 * This class is responsible for handling the changes of the requested locales
 * and the pseudo strategy, including fetching the FTL files and generating the
 * Fluent bundles. Afterwards it will change the state with the negotiated
 * information and the bundles so that AppLocalizationProvider can supply them
 * to the rest of the app.
 */
class AppLocalizationFetcher extends React.PureComponent<FetchProps> {
  /**
   * This function is called when this component is rendered, that is at mount
   * time and when either requestedLocales or pseudoStrategy changes.
   * It takes the locales available and generates l10n bundles for those locales.
   * Finally it dispatches the translations and updates the state.
   */
  async _setupLocalization() {
    const { requestedLocales, pseudoStrategy, receiveL10n } = this.props;

    if (!requestedLocales) {
      return;
    }

    // Setting defaultLocale to `en-US` means that it will always be the
    // last fallback locale, thus making sure the UI is always working.
    const languages = negotiateLanguages(requestedLocales, AVAILABLE_LOCALES, {
      defaultLocale: DEFAULT_LOCALE,
    });

    // It's important to note that `languages` is the result of the negotiation,
    // and can be different than `locales`.
    // languages may contain the requested locale as well as some fallback
    // locales. Also `negotiateLanguages` always adds the default locale if it's
    // not present.
    // Some examples:
    // * navigator.locales == ['fr', 'en-US', 'en'] => languages == ['fr-FR', 'en-US', 'en-GB']
    // * navigator.locales == ['fr'] => languages == ['fr-FR', 'en-US']
    // Because our primary locale is en-US it's not useful to go past it and
    // fetch more locales than necessary, so let's slice to that entry.
    const indexOfDefaultLocale = languages.indexOf(DEFAULT_LOCALE); // Guaranteed to be positive
    const localesToFetch = languages.slice(0, indexOfDefaultLocale + 1);
    const fetchedMessages = await Promise.all(
      localesToFetch.map(fetchMessages)
    );
    const bundles = lazilyParsedBundles(fetchedMessages, pseudoStrategy);
    const localization = new ReactLocalization(bundles);

    const primaryLocale = languages[0];
    const direction = getLocaleDirection(primaryLocale, pseudoStrategy);
    receiveL10n(localization, primaryLocale, direction);
  }

  componentDidMount() {
    this._setupLocalization();
  }

  componentDidUpdate() {
    this._setupLocalization();
  }

  render() {
    return null;
  }
}

type InitProps = {
  +requestL10n: typeof requestL10n,
  +requestedLocales: null | string[],
};

/**
 * This component is responsible for initializing the locales as well as
 * persisting the current locale to localStorage.
 */
class AppLocalizationInit extends React.PureComponent<InitProps> {
  componentDidMount() {
    const { requestL10n } = this.props;
    requestL10n(this._getPersistedLocale() ?? navigator.languages);
  }

  componentDidUpdate() {
    this._persistCurrentLocale();
  }

  _getPersistedLocale(): string[] | null {
    let strPreviouslyRequestedLocales;
    try {
      strPreviouslyRequestedLocales = localStorage.getItem('requestedLocales');
    } catch (err) {
      console.warn(
        'We got an error while trying to retrieve the previously requested locale. Cookies might be blocked in this browser.',
        err
      );
    }

    if (strPreviouslyRequestedLocales) {
      try {
        const previouslyRequestedLocales = JSON.parse(
          strPreviouslyRequestedLocales
        );
        if (
          Array.isArray(previouslyRequestedLocales) &&
          previouslyRequestedLocales.length
        ) {
          return previouslyRequestedLocales;
        }

        console.warn(
          `The stored locale information (${strPreviouslyRequestedLocales}) looks incorrect.`
        );
      } catch (e) {
        console.warn(
          `We got an error when trying to parse the previously stored locale information (${strPreviouslyRequestedLocales}).`
        );
      }
    }

    return null;
  }

  _persistCurrentLocale() {
    const { requestedLocales } = this.props;
    if (!requestedLocales) {
      return;
    }

    try {
      localStorage.setItem(
        'requestedLocales',
        JSON.stringify(requestedLocales)
      );
    } catch (e) {
      console.warn(
        'We got an error when trying to save the current requested locale. We may run in private mode.',
        e
      );
    }
  }

  render() {
    return null;
  }
}

type ProviderStateProps = {
  +requestedLocales: null | string[],
  +pseudoStrategy: null | 'accented' | 'bidi',
  +localization: Localization,
  +primaryLocale: string | null,
  +direction: 'ltr' | 'rtl',
};
type ProviderOwnProps = {
  children: React.Node,
};
type ProviderDispatchProps = {
  +requestL10n: typeof requestL10n,
  +receiveL10n: typeof receiveL10n,
};

type ProviderProps = ConnectedProps<
  ProviderOwnProps,
  ProviderStateProps,
  ProviderDispatchProps,
>;

/**
 * This component is responsible for providing the fluent localization data to
 * the components. It also updates the locale attributes on the document.
 * Moreover it delegates to AppLocalizationInit and AppLocalizationFetcher the
 * handling of initialization, persisting and fetching the locales information.
 */
class AppLocalizationProviderImpl extends React.PureComponent<ProviderProps> {
  componentDidMount() {
    this._updateLocalizationDocumentAttribute();
  }

  componentDidUpdate() {
    this._updateLocalizationDocumentAttribute();
  }

  _updateLocalizationDocumentAttribute() {
    const { primaryLocale, direction } = this.props;
    if (!primaryLocale) {
      // The localization isn't ready.
      return;
    }

    ensureExists(document.documentElement).setAttribute('dir', direction);
    ensureExists(document.documentElement).setAttribute('lang', primaryLocale);
  }

  render() {
    const {
      primaryLocale,
      children,
      localization,
      requestedLocales,
      pseudoStrategy,
      receiveL10n,
      requestL10n,
    } = this.props;
    return (
      <>
        <AppLocalizationInit
          requestL10n={requestL10n}
          requestedLocales={requestedLocales}
        />
        <AppLocalizationFetcher
          requestedLocales={requestedLocales}
          pseudoStrategy={pseudoStrategy}
          receiveL10n={receiveL10n}
        />
        {/* if primaryLocale is null, the localization isn't ready */}
        {primaryLocale ? (
          <LocalizationProvider l10n={localization}>
            {children}
          </LocalizationProvider>
        ) : null}
      </>
    );
  }
}
export const AppLocalizationProvider = explicitConnect<
  ProviderOwnProps,
  ProviderStateProps,
  ProviderDispatchProps,
>({
  mapStateToProps: (state) => ({
    localization: getLocalization(state),
    primaryLocale: getPrimaryLocale(state),
    direction: getDirection(state),
    requestedLocales: getRequestedLocales(state),
    pseudoStrategy: getPseudoStrategy(state),
  }),
  mapDispatchToProps: {
    requestL10n,
    receiveL10n,
  },
  component: AppLocalizationProviderImpl,
});
