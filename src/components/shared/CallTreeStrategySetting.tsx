/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The "call tree strategy" is the listbox that lets you choose between "Timing"
// and various allocation call trees. It is only shown when the profile includes
// allocation data.

import { PureComponent } from 'react';
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
  labelL10nId?: string;
};

type StateProps = {
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly availableCallTreeSummaryStrategies: CallTreeSummaryStrategy[];
};

type DispatchProps = {
  readonly changeCallTreeSummaryStrategy: typeof changeCallTreeSummaryStrategy;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

const STRATEGY_L10N_IDS: Record<CallTreeSummaryStrategy, string> = {
  timing: 'StackSettings--call-tree-strategy-timing',
  'js-allocations': 'StackSettings--call-tree-strategy-js-allocations',
  'native-retained-allocations':
    'StackSettings--call-tree-strategy-native-retained-allocations',
  'native-allocations': 'StackSettings--call-tree-native-allocations',
  'native-deallocations-memory':
    'StackSettings--call-tree-strategy-native-deallocations-memory',
  'native-deallocations-sites':
    'StackSettings--call-tree-strategy-native-deallocations-sites',
};

class CallTreeStrategySettingImpl extends PureComponent<Props> {
  _onCallTreeSummaryStrategyChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    this.props.changeCallTreeSummaryStrategy(
      toValidCallTreeSummaryStrategy(e.currentTarget.value)
    );
  };

  override render() {
    const { availableCallTreeSummaryStrategies, callTreeSummaryStrategy } =
      this.props;

    return (
      <>
        <label>
          <Localized id="StackSettings--use-data-source-label" />{' '}
          <select
            className="stackSettingsSelect"
            onChange={this._onCallTreeSummaryStrategyChange}
            value={callTreeSummaryStrategy}
          >
            {availableCallTreeSummaryStrategies.map((strategy) => (
              <Localized
                id={STRATEGY_L10N_IDS[strategy]}
                attrs={{ title: true }}
                key={strategy}
              >
                <option value={strategy}></option>
              </Localized>
            ))}
          </select>
        </label>
      </>
    );
  }
}

export const CallTreeStrategySetting = explicitConnect<
  OwnProps,
  StateProps,
  DispatchProps
>({
  mapStateToProps: (state) => ({
    availableCallTreeSummaryStrategies:
      selectedThreadSelectors.getAvailableCallTreeSummaryStrategies(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
  }),
  mapDispatchToProps: {
    changeCallTreeSummaryStrategy,
  },
  component: CallTreeStrategySettingImpl,
});
