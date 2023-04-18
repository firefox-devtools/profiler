/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { changeImplementationFilter } from 'firefox-profiler/actions/profile-view';
import { getImplementationFilter } from 'firefox-profiler/selectors/url-state';

import { toValidImplementationFilter } from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import { getProfileUsesMultipleStackTypes } from 'firefox-profiler/selectors/profile';

import './PanelSettingsList.css';

import type { ImplementationFilter } from 'firefox-profiler/types';

type OwnProps = {|
  labelL10nId?: string,
|};

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +allowSwitchingStackType: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackImplementationSettingImpl extends PureComponent<Props> {
  _onImplementationFilterChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  };

  _renderImplementationRadioButton(
    labelL10nId: string,
    implementationFilter: ImplementationFilter
  ) {
    const htmlId = `implementation-radio-${implementationFilter}`;
    return (
      <>
        <Localized id={labelL10nId} attrs={{ title: true }}>
          <input
            type="radio"
            className="photon-radio photon-radio-micro"
            value={implementationFilter}
            id={htmlId}
            onChange={this._onImplementationFilterChange}
            checked={this.props.implementationFilter === implementationFilter}
          />
        </Localized>
        <Localized id={labelL10nId} attrs={{ title: true }}>
          <label
            className="photon-label photon-label-micro photon-label-horiz-padding"
            htmlFor={htmlId}
          ></label>
        </Localized>
      </>
    );
  }

  render() {
    const { allowSwitchingStackType, labelL10nId } = this.props;

    return allowSwitchingStackType ? (
      <li className="panelSettingsListItem">
        {labelL10nId ? <Localized id={labelL10nId} /> : null}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-all-frames',
          'combined'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-javascript2',
          'js'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-native2',
          'cpp'
        )}
      </li>
    ) : null;
  }
}

export const StackImplementationSetting = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    implementationFilter: getImplementationFilter(state),
    allowSwitchingStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
  },
  component: StackImplementationSettingImpl,
});
