/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';

import { Localized } from '@fluent/react';

import { requestL10n } from 'firefox-profiler/actions/l10n';
import { getPrimaryLocale } from 'firefox-profiler/selectors/l10n';
import {
  AVAILABLE_LOCALES_TO_LOCALIZED_NAMES,
  AVAILABLE_LOCALES,
} from 'firefox-profiler/app-logic/l10n';
import explicitConnect from 'firefox-profiler/utils/connect';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {};
type StateProps = {
  readonly primaryLocale: string | null;
};
type DispatchProps = {
  requestL10n: typeof requestL10n;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;
class LanguageSwitcherImpl extends React.PureComponent<Props> {
  _onLocaleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    this.props.requestL10n([event.currentTarget.value]);
  };

  override render() {
    const { primaryLocale } = this.props;
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
          onChange={this._onLocaleChange}
          value={primaryLocale}
        >
          {AVAILABLE_LOCALES.map((locale) => (
            <option value={locale} key={locale}>
              {(AVAILABLE_LOCALES_TO_LOCALIZED_NAMES as Record<string, string>)[
                locale
              ] ?? locale}
            </option>
          ))}
        </select>
      </Localized>
    );
  }
}

export const LanguageSwitcher = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  component: LanguageSwitcherImpl,
  mapStateToProps: (state) => ({
    primaryLocale: getPrimaryLocale(state),
  }),
  mapDispatchToProps: { requestL10n },
});
