/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import { negotiateLanguages } from '@fluent/langneg';
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { LocalizationProvider, ReactLocalization } from '@fluent/react';
import * as React from 'react';

// Store all translations as a simple object which is available
// synchronously and bundled with the rest of the code.

type Props = {|
  children: React.Node,
|};

const RESOURCES = {
  fr: new FluentResource(
    "intro = &mdash; Application Web pour l'analyse des performances de Firefox"
  ),
  'en-US': new FluentResource(
    'intro = &mdash; Web app for Firefox performance analysis'
  ),
  pl: new FluentResource(
    'intro = Aplikacja internetowa do analizy wydajności przeglądarki Firefox'
  ),
};

// A generator function responsible for building the sequence
// of FluentBundle instances in the order of user's language
// preferences.
function* generateBundles(userLocales) {
  // Choose locales that are best for the user.
  const currentLocales = negotiateLanguages(
    userLocales,
    ['fr', 'en-US', 'pl'],
    {
      defaultLocale: 'en-US',
    }
  );

  for (const locale of currentLocales) {
    const bundle = new FluentBundle(locale);
    bundle.addResource(RESOURCES[locale]);
    yield bundle;
  }
}

// The ReactLocalization instance stores and caches the sequence of generated
// bundles. You can store it in your app's state.
const l10n = new ReactLocalization(generateBundles(navigator.languages));

export class AppLocalizationProvider extends React.PureComponent<Props> {
  render() {
    const { children } = this.props;

    return <LocalizationProvider l10n={l10n}>{children}</LocalizationProvider>;
  }
}
