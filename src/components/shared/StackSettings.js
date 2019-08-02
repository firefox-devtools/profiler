/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import {
  changeImplementationFilter,
  changeInvertCallstack,
  changeCallTreeSearchString,
  changeCallTreeSummaryStrategy,
} from '../../actions/profile-view';
import {
  getImplementationFilter,
  getInvertCallstack,
  getCurrentSearchString,
  getCallTreeSummaryStrategy,
} from '../../selectors/url-state';
import PanelSearch from '../shared/PanelSearch';
import {
  toValidImplementationFilter,
  toValidCallTreeSummaryStrategy,
} from '../../profile-logic/profile-data';
import explicitConnect, { type ConnectedProps } from '../../utils/connect';
import { selectedThreadSelectors } from '../../selectors/per-thread';

import './StackSettings.css';

import type {
  ImplementationFilter,
  CallTreeSummaryStrategy,
} from '../../types/actions';

type OwnProps = {|
  +hideInvertCallstack?: true,
  +disableCallTreeSummaryButtons?: true,
|};

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +invertCallstack: boolean,
  +currentSearchString: string,
  +hasJsAllocations: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
  +changeInvertCallstack: typeof changeInvertCallstack,
  +changeCallTreeSearchString: typeof changeCallTreeSearchString,
  +changeCallTreeSummaryStrategy: typeof changeCallTreeSummaryStrategy,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackSettings extends PureComponent<Props> {
  _onImplementationFilterChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeImplementationFilter(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidImplementationFilter(e.currentTarget.value)
    );
  };

  _onCallTreeSummaryStrategyChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeCallTreeSummaryStrategy(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidCallTreeSummaryStrategy(e.currentTarget.value)
    );
  };

  _onInvertCallstackClick = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  };

  _onSearch = (value: string) => {
    this.props.changeCallTreeSearchString(value);
  };

  _renderImplementationRadioButton(
    label: string,
    implementationFilter: ImplementationFilter
  ) {
    return (
      <label className="photon-label photon-label-micro stackSettingsFilterLabel">
        <input
          type="radio"
          className="photon-radio photon-radio-micro stackSettingsFilterInput"
          value={implementationFilter}
          name="stack-settings-filter"
          title="Filter stack frames to a type."
          onChange={this._onImplementationFilterChange}
          checked={this.props.implementationFilter === implementationFilter}
        />
        {label}
      </label>
    );
  }

  _renderCallTreeStrategyRadioButton(
    label: string,
    strategy: CallTreeSummaryStrategy
  ) {
    return (
      <label className="photon-label photon-label-micro stackSettingsFilterLabel">
        <input
          type="radio"
          className="photon-radio photon-radio-micro stackSettingsFilterInput"
          value={strategy}
          name="stack-settings-strategy"
          title="Change how the call tree numerically summarizes the thread"
          onChange={this._onCallTreeSummaryStrategyChange}
          checked={this.props.callTreeSummaryStrategy === strategy}
        />
        {label}
      </label>
    );
  }

  render() {
    const {
      invertCallstack,
      hideInvertCallstack,
      currentSearchString,
      hasJsAllocations,
      disableCallTreeSummaryButtons,
    } = this.props;

    return (
      <div className="stackSettings">
        <ul className="stackSettingsList">
          <li className="stackSettingsListItem stackSettingsFilter">
            {this._renderImplementationRadioButton('All stacks', 'combined')}
            {this._renderImplementationRadioButton('JavaScript', 'js')}
            {this._renderImplementationRadioButton('Native', 'cpp')}
          </li>
          {hasJsAllocations && !disableCallTreeSummaryButtons ? (
            <li className="stackSettingsListItem stackSettingsFilter">
              {this._renderCallTreeStrategyRadioButton('Timing', 'timing')}
              {this._renderCallTreeStrategyRadioButton(
                'JavaScript Allocations',
                'js-allocations'
              )}
            </li>
          ) : null}
          {hideInvertCallstack ? null : (
            <li className="stackSettingsListItem">
              <label className="photon-label photon-label-micro stackSettingsLabel">
                <input
                  type="checkbox"
                  className="photon-checkbox photon-checkbox-micro stackSettingsCheckbox"
                  onChange={this._onInvertCallstackClick}
                  checked={invertCallstack}
                />
                {' Invert call stack'}
              </label>
            </li>
          )}
        </ul>
        <PanelSearch
          className="stackSettingsSearchField"
          label="Filter stacks: "
          title="Only display stacks which contain a function whose name matches this substring"
          currentSearchString={currentSearchString}
          onSearch={this._onSearch}
        />
      </div>
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: state => ({
    invertCallstack: getInvertCallstack(state),
    implementationFilter: getImplementationFilter(state),
    currentSearchString: getCurrentSearchString(state),
    hasJsAllocations: selectedThreadSelectors.getHasJsAllocations(state),
    callTreeSummaryStrategy: getCallTreeSummaryStrategy(state),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
    changeInvertCallstack,
    changeCallTreeSearchString,
    changeCallTreeSummaryStrategy,
  },
  component: StackSettings,
});
