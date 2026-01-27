/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { changeImplementationFilter } from 'firefox-profiler/actions/profile-view';
import { getImplementationFilter } from 'firefox-profiler/selectors/url-state';

import { toValidImplementationFilter } from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './PanelSettingsList.css';
import './StackImplementationSetting.css';

import type { ImplementationFilter } from 'firefox-profiler/types';

type OwnProps = {
  labelL10nId?: string;
};

type StateProps = {
  readonly implementationFilter: ImplementationFilter;
};

type DispatchProps = {
  readonly changeImplementationFilter: typeof changeImplementationFilter;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackImplementationSettingImpl extends PureComponent<Props> {
  _onImplementationFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <label className="photon-label photon-label-micro" htmlFor={htmlId}>
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
        <Localized id={labelL10nId}>
          <span className="photon-label-horiz-padding"></span>
        </Localized>
      </label>
    );
  }

  override render() {
    const { labelL10nId } = this.props;

    return (
      <>
        {labelL10nId ? (
          <span className="stackImplementationSettingLabel">
            <Localized id={labelL10nId} />
          </span>
        ) : null}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-all-frames',
          'combined'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-script',
          'js'
        )}
        {this._renderImplementationRadioButton(
          'StackSettings--implementation-native2',
          'cpp'
        )}
      </>
    );
  }
}

export const StackImplementationSetting = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    implementationFilter: getImplementationFilter(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
  },
  component: StackImplementationSettingImpl,
});
