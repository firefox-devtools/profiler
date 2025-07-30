/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

// The "call tree strategy" is the listbox that lets you choose between "Timing"
// and various allocation call trees. It is only shown when the profile includes
// allocation data.

import React, { PureComponent } from 'react';
import { Localized } from '@fluent/react';

import { changeCallTreeSummaryStrategy } from 'firefox-profiler/actions/profile-view';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';

import { toValidCallTreeSummaryStrategy } from 'firefox-profiler/profile-logic/profile-data';
import explicitConnect, {
  type ConnectedProps,
} from 'firefox-profiler/utils/connect';

import './PanelSettingsList.css';

import type { CallTreeSummaryStrategy } from 'firefox-profiler/types';

type OwnProps = {
  labelL10nId?: string,
};

type StateProps = {
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy,
  readonly hasUsefulTimingSamples: boolean,
  readonly hasUsefulJsAllocations: boolean,
  readonly hasUsefulNativeAllocations: boolean,
  readonly canShowRetainedMemory: boolean,
};

type DispatchProps = {
  readonly changeCallTreeSummaryStrategy: typeof changeCallTreeSummaryStrategy,
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class CallTreeStrategySettingImpl extends PureComponent<Props> {
  _onCallTreeSummaryStrategyChange = (e: SyntheticEvent<HTMLInputElement>) => {
    this.props.changeCallTreeSummaryStrategy(
      // This function is here to satisfy Flow that we are getting a valid
      // implementation filter.
      toValidCallTreeSummaryStrategy(e.currentTarget.value)
    );
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
      hasUsefulTimingSamples,
      hasUsefulJsAllocations,
      hasUsefulNativeAllocations,
      canShowRetainedMemory,
      callTreeSummaryStrategy,
    } = this.props;

    return (
      <>
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
      </>
    );
  }
}

export const CallTreeStrategySetting = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps,
>({
  mapStateToProps: (state) => ({
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
    changeCallTreeSummaryStrategy,
  },
  component: CallTreeStrategySettingImpl,
});
