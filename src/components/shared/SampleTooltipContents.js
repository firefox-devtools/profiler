/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { Backtrace } from './Backtrace';
import { getCategoryPairLabel } from 'firefox-profiler/profile-logic/profile-data';
import {
  formatNumber,
  formatMicroseconds,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';
import { ensureExists } from 'firefox-profiler/utils/flow';

import type {
  IndexIntoSamplesTable,
  CategoryList,
  Thread,
  SampleUnits,
  Milliseconds,
  ThreadCPUDeltaUnit,
} from 'firefox-profiler/types';

type Props = {|
  +sampleIndex: IndexIntoSamplesTable,
  +categories: CategoryList,
  +fullThread: Thread,
  +sampleUnits: SampleUnits | void,
  +maxThreadCPUDelta: number,
  +interval: Milliseconds,
|};

/**
 * This class displays the tooltip contents for a given sample. Typically the user
 * will want to know what the function is, and its category.
 */
export class SampleTooltipContents extends React.PureComponent<Props> {
  _getRealInterval(): number {
    const { fullThread, sampleIndex } = this.props;
    const { samples } = fullThread;

    // We don't know the first cpu usage so we can skip it.
    const index = sampleIndex === 0 ? 1 : sampleIndex;
    return samples.time[index] - samples.time[index - 1];
  }

  _getMaxCPU(realInterval: Milliseconds): number {
    const { sampleUnits, maxThreadCPUDelta } = this.props;

    const unit = ensureExists(sampleUnits).threadCPUDelta;
    switch (unit) {
      case 'variable CPU cycles':
        return maxThreadCPUDelta;
      case 'µs':
        return realInterval * 1000;
      case 'ns':
        return realInterval * 1000000;
      default:
        throw new Error('Unexpected threadCPUDelta unit found');
    }
  }

  _getCPUPercentageString(
    cpuUsage: number,
    realInterval: Milliseconds
  ): string {
    const { sampleUnits, interval } = this.props;
    const unit = ensureExists(sampleUnits).threadCPUDelta;
    const maxCPU = this._getMaxCPU(realInterval);

    let cpuUsageRatio;
    let cpuSpikeText;
    switch (unit) {
      case 'variable CPU cycles': {
        // Here, we are finding the interval factor so we can find the CPU usage
        // per ms. This is similar to how we compute the max CPU. In the code
        // below `cpuUsage / intervalFactor` is the CPU per ms. This makes us
        // see the real percentage that we see in the activity graph. Otherwise,
        // the percentage here and in the activity graph could be very different.
        const intervalFactor = realInterval / interval;
        cpuUsageRatio = cpuUsage / intervalFactor / maxCPU;
        // We don't have a way to detect spikes for CPU cycles.
        cpuSpikeText = '';
        break;
      }
      case 'µs':
      case 'ns':
        cpuUsageRatio = cpuUsage / maxCPU;
        cpuSpikeText = cpuUsageRatio > 1 ? ', capped at 100%' : '';
        break;
      default:
        throw new Error('Unexpected threadCPUDelta unit found');
    }

    return `${formatPercent(cpuUsageRatio)}${cpuSpikeText}`;
  }

  _getCPUUsageString(
    cpuUsage: number,
    cpuDeltaUnit: ThreadCPUDeltaUnit
  ): string {
    // It's either µs for timing platforms or 'variable CPU cycles' for Windows.
    const adjustedCPU = cpuDeltaUnit === 'ns' ? cpuUsage / 1000 : cpuUsage;
    const cpuUsageUnit = cpuDeltaUnit === 'ns' ? 'µs' : cpuDeltaUnit;
    return `${formatNumber(adjustedCPU, 2, 3)} ${cpuUsageUnit}`;
  }

  // Get thread CPU usage if it's present in the profile.
  _maybeRenderCpuUsage() {
    const { sampleIndex, fullThread, sampleUnits } = this.props;
    const { samples } = fullThread;
    let cpuUsageContent = null;

    if (sampleIndex === 0 || !samples.threadCPUDelta || !sampleUnits) {
      // We have no CPU usage information.
      return null;
    }

    const cpuUsage = samples.threadCPUDelta[sampleIndex];
    if (cpuUsage !== null) {
      const realIntervalMs = this._getRealInterval();
      const realIntervalUs = realIntervalMs * 1000;
      const percentageText = this._getCPUPercentageString(
        cpuUsage,
        realIntervalMs
      );
      const cpuUsageString = this._getCPUUsageString(
        cpuUsage,
        sampleUnits.threadCPUDelta
      );

      const cpuUsageAndPercentage = `${percentageText} (${cpuUsageString} over ${formatMicroseconds(
        realIntervalUs
      )})`;

      cpuUsageContent = (
        <div className="tooltipDetails">
          <div className="tooltipLabel">CPU Usage:</div>
          <div>{cpuUsageAndPercentage}</div>
        </div>
      );
    }

    return cpuUsageContent;
  }

  render() {
    const { sampleIndex, fullThread, categories } = this.props;
    const { samples, stackTable } = fullThread;
    const stackIndex = samples.stack[sampleIndex];
    if (stackIndex === null) {
      return 'No stack information';
    }
    const categoryIndex = stackTable.category[stackIndex];
    const subcategoryIndex = stackTable.subcategory[stackIndex];
    const categoryColor = categories[categoryIndex].color;

    return (
      <>
        <div className="tooltipDetails">
          <div className="tooltipLabel">Category:</div>
          <div>
            <span
              className={`colored-square category-color-${categoryColor}`}
            />
            {getCategoryPairLabel(categories, categoryIndex, subcategoryIndex)}
          </div>
        </div>
        {this._maybeRenderCpuUsage()}
        <div className="tooltipDetails">
          <div className="tooltipLabel">Stack:</div>
        </div>
        <Backtrace
          maxStacks={20}
          stackIndex={stackIndex}
          thread={fullThread}
          implementationFilter="combined"
        />
      </>
    );
  }
}
