/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import explicitConnect from 'firefox-profiler/utils/connect';
import { LocalizationProvider } from '@fluent/react';
import * as React from 'react';
import {
  getLocalization,
  getPrimaryLocale,
  getDirection,
} from 'firefox-profiler/selectors/l10n';
import { setupLocalization } from 'firefox-profiler/actions/l10n';
import { ensureExists } from 'firefox-profiler/utils/flow';
import type { Localization } from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type StateProps = {|
  +localization: Localization,
  +primaryLocale: string | null,
  +direction: 'ltr' | 'rtl',
|};
type OwnProps = {|
  children: React.Node,
|};
type DispatchProps = {|
  +setupLocalization: typeof setupLocalization,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class AppLocalizationProviderImpl extends React.PureComponent<Props> {
  componentDidMount() {
    const { setupLocalization } = this.props;
    const locales = navigator.languages;
    setupLocalization(locales);
  }

  componentDidUpdate() {
    const { primaryLocale, direction } = this.props;
    if (!primaryLocale) {
      // The localization isn't ready.
      return;
    }

    ensureExists(document.documentElement).setAttribute('dir', direction);
    ensureExists(document.documentElement).setAttribute('lang', primaryLocale);
  }

  render() {
    const { primaryLocale, children, localization } = this.props;
    if (!primaryLocale) {
      // The localization isn't ready.
      return null;
    }

    return (
      <LocalizationProvider l10n={localization}>
        {children}
      </LocalizationProvider>
    );
  }
}
export const AppLocalizationProvider = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: state => ({
    localization: getLocalization(state),
    primaryLocale: getPrimaryLocale(state),
    direction: getDirection(state),
  }),
  mapDispatchToProps: {
    setupLocalization,
  },
  component: AppLocalizationProviderImpl,
});
