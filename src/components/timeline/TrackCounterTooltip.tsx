/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { Localized } from '@fluent/react';

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
  KNOWN_LABEL_L10N,
  POWER_LADDER,
  ENERGY_LADDER,
  carbonForBytes,
  carbonForWattHours,
  pickTier,
} from './TrackCounterTooltipFormat';

import type {
  AccumulatedCounterSamples,
  Counter,
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

type ResolverContext = {
  counter: Counter;
  counterIndex: number;
  interval: Milliseconds;
  accumulatedSamples: AccumulatedCounterSamples;
  maxCounterSampleCountPerMs: number;
  committedRange: StartEndRange;
  previewSelection: PreviewSelection | null;
  meta: ProfileMeta;
};

function resolveSource(
  source: CounterTooltipDataSource,
  ctx: ResolverContext
): number | null {
  const { counter, counterIndex, interval } = ctx;
  const { samples } = counter;

  switch (source) {
    case 'count':
      return samples.count[counterIndex];
    case 'rate': {
      const dt =
        counterIndex === 0
          ? interval
          : samples.time[counterIndex] - samples.time[counterIndex - 1];
      return samples.count[counterIndex] / dt;
    }
    case 'cpu-ratio': {
      const dt =
        counterIndex === 0
          ? interval
          : samples.time[counterIndex] - samples.time[counterIndex - 1];
      return samples.count[counterIndex] / dt / ctx.maxCounterSampleCountPerMs;
    }
    case 'accumulated': {
      const { minCount, accumulatedCounts } = ctx.accumulatedSamples;
      return accumulatedCounts[counterIndex] - minCount;
    }
    case 'count-range':
      return ctx.accumulatedSamples.countRange;
    case 'sample-number':
      return samples.number !== undefined ? samples.number[counterIndex] : null;
    case 'selection-total': {
      if (!ctx.previewSelection) {
        return null;
      }
      const [begin, end] = getSampleIndexRangeForSelection(
        samples,
        ctx.previewSelection.selectionStart,
        ctx.previewSelection.selectionEnd
      );
      let sum = 0;
      for (let i = begin; i < end; i++) {
        sum += samples.count[i];
      }
      return sum;
    }
    case 'selection-rate': {
      if (!ctx.previewSelection) {
        return null;
      }
      const span =
        ctx.previewSelection.selectionEnd - ctx.previewSelection.selectionStart;
      if (span <= 0) {
        return null;
      }
      const [begin, end] = getSampleIndexRangeForSelection(
        samples,
        ctx.previewSelection.selectionStart,
        ctx.previewSelection.selectionEnd
      );
      let sum = 0;
      for (let i = begin; i < end; i++) {
        sum += samples.count[i];
      }
      return sum / span;
    }
    case 'committed-range-total': {
      const [begin, end] = getSampleIndexRangeForSelection(
        samples,
        ctx.committedRange.start,
        ctx.committedRange.end
      );
      let sum = 0;
      for (let i = begin; i < end; i++) {
        sum += samples.count[i];
      }
      return sum;
    }
    default:
      throw assertExhaustiveCheck(source);
  }
}

function formatValueRow(
  value: number,
  format: CounterTooltipFormat,
  source: CounterTooltipDataSource,
  label: string,
  key: number,
  ctx: ResolverContext
): React.ReactElement {
  // Normalize the value into the ladder's input unit (watts for power,
  // watt-hours for energy). samples.count[i] is energy in pWh accumulated
  // over the sample's dt; selection-rate is pWh per ms; the range totals
  // are sums of pWh.
  let valueForLadder = value;
  if (format.scale === 'power') {
    if (source === 'count') {
      const dt =
        ctx.counterIndex === 0
          ? ctx.interval
          : ctx.counter.samples.time[ctx.counterIndex] -
            ctx.counter.samples.time[ctx.counterIndex - 1];
      valueForLadder = ((value * 1e-12) / dt) * 1000 * 3600;
    } else if (source === 'selection-rate') {
      valueForLadder = value * 1e-12 * 1000 * 3600;
    }
  } else if (format.scale === 'energy') {
    valueForLadder = value * 1e-12;
  }

  const knownL10nPrefix = KNOWN_LABEL_L10N[label];

  if (format.scale) {
    const ladder = format.scale === 'power' ? POWER_LADDER : ENERGY_LADDER;
    const tier = pickTier(valueForLadder, ladder);
    let carbonGrams = 0;
    if (format.co2 === 'per-watthour' && format.scale === 'energy') {
      carbonGrams = carbonForWattHours(valueForLadder, ctx.meta);
    }

    const formattedValue = formatNumber(
      valueForLadder * tier.multiplier,
      tier.valueSignificantDigits
    );
    const formattedCarbon = formatNumber(
      carbonGrams * tier.carbonMultiplier,
      tier.carbonSignificantDigits
    );

    if (knownL10nPrefix) {
      const vars: { value: string; carbonValue?: string } = {
        value: formattedValue,
      };
      if (format.co2) {
        vars.carbonValue = formattedCarbon;
      }
      return (
        <Localized
          key={key}
          id={knownL10nPrefix + tier.suffix}
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

  if (knownL10nPrefix) {
    const vars: { value: string; carbonValue?: string } = {
      value: formattedValue,
    };
    if (formattedCarbon !== undefined) {
      vars.carbonValue = formattedCarbon;
    }
    return (
      <Localized
        key={key}
        id={knownL10nPrefix}
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

class TrackCounterTooltipImpl extends React.PureComponent<Props> {
  override render() {
    const {
      counter,
      counterIndex,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
      mouseX,
      mouseY,
      interval,
      committedRange,
      previewSelection,
      meta,
    } = this.props;

    const ctx: ResolverContext = {
      counter,
      counterIndex,
      interval,
      accumulatedSamples,
      maxCounterSampleCountPerMs,
      committedRange,
      previewSelection,
      meta,
    };

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
      const value = resolveSource(row.source, ctx);
      if (value === null) {
        return;
      }
      rendered.push(
        formatValueRow(value, row.format, row.source, row.label, i, ctx)
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
