/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import { Localized } from '@fluent/react';
import memoize from 'memoize-one';

import { averageIntensity } from '@tgwf/co2';

import explicitConnect from 'firefox-profiler/utils/connect';
import { formatNumber } from 'firefox-profiler/utils/format-numbers';
import {
  getCommittedRange,
  getPreviewSelection,
  getProfileInterval,
  getMeta,
} from 'firefox-profiler/selectors/profile';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';

import { TooltipDetails, TooltipDetail } from './TooltipDetails';

import type {
  Counter,
  Milliseconds,
  PreviewSelection,
  StartEndRange,
  ProfileMeta,
} from 'firefox-profiler/types';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {
  counter: Counter,
  counterSampleIndex: number,
};

type StateProps = {
  interval: Milliseconds,
  meta: ProfileMeta,
  committedRange: StartEndRange,
  previewSelection: PreviewSelection,
};

type Props = ConnectedProps<OwnProps, StateProps, {}>;

class TooltipTrackPowerImpl extends React.PureComponent<Props> {
  // This compute the sum of the power in the range. This returns a value in Wh.
  _computePowerSumForRange(start: Milliseconds, end: Milliseconds): number {
    const { counter } = this.props;
    const samples = counter.samples;
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

  _computeCO2eFromPower(power: number): number {
    // total energy Wh to kWh
    const energy = power / 1000;
    const intensity =
      this.props.meta.gramsOfCO2ePerKWh || averageIntensity.data.WORLD;
    return energy * intensity;
  }

  _computePowerSumForCommittedRange = memoize(
    ({ start, end }: StartEndRange): number =>
      this._computePowerSumForRange(start, end)
  );

  _formatPowerValue(
    power: number,
    l10nIdKiloUnit,
    l10nIdUnit,
    l10nIdMilliUnit,
    l10nIdMicroUnit
  ): Localized {
    let value, l10nId, carbonValue;
    const carbon = this._computeCO2eFromPower(power);
    if (power > 1000) {
      value = formatNumber(power / 1000, 3);
      carbonValue = formatNumber(carbon / 1000, 2);
      l10nId = l10nIdKiloUnit;
    } else if (power > 1) {
      value = formatNumber(power, 3);
      carbonValue = formatNumber(carbon, 3);
      l10nId = l10nIdUnit;
    } else if (power === 0) {
      value = 0;
      carbonValue = 0;
      l10nId = l10nIdUnit;
    } else if (power < 0.001 && l10nIdMicroUnit) {
      value = formatNumber(power * 1000000);
      // Note: even though the power value is expressed in µWh, the carbon value
      // is still expressed in mg.
      carbonValue = formatNumber(carbon * 1000);
      l10nId = l10nIdMicroUnit;
    } else {
      value = formatNumber(power * 1000);
      carbonValue = formatNumber(carbon * 1000);
      l10nId = l10nIdMilliUnit;
    }

    return (
      <Localized
        id={l10nId}
        vars={{ value, carbonValue }}
        attrs={{ label: true }}
      >
        <TooltipDetail label="">{value}</TooltipDetail>
      </Localized>
    );
  }

  maybeRenderForPreviewSelection(
    previewSelection
  ): React.ChildrenArray<React.Element<typeof TooltipDetail> | null> | null {
    if (!previewSelection.hasSelection) {
      return null;
    }

    const { selectionStart, selectionEnd } = previewSelection;
    const selectionRange = selectionEnd - selectionStart;

    if (selectionRange === 0) {
      return null;
    }

    const powerSumForPreviewRange = this._computePowerSumForRange(
      selectionStart,
      selectionEnd
    );

    return (
      // $FlowExpectError our version of Flow doesn't understand Fragments very well.
      <>
        {this._formatPowerValue(
          powerSumForPreviewRange,
          'TrackPower--tooltip-energy-carbon-used-in-preview-kilowatthour',
          'TrackPower--tooltip-energy-carbon-used-in-preview-watthour',
          'TrackPower--tooltip-energy-carbon-used-in-preview-milliwatthour',
          'TrackPower--tooltip-energy-carbon-used-in-preview-microwatthour'
        )}
        {this._formatPowerValue(
          (1000 /* ms -> s */ * 3600 /* s -> h */ * powerSumForPreviewRange) /
            selectionRange,
          'TrackPower--tooltip-average-power-kilowatt',
          'TrackPower--tooltip-average-power-watt',
          'TrackPower--tooltip-average-power-milliwatt'
        )}
      </>
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
    const samples = counter.samples;

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
            'TrackPower--tooltip-power-kilowatt',
            'TrackPower--tooltip-power-watt',
            'TrackPower--tooltip-power-milliwatt'
          )}
          {this.maybeRenderForPreviewSelection(previewSelection)}
          {this._formatPowerValue(
            this._computePowerSumForCommittedRange(committedRange),
            'TrackPower--tooltip-energy-carbon-used-in-range-kilowatthour',
            'TrackPower--tooltip-energy-carbon-used-in-range-watthour',
            'TrackPower--tooltip-energy-carbon-used-in-range-milliwatthour',
            'TrackPower--tooltip-energy-carbon-used-in-range-microwatthour'
          )}
        </TooltipDetails>
      </div>
    );
  }
}

export const TooltipTrackPower = explicitConnect<OwnProps, StateProps, {}>({
  mapStateToProps: (state) => ({
    interval: getProfileInterval(state),
    meta: getMeta(state),
    committedRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
  }),
  component: TooltipTrackPowerImpl,
});
