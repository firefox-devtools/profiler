/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Localized } from '@fluent/react';
import explicitConnect from 'firefox-profiler/utils/connect';
import { formatNumber } from 'firefox-profiler/utils/format-numbers';
import { getProfileInterval } from 'firefox-profiler/selectors/profile';

import type { Counter, Milliseconds } from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  counter: Counter,
  counterSampleIndex: number,
|};

type StateProps = {|
  interval: Milliseconds,
|};

type Props = ConnectedProps<OwnProps, StateProps, {||}>;

class TooltipTrackPowerImpl extends React.PureComponent<Props> {
  render() {
    const { counter, counterSampleIndex, interval } = this.props;
    const samples = counter.sampleGroups[0].samples;

    const powerUsageInPwh = samples.count[counterSampleIndex]; // picowatt-hour
    const sampleTimeDeltaInMs =
      counterSampleIndex === 0
        ? interval
        : samples.time[counterSampleIndex] -
          samples.time[counterSampleIndex - 1];
    const power =
      ((powerUsageInPwh * 1e-12) /* pWh->Wh */ / sampleTimeDeltaInMs) *
      1000 * // ms->s
      3600; // s->h
    let value;
    let l10nId;
    if (power > 1) {
      value = formatNumber(power, 3);
      l10nId = 'TrackPowerGraph--tooltip-power-watt';
    } else if (power === 0) {
      value = 0;
      l10nId = 'TrackPowerGraph--tooltip-power-watt';
    } else {
      value = formatNumber(power * 1000);
      l10nId = 'TrackPowerGraph--tooltip-power-milliwatt';
    }
    return (
      <div className="timelineTrackPowerTooltip">
        <Localized
          id={l10nId}
          vars={{ value }}
          elems={{
            em: <span className="timelineTrackPowerTooltipNumber"></span>,
          }}
        >
          <div className="timelineTrackPowerTooltipLine">
            Power: <em>{value}</em>
          </div>
        </Localized>
      </div>
    );
  }
}

export const TooltipTrackPower = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state) => ({
    interval: getProfileInterval(state),
  }),
  component: TooltipTrackPowerImpl,
});
