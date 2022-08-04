/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Localized } from '@fluent/react';
import memoize from 'memoize-one';

import explicitConnect from 'firefox-profiler/utils/connect';
import { formatNumber } from 'firefox-profiler/utils/format-numbers';
import {
  getCommittedRange,
  getPreviewSelection,
  getProfileInterval,
} from 'firefox-profiler/selectors/profile';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';

import { TooltipDetails, TooltipDetail } from './TooltipDetails';

import type {
  Counter,
  Milliseconds,
  PreviewSelection,
  StartEndRange,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {|
  counter: Counter,
  counterSampleIndex: number,
|};

type StateProps = {|
  interval: Milliseconds,
  committedRange: StartEndRange,
  previewSelection: PreviewSelection,
|};

type Props = ConnectedProps<OwnProps, StateProps, {||}>;

class TooltipTrackPowerImpl extends React.PureComponent<Props> {
  // This compute the sum of the power in the range. This returns a value in Wh.
  _computePowerSumForRange(start: Milliseconds, end: Milliseconds): number {
    const { counter } = this.props;
    const samples = counter.sampleGroups[0].samples;
    const [beginIndex, endIndex] = getSampleIndexRangeForSelection(
      samples,
      start,
      end
    );

    let sum = 0;
    for (
      let counterSampleIndex = beginIndex;
      counterSampleIndex < endIndex;
      counterSampleIndex++
    ) {
      sum += samples.count[counterSampleIndex]; // picowatt-hour;
    }
    return sum * 1e-12;
  }

  _computePowerSumForCommittedRange = memoize(
    ({ start, end }: StartEndRange): number =>
      this._computePowerSumForRange(start, end)
  );

  _computePowerSumForPreviewRange = memoize(
    ({
      selectionStart,
      selectionEnd,
    }: {
      +hasSelection: true,
      +selectionStart: number,
      +selectionEnd: number,
    }): number => this._computePowerSumForRange(selectionStart, selectionEnd)
  );

  _formatPowerValue(power: number, l10nIdUnit, l10nIdMilliUnit): Localized {
    let value, l10nId;
    if (power > 1) {
      value = formatNumber(power, 3);
      l10nId = l10nIdUnit;
    } else if (power === 0) {
      value = 0;
      l10nId = l10nIdUnit;
    } else {
      value = formatNumber(power * 1000);
      l10nId = l10nIdMilliUnit;
    }

    return (
      <Localized id={l10nId} vars={{ value }} attrs={{ label: true }}>
        <TooltipDetail label="">{value}</TooltipDetail>
      </Localized>
    );
  }

  render() {
    const {
      counter,
      counterSampleIndex,
      interval,
      committedRange,
      previewSelection,
    } = this.props;
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

    return (
      <div className="timelineTrackPowerTooltip">
        <TooltipDetails>
          {this._formatPowerValue(
            power,
            'TrackPower--tooltip-power-watt',
            'TrackPower--tooltip-power-milliwatt'
          )}
          {previewSelection.hasSelection
            ? this._formatPowerValue(
                this._computePowerSumForPreviewRange(previewSelection),
                'TrackPower--tooltip-energy-used-in-preview-watthour',
                'TrackPower--tooltip-energy-used-in-preview-milliwatthour'
              )
            : null}
          {this._formatPowerValue(
            this._computePowerSumForCommittedRange(committedRange),
            'TrackPower--tooltip-energy-used-in-range-watthour',
            'TrackPower--tooltip-energy-used-in-range-milliwatthour'
          )}
        </TooltipDetails>
      </div>
    );
  }
}

export const TooltipTrackPower = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state) => ({
    interval: getProfileInterval(state),
    committedRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
  }),
  component: TooltipTrackPowerImpl,
});
