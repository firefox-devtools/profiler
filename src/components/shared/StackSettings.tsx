/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import {
  changeInvertCallstack,
  changeCallTreeSearchString,
  changeShowUserTimings,
  changeStackChartSameWidths,
} from 'firefox-profiler/actions/profile-view';
import {
  getInvertCallstack,
  getSelectedTab,
  getShowUserTimings,
  getStackChartSameWidths,
  getCurrentSearchString,
} from 'firefox-profiler/selectors/url-state';
import { getProfileUsesMultipleStackTypes } from 'firefox-profiler/selectors/profile';
import { PanelSearch } from './PanelSearch';
import { StackImplementationSetting } from './StackImplementationSetting';
import { CallTreeStrategySetting } from './CallTreeStrategySetting';

import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import './PanelSettingsList.css';
import './StackSettings.css';

type OwnProps = {
  readonly hideInvertCallstack?: true;
};

type StateProps = {
  readonly selectedTab: string;
  readonly allowSwitchingStackType: boolean;
  readonly invertCallstack: boolean;
  readonly showUserTimings: boolean;
  readonly stackChartSameWidths: boolean;
  readonly currentSearchString: string;
  readonly hasUsefulJsAllocations: boolean;
  readonly hasUsefulNativeAllocations: boolean;
};

type DispatchProps = {
  readonly changeInvertCallstack: typeof changeInvertCallstack;
  readonly changeShowUserTimings: typeof changeShowUserTimings;
  readonly changeCallTreeSearchString: typeof changeCallTreeSearchString;
  readonly changeStackChartSameWidths: typeof changeStackChartSameWidths;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackSettingsImpl extends PureComponent<Props> {
  _onInvertCallstackClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.props.changeInvertCallstack(e.currentTarget.checked);
  };

  _onShowUserTimingsClick = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.props.changeShowUserTimings(e.currentTarget.checked);
  };

  _onUseStackChartSameWidths = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.props.changeStackChartSameWidths(e.currentTarget.checked);
  };

  _onSearch = (value: string) => {
    this.props.changeCallTreeSearchString(value);
  };

  override render() {
    const {
      allowSwitchingStackType,
      invertCallstack,
      selectedTab,
      showUserTimings,
      stackChartSameWidths,
      hideInvertCallstack,
      currentSearchString,
      hasUsefulJsAllocations,
      hasUsefulNativeAllocations,
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
              <CallTreeStrategySetting />
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
                <>
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
                  <label className="photon-label photon-label-micro photon-label-horiz-padding">
                    <input
                      type="checkbox"
                      className="photon-checkbox photon-checkbox-micro stackSettingsCheckbox"
                      onChange={this._onUseStackChartSameWidths}
                      checked={stackChartSameWidths}
                    />
                    <Localized id="StackSettings--use-stack-chart-same-widths">
                      Use the same width for each stack
                    </Localized>
                  </label>
                </>
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
    stackChartSameWidths: getStackChartSameWidths(state),
    currentSearchString: getCurrentSearchString(state),
    hasUsefulJsAllocations:
      selectedThreadSelectors.getHasUsefulJsAllocations(state),
    hasUsefulNativeAllocations:
      selectedThreadSelectors.getHasUsefulNativeAllocations(state),
  }),
  mapDispatchToProps: {
    changeInvertCallstack,
    changeCallTreeSearchString,
    changeShowUserTimings,
    changeStackChartSameWidths,
  },
  component: StackSettingsImpl,
});
