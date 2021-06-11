/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

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
import { PanelSearch } from './PanelSearch';

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

class StackSettingsImpl extends PureComponent<Props> {
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
    labelL10Id: string,
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
        <Localized id={labelL10Id}></Localized>
      </label>
    );
  }

  _renderCallTreeStrategyOption(
    labelL10nId: string,
    strategy: CallTreeSummaryStrategy
  ) {
    return (
      <Localized id={labelL10nId} attrs={{ title: true }}>
        <option key={strategy} value={strategy}></option>
      </Localized>
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
      callTreeSummaryStrategy,
    } = this.props;

    const hasAllocations = hasJsAllocations || hasNativeAllocations;

    return (
      <div className="stackSettings">
        <ul className="stackSettingsList">
          <li className="stackSettingsListItem stackSettingsFilter">
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-all-stacks',
              'combined'
            )}
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-javascript',
              'js'
            )}
            {this._renderImplementationRadioButton(
              'StackSettings--implementation-native',
              'cpp'
            )}
          </li>
          {hasAllocations ? (
            <li className="stackSettingsListItem stackSettingsFilter">
              <label>
                <Localized id="StackSettings--use-data-source-label" />{' '}
                <select
                  className="stackSettingsSelect"
                  onChange={this._onCallTreeSummaryStrategyChange}
                  value={callTreeSummaryStrategy}
                >
                  {this._renderCallTreeStrategyOption(
                    'StackSettings--call-tree-strategy-timing',
                    'timing'
                  )}
                  {hasJsAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-js-allocations',
                        'js-allocations'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-retained-allocations',
                        'native-retained-allocations'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-native-allocations',
                        'native-allocations'
                      )
                    : null}
                  {canShowRetainedMemory
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-deallocations-memory',
                        'native-deallocations-memory'
                      )
                    : null}
                  {hasNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-deallocations-sites',
                        'native-deallocations-sites'
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
                <Localized
                  id="StackSettings--invert-call-stack"
                  attrs={{ title: true }}
                >
                  <span>Invert call stack</span>
                </Localized>
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
                <Localized id="StackSettings--show-user-timing">
                  Show user timing
                </Localized>
              </label>
            </li>
          )}
        </ul>
        <Localized
          id="StackSettings--panel-search"
          attrs={{ label: true, title: true }}
        >
          <PanelSearch
            className="stackSettingsSearchField"
            label="Filter stacks:"
            title="Only display stacks which contain a function whose name matches this substring"
            currentSearchString={currentSearchString}
            onSearch={this._onSearch}
          />
        </Localized>
      </div>
    );
  }
}

export const StackSettings = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
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
  component: StackSettingsImpl,
});
