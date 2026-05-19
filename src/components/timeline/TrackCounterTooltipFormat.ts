/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { co2, averageIntensity } from '@tgwf/co2';

import type { ProfileMeta } from 'firefox-profiler/types';

// Maps recognized English labels to their Fluent message IDs. Labels not in
// this map render verbatim. For auto-scaled rows, the value is a Fluent ID
// prefix; the ladder tier's suffix is appended at render time.
export const KNOWN_LABEL_L10N: { [label: string]: string } = {
  // Memory
  'relative memory at this time':
    'TrackMemoryGraph--relative-memory-at-this-time',
  'memory range in graph': 'TrackMemoryGraph--memory-range-in-graph',
  'allocations and deallocations since the previous sample':
    'TrackMemoryGraph--allocations-and-deallocations-since-the-previous-sample',
  // Process CPU
  CPU: 'TrackProcessCPUGraph--cpu',
  // Bandwidth
  'Transfer speed for this sample': 'TrackBandwidthGraph--speed',
  'read/write operations since the previous sample':
    'TrackBandwidthGraph--read-write-operations-since-the-previous-sample',
  'Data transferred up to this time':
    'TrackBandwidthGraph--cumulative-bandwidth-at-this-time',
  'Data transferred in the visible range':
    'TrackBandwidthGraph--total-bandwidth-in-graph',
  'Data transferred in the current selection':
    'TrackBandwidthGraph--total-bandwidth-in-range',
  // Power - prefixes; the auto-scale ladder appends the unit suffix.
  Power: 'TrackPower--tooltip-power',
  'Energy used in the current selection':
    'TrackPower--tooltip-energy-carbon-used-in-preview',
  'Average power in the current selection': 'TrackPower--tooltip-average-power',
  'Energy used in the visible range':
    'TrackPower--tooltip-energy-carbon-used-in-range',
};

let _co2: InstanceType<typeof co2> | null = null;
function getCo2(): InstanceType<typeof co2> {
  if (_co2 === null) {
    _co2 = new co2({ model: 'swd' });
  }
  return _co2;
}

// Bytes → CO₂e in grams. The 'device' grid intensity is zeroed so we don't
// double-count energy that the power track already attributes to the device.
export function carbonForBytes(bytes: number): number {
  const co2eq = getCo2().perByteTrace(bytes, false, {
    gridIntensity: { device: 0 },
  });
  return typeof co2eq.co2 === 'number' ? co2eq.co2 : co2eq.co2.total;
}

// Watt-hours → CO₂e in grams.
export function carbonForWattHours(
  wattHours: number,
  meta: ProfileMeta
): number {
  const intensity = meta.gramsOfCO2ePerKWh || averageIntensity.data.WORLD;
  return (wattHours / 1000) * intensity;
}

export type AutoScaleTier = {
  // The first tier whose threshold the value meets (or, for the last tier,
  // falls below) is chosen.
  threshold: number;
  // Applied to the input value to produce the displayed value.
  multiplier: number;
  // Applied to the carbon value (in grams) for the displayed unit.
  carbonMultiplier: number;
  // Appended to the row's Fluent ID prefix to pick the per-unit message.
  suffix: string;
  // Used when the row's label has no matching Fluent message.
  unitText: string;
  carbonUnitText: string;
  valueSignificantDigits: number;
  carbonSignificantDigits: number;
};

export const POWER_LADDER: AutoScaleTier[] = [
  {
    threshold: 1000,
    multiplier: 1 / 1000,
    carbonMultiplier: 1 / 1000,
    suffix: '-kilowatt',
    unitText: 'kW',
    carbonUnitText: 'kg CO₂e',
    valueSignificantDigits: 3,
    carbonSignificantDigits: 2,
  },
  {
    threshold: 1,
    multiplier: 1,
    carbonMultiplier: 1,
    suffix: '-watt',
    unitText: 'W',
    carbonUnitText: 'g CO₂e',
    valueSignificantDigits: 3,
    carbonSignificantDigits: 3,
  },
  {
    threshold: 0.001,
    multiplier: 1000,
    carbonMultiplier: 1000,
    suffix: '-milliwatt',
    unitText: 'mW',
    carbonUnitText: 'mg CO₂e',
    valueSignificantDigits: 2,
    carbonSignificantDigits: 2,
  },
  {
    threshold: -Infinity,
    multiplier: 1000000,
    carbonMultiplier: 1000,
    suffix: '-microwatt',
    unitText: 'µW',
    carbonUnitText: 'mg CO₂e',
    valueSignificantDigits: 2,
    carbonSignificantDigits: 2,
  },
];

export const ENERGY_LADDER: AutoScaleTier[] = [
  {
    threshold: 1000,
    multiplier: 1 / 1000,
    carbonMultiplier: 1 / 1000,
    suffix: '-kilowatthour',
    unitText: 'kWh',
    carbonUnitText: 'kg CO₂e',
    valueSignificantDigits: 3,
    carbonSignificantDigits: 2,
  },
  {
    threshold: 1,
    multiplier: 1,
    carbonMultiplier: 1,
    suffix: '-watthour',
    unitText: 'Wh',
    carbonUnitText: 'g CO₂e',
    valueSignificantDigits: 3,
    carbonSignificantDigits: 3,
  },
  {
    threshold: 0.001,
    multiplier: 1000,
    carbonMultiplier: 1000,
    suffix: '-milliwatthour',
    unitText: 'mWh',
    carbonUnitText: 'mg CO₂e',
    valueSignificantDigits: 2,
    carbonSignificantDigits: 2,
  },
  {
    threshold: -Infinity,
    multiplier: 1000000,
    carbonMultiplier: 1000,
    suffix: '-microwatthour',
    unitText: 'µWh',
    carbonUnitText: 'mg CO₂e',
    valueSignificantDigits: 2,
    carbonSignificantDigits: 2,
  },
];

export function pickTier(
  value: number,
  ladder: AutoScaleTier[]
): AutoScaleTier {
  for (const tier of ladder) {
    if (Math.abs(value) >= tier.threshold) {
      return tier;
    }
  }
  return ladder[ladder.length - 1];
}
