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
  changeShowUserTimings,
} from 'firefox-profiler/actions/profile-view';
import {
  getImplementationFilter,
  getInvertCallstack,
  getSelectedTab,
  getShowUserTimings,
  getCurrentSearchString,
} from 'firefox-profiler/selectors/url-state';
import PanelSearch from 'firefox-profiler/components/shared/PanelSearch';
import {
  toValidImplementationFilter,
  toValidCallTreeSummaryStrategy,
} from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import './StackSettings.css';

import type {
  ImplementationFilter,
  CallTreeSummaryStrategy,
} from 'firefox-profiler/types';

type OwnProps = {|
  +hideInvertCallstack?: true,
  +disableCallTreeSummaryButtons?: true,
|};

type StateProps = {|
  +implementationFilter: ImplementationFilter,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +selectedTab: string,
  +invertCallstack: boolean,
  +showUserTimings: boolean,
  +currentSearchString: string,
  +hasJsAllocations: boolean,
  +hasNativeAllocations: boolean,
  +canShowRetainedMemory: boolean,
|};

type DispatchProps = {|
  +changeImplementationFilter: typeof changeImplementationFilter,
  +changeInvertCallstack: typeof changeInvertCallstack,
  +changeShowUserTimings: typeof changeShowUserTimings,
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

  _onShowUserTimingsClick = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeShowUserTimings(e.currentTarget.checked);
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

  _renderCallTreeStrategyOption(
    label: string,
    strategy: CallTreeSummaryStrategy,
    tooltip: string
  ) {
    return (
      <option title={tooltip} key={strategy} value={strategy}>
        {label}
      </option>
    );
  }

  render() {
    const {
      invertCallstack,
      selectedTab,
      showUserTimings,
      hideInvertCallstack,
      currentSearchString,
      hasJsAllocations,
      hasNativeAllocations,
      canShowRetainedMemory,
      disableCallTreeSummaryButtons,
      callTreeSummaryStrategy,
    } = this.props;

    const hasAllocations = hasJsAllocations || hasNativeAllocations;

    return (
      <div className="stackSettings">
        <ul className="stackSettingsList">
          <li className="stackSettingsListItem stackSettingsFilter">
            {this._renderImplementationRadioButton('All stacks', 'combined')}
            {this._renderImplementationRadioButton('JavaScript', 'js')}
            {this._renderImplementationRadioButton('Native', 'cpp')}
          </li>
          {hasAllocations && !disableCallTreeSummaryButtons ? (
            <li className="stackSettingsListItem stackSettingsFilter">
              <label>
                Summarize:{' '}
                <select
                  className="stackSettingsSelect"
                  onChange={this._onCallTreeSummaryStrategyChange}
                  value={callTreeSummaryStrategy}
                >
                  {this._renderCallTreeStrategyOption(
                    'Timing Data',
                    'timing',
                    'Summarize using sampled stacks of executed code over time'
                  )}
                  {hasJsAllocations
                    ? this._renderCallTreeStrategyOption(
                        'JavaScript Allocations',
                        'js-allocations',
                        'Summarize using bytes of JavaScript allocated (no de-allocations)'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'Retained Memory',
                        'native-retained-allocations',
                        'Summarize using bytes of memory that were allocated, and never freed in the current preview selection'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'Allocated Memory',
                        'native-allocations',
                        'Summarize using bytes of memory allocated'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'Deallocated Memory',
                        'native-deallocations-memory',
                        'Summarize using bytes of memory deallocated, by the site where the memory was allocated'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'Deallocation Sites',
                        'native-deallocations-sites',
                        'Summarize using bytes of memory deallocated, by the site where the memory was deallocated'
                      )
                    : null}
                </select>
              </label>
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
          {selectedTab !== 'stack-chart' ? null : (
            <li className="stackSettingsListItem">
              <label className="photon-label photon-label-micro stackSettingsLabel">
                <input
                  type="checkbox"
                  className="photon-checkbox photon-checkbox-micro stackSettingsCheckbox"
                  onChange={this._onShowUserTimingsClick}
                  checked={showUserTimings}
                />
                {' Show user timing'}
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
    selectedTab: getSelectedTab(state),
    showUserTimings: getShowUserTimings(state),
    implementationFilter: getImplementationFilter(state),
    currentSearchString: getCurrentSearchString(state),
    hasJsAllocations: selectedThreadSelectors.getHasJsAllocations(state),
    hasNativeAllocations: selectedThreadSelectors.getHasNativeAllocations(
      state
    ),
    canShowRetainedMemory: selectedThreadSelectors.getCanShowRetainedMemory(
      state
    ),
    callTreeSummaryStrategy: selectedThreadSelectors.getCallTreeSummaryStrategy(
      state
    ),
  }),
  mapDispatchToProps: {
    changeImplementationFilter,
    changeInvertCallstack,
    changeCallTreeSearchString,
    changeCallTreeSummaryStrategy,
    changeShowUserTimings,
  },
  component: StackSettings,
});
