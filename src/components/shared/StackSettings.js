/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import {
  changeInvertCallstack,
  changeCallTreeSearchString,
  changeCallTreeSummaryStrategy,
  changeShowUserTimings,
} from 'firefox-profiler/actions/profile-view';
import {
  getInvertCallstack,
  getSelectedTab,
  getShowUserTimings,
  getCurrentSearchString,
} from 'firefox-profiler/selectors/url-state';
import { getProfileUsesMultipleStackTypes } from 'firefox-profiler/selectors/profile';
import { PanelSearch } from './PanelSearch';
import { StackImplementationSetting } from './StackImplementationSetting';

import { toValidCallTreeSummaryStrategy } from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import './PanelSettingsList.css';
import './StackSettings.css';

import type { CallTreeSummaryStrategy } from 'firefox-profiler/types';

type OwnProps = {|
  +hideInvertCallstack?: true,
|};

type StateProps = {|
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +selectedTab: string,
  +allowSwitchingStackType: boolean,
  +invertCallstack: boolean,
  +showUserTimings: boolean,
  +currentSearchString: string,
  +hasUsefulTimingSamples: boolean,
  +hasUsefulJsAllocations: boolean,
  +hasUsefulNativeAllocations: boolean,
  +canShowRetainedMemory: boolean,
|};

type DispatchProps = {|
  +changeInvertCallstack: typeof changeInvertCallstack,
  +changeShowUserTimings: typeof changeShowUserTimings,
  +changeCallTreeSearchString: typeof changeCallTreeSearchString,
  +changeCallTreeSummaryStrategy: typeof changeCallTreeSummaryStrategy,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackSettingsImpl extends PureComponent<Props> {
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
      allowSwitchingStackType,
      invertCallstack,
      selectedTab,
      showUserTimings,
      hideInvertCallstack,
      currentSearchString,
      hasUsefulTimingSamples,
      hasUsefulJsAllocations,
      hasUsefulNativeAllocations,
      canShowRetainedMemory,
      callTreeSummaryStrategy,
    } = this.props;

    const hasAllocations = hasUsefulJsAllocations || hasUsefulNativeAllocations;

    return (
      <div className="stackSettings">
        <ul className="panelSettingsList">
          {allowSwitchingStackType ? (
            <li className="panelSettingsListItem">
              <StackImplementationSetting />
            </li>
          ) : null}
          {hasAllocations ? (
            <li className="panelSettingsListItem">
              <label>
                <Localized id="StackSettings--use-data-source-label" />{' '}
                <select
                  className="stackSettingsSelect"
                  onChange={this._onCallTreeSummaryStrategyChange}
                  value={callTreeSummaryStrategy}
                >
                  {hasUsefulTimingSamples
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-timing',
                        'timing'
                      )
                    : null}
                  {hasUsefulJsAllocations
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
                  {hasUsefulNativeAllocations
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
                  {hasUsefulNativeAllocations
                    ? this._renderCallTreeStrategyOption(
                        'StackSettings--call-tree-strategy-native-deallocations-sites',
                        'native-deallocations-sites'
                      )
                    : null}
                </select>
              </label>
            </li>
          ) : null}
          {hideInvertCallstack && selectedTab !== 'stack-chart' ? null : (
            <li className="panelSettingsListItem">
              {hideInvertCallstack ? null : (
                <label className="photon-label photon-label-micro photon-label-horiz-padding">
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
              )}
              {selectedTab !== 'stack-chart' ? null : (
                <label className="photon-label photon-label-micro photon-label-horiz-padding">
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
              )}
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
  mapStateToProps: (state) => ({
    allowSwitchingStackType: getProfileUsesMultipleStackTypes(state),
    invertCallstack: getInvertCallstack(state),
    selectedTab: getSelectedTab(state),
    showUserTimings: getShowUserTimings(state),
    currentSearchString: getCurrentSearchString(state),
    hasUsefulTimingSamples:
      selectedThreadSelectors.getHasUsefulTimingSamples(state),
    hasUsefulJsAllocations:
      selectedThreadSelectors.getHasUsefulJsAllocations(state),
    hasUsefulNativeAllocations:
      selectedThreadSelectors.getHasUsefulNativeAllocations(state),
    canShowRetainedMemory:
      selectedThreadSelectors.getCanShowRetainedMemory(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
  }),
  mapDispatchToProps: {
    changeInvertCallstack,
    changeCallTreeSearchString,
    changeCallTreeSummaryStrategy,
    changeShowUserTimings,
  },
  component: StackSettingsImpl,
});
