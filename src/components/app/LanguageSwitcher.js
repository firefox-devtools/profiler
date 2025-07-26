/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import { Localized } from '@fluent/react';

import {
  AVAILABLE_LOCALES_TO_LOCALIZED_NAMES,
  AVAILABLE_LOCALES,
} from 'firefox-profiler/app-logic/l10n';
import { useL10n } from 'firefox-profiler/hooks/useL10n';

export function LanguageSwitcher(): React.Node {
  const { primaryLocale, requestL10n } = useL10n();

  const onLocaleChange = React.useCallback(
    (event: SyntheticEvent<HTMLSelectElement>) => {
      requestL10n([event.currentTarget.value]);
    },
    [requestL10n]
  );

  if (!primaryLocale) {
    // We're actually guaranteed primaryLocale is not null, because
    // AppLocalizationProvider doesn't render when it is. This check is mostly
    // so that Flow doesn't warn later.
    return null;
  }

  return (
    <Localized
      id="FooterLinks--languageSwitcher--select"
      attrs={{ title: true }}
    >
      <select
        className="appFooterLinksLanguageSwitcher"
        onChange={onLocaleChange}
        value={primaryLocale}
      >
        {AVAILABLE_LOCALES.map((locale) => (
          <option value={locale} key={locale}>
            {AVAILABLE_LOCALES_TO_LOCALIZED_NAMES[locale] ?? locale}
          </option>
        ))}
      </select>
    </Localized>
  );
}
