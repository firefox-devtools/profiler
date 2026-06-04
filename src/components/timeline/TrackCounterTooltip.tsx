/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';
import memoize from 'memoize-one';

import explicitConnect from 'firefox-profiler/utils/connect';
import {
  formatBytes,
  formatNumber,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import {
  getCommittedRange,
  getPreviewSelection,
  getProfileInterval,
  getMeta,
} from 'firefox-profiler/selectors/profile';
import { getSampleIndexRangeForSelection } from 'firefox-profiler/profile-logic/profile-data';
import {
  TooltipDetails,
  TooltipDetail,
  TooltipDetailSeparator,
} from 'firefox-profiler/components/tooltip/TooltipDetails';
import { Tooltip } from 'firefox-profiler/components/tooltip/Tooltip';
import { assertExhaustiveCheck } from 'firefox-profiler/utils/types';
import {
  L10N_ID_BY_LABEL_KEY,
  POWER_LADDER,
  ENERGY_LADDER,
  carbonForBytes,
  carbonForWattHours,
  pickTier,
  pwhPerMsToWatts,
  pwhToWh,
} from './TrackCounterTooltipFormat';

import type {
  AccumulatedCounterSamples,
  Counter,
  CounterSamplesTable,
  CounterTooltipDataSource,
  CounterTooltipFormat,
  CounterTooltipRow,
  CssPixels,
  Milliseconds,
  PreviewSelection,
  ProfileMeta,
  StartEndRange,
  State,
} from 'firefox-profiler/types';
import type { ConnectedProps } from 'firefox-profiler/utils/connect';

type OwnProps = {
  readonly counter: Counter;
  readonly counterIndex: number;
  readonly accumulatedSamples: AccumulatedCounterSamples;
  readonly maxCounterSampleCountPerMs: number;
  readonly mouseX: CssPixels;
  readonly mouseY: CssPixels;
};

type StateProps = {
  readonly interval: Milliseconds;
  readonly committedRange: StartEndRange;
  readonly previewSelection: PreviewSelection | null;
  readonly meta: ProfileMeta;
};

type Props = ConnectedProps<OwnProps, StateProps, {}>;

function sumCountOverRange(
  samples: CounterSamplesTable,
  start: Milliseconds,
  end: Milliseconds
): number {
  const [begin, finish] = getSampleIndexRangeForSelection(samples, start, end);
  let sum = 0;
  for (let i = begin; i < finish; i++) {
    sum += samples.count[i];
  }
  return sum;
}

class TrackCounterTooltipImpl extends React.PureComponent<Props> {
  // `memoize-one` only caches the most recent call, but because the args
  // here (`counter.samples`, `previewSelection`, `committedRange`) are
  // reference-stable across renders, the cache survives between them.
  _selectionSum = memoize(
    (samples: CounterSamplesTable, selection: PreviewSelection): number =>
      sumCountOverRange(
        samples,
        selection.selectionStart,
        selection.selectionEnd
      )
  );

  _committedRangeSum = memoize(
    (samples: CounterSamplesTable, range: StartEndRange): number =>
      sumCountOverRange(samples, range.start, range.end)
  );

  _sampleDtMs(): Milliseconds {
    const { counter, counterIndex, interval } = this.props;
    return counterIndex === 0
      ? interval
      : counter.samples.time[counterIndex] -
          counter.samples.time[counterIndex - 1];
  }

  _resolveSource(source: CounterTooltipDataSource): number | null {
    const {
      counter,
      counterIndex,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
      committedRange,
      previewSelection,
    } = this.props;
    const { samples } = counter;

    switch (source) {
      case 'count':
        return samples.count[counterIndex];
      case 'rate':
        return samples.count[counterIndex] / this._sampleDtMs();
      case 'cpu-ratio':
        return (
          samples.count[counterIndex] /
          this._sampleDtMs() /
          maxCounterSampleCountPerMs
        );
      case 'accumulated': {
        const { minCount, accumulatedCounts } = accumulatedSamples;
        return accumulatedCounts[counterIndex] - minCount;
      }
      case 'count-range':
        return accumulatedSamples.countRange;
      case 'sample-number':
        return samples.number !== undefined
          ? samples.number[counterIndex]
          : null;
      case 'selection-total':
        if (!previewSelection) {
          return null;
        }
        return this._selectionSum(samples, previewSelection);
      case 'selection-rate': {
        if (!previewSelection) {
          return null;
        }
        const span =
          previewSelection.selectionEnd - previewSelection.selectionStart;
        if (span <= 0) {
          return null;
        }
        return this._selectionSum(samples, previewSelection) / span;
      }
      case 'committed-range-total':
        return this._committedRangeSum(samples, committedRange);
      default:
        throw assertExhaustiveCheck(source);
    }
  }

  // Normalize a power- or energy-scale row's value into the ladder's input
  // unit (watts for `'power'`, watt-hours for `'energy'`). samples.count[i]
  // is energy in pWh accumulated over the sample's dt; selection-rate is
  // pWh per ms; the range totals are sums of pWh.
  _normalizeForLadder(
    value: number,
    format: CounterTooltipFormat,
    source: CounterTooltipDataSource
  ): number {
    if (format.scale === 'power') {
      if (source === 'count') {
        return pwhPerMsToWatts(value / this._sampleDtMs());
      }
      if (source === 'selection-rate') {
        return pwhPerMsToWatts(value);
      }
      return value;
    }
    if (format.scale === 'energy') {
      return pwhToWh(value);
    }
    return value;
  }

  _formatValueRow(
    value: number,
    format: CounterTooltipFormat,
    source: CounterTooltipDataSource,
    label: string,
    labelKey: string | undefined,
    key: number
  ): React.ReactElement {
    const { meta } = this.props;
    const valueForLadder = this._normalizeForLadder(value, format, source);
    const knownL10nId = labelKey ? L10N_ID_BY_LABEL_KEY[labelKey] : undefined;

    if (format.scale) {
      const ladder = format.scale === 'power' ? POWER_LADDER : ENERGY_LADDER;
      const tier = pickTier(valueForLadder, ladder);
      let carbonGrams = 0;
      if (format.co2 === 'per-watthour' && format.scale === 'energy') {
        carbonGrams = carbonForWattHours(valueForLadder, meta);
      }

      const formattedValue = formatNumber(
        valueForLadder * tier.multiplier,
        tier.valueSignificantDigits
      );
      const formattedCarbon = formatNumber(
        carbonGrams * tier.carbonMultiplier,
        tier.carbonSignificantDigits
      );

      if (knownL10nId) {
        const vars: { value: string; carbonValue?: string } = {
          value: formattedValue,
        };
        if (format.co2) {
          vars.carbonValue = formattedCarbon;
        }
        return (
          <Localized
            key={key}
            id={knownL10nId + tier.suffix}
            vars={vars}
            attrs={{ label: true }}
          >
            <TooltipDetail label={label}>{formattedValue}</TooltipDetail>
          </Localized>
        );
      }

      const valueWithUnit = `${formattedValue} ${tier.unitText}`;
      return (
        <TooltipDetail key={key} label={label}>
          {format.scale === 'energy' && format.co2 === 'per-watthour'
            ? `${valueWithUnit} (${formattedCarbon} ${tier.carbonUnitText})`
            : valueWithUnit}
        </TooltipDetail>
      );
    }

    let formattedValue: string;
    switch (format.unit) {
      case 'bytes':
        formattedValue = formatBytes(value);
        break;
      case 'bytes-per-second':
        // Input arrives in bytes/ms.
        formattedValue = formatBytes(value * 1000);
        break;
      case 'percent':
        formattedValue = formatPercent(value);
        break;
      case 'number':
        formattedValue = formatNumber(value, 2, 0);
        break;
      default:
        throw assertExhaustiveCheck(format.unit);
    }

    let formattedCarbon: string | undefined;
    if (format.co2 === 'per-byte') {
      const bytesForCarbon =
        format.unit === 'bytes-per-second' ? value * 1000 : value;
      formattedCarbon = formatNumber(carbonForBytes(bytesForCarbon));
    }

    if (knownL10nId) {
      const vars: { value: string; carbonValue?: string } = {
        value: formattedValue,
      };
      if (formattedCarbon !== undefined) {
        vars.carbonValue = formattedCarbon;
      }
      return (
        <Localized
          key={key}
          id={knownL10nId}
          vars={vars}
          attrs={{ label: true }}
        >
          <TooltipDetail label={label}>{formattedValue}</TooltipDetail>
        </Localized>
      );
    }

    let displayValue = formattedValue;
    if (format.unit === 'bytes-per-second') {
      displayValue += ' per second';
    }
    if (formattedCarbon !== undefined) {
      displayValue += ` (${formattedCarbon} g CO₂e)`;
    }
    return (
      <TooltipDetail key={key} label={label}>
        {displayValue}
      </TooltipDetail>
    );
  }

  override render() {
    const { counter, mouseX, mouseY, previewSelection } = this.props;

    const hasNonEmptySelection =
      previewSelection !== null &&
      previewSelection.selectionEnd > previewSelection.selectionStart;

    const rendered: React.ReactNode[] = [];
    counter.display.tooltipRows.forEach((row: CounterTooltipRow, i: number) => {
      if (row.type === 'separator') {
        rendered.push(<TooltipDetailSeparator key={i} />);
        return;
      }
      if (row.requiresPreviewSelection && !hasNonEmptySelection) {
        return;
      }
      const value = this._resolveSource(row.source);
      if (value === null) {
        return;
      }
      rendered.push(
        this._formatValueRow(
          value,
          row.format,
          row.source,
          row.label,
          row.labelKey,
          i
        )
      );
    });

    return (
      <Tooltip mouseX={mouseX} mouseY={mouseY}>
        <div className="timelineTrackCounterTooltip">
          <TooltipDetails>{rendered}</TooltipDetails>
        </div>
      </Tooltip>
    );
  }
}

export const TrackCounterTooltip = explicitConnect<OwnProps, StateProps, {}>({
  mapStateToProps: (state: State) => ({
    interval: getProfileInterval(state),
    committedRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
    meta: getMeta(state),
  }),
  component: TrackCounterTooltipImpl,
});
