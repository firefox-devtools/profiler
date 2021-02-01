/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import explicitConnect from 'firefox-profiler/utils/connect';
import { LocalizationProvider } from '@fluent/react';
import * as React from 'react';
import type { Localization } from 'firefox-profiler/types';
import { setupLocalization } from 'firefox-profiler/actions/l10n';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';
import { getLocalization } from 'firefox-profiler/selectors/l10n';

type StateProps = {|
  +localization: Localization,
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

  render() {
    const { children, localization } = this.props;
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
  }),
  mapDispatchToProps: {
    setupLocalization,
  },
  component: AppLocalizationProviderImpl,
});
