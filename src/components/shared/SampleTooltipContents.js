/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { Backtrace } from './Backtrace';
import { TooltipDetailSeparator } from '../tooltip/TooltipDetails';
import { getCategoryPairLabel } from 'firefox-profiler/profile-logic/profile-data';
import {
  formatMilliseconds,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';

import type {
  IndexIntoSamplesTable,
  CategoryList,
  Thread,
} from 'firefox-profiler/types';
import type { CpuRatioInTimeRange } from './thread/ActivityGraphFills';

type CPUProps = CpuRatioInTimeRange;

type RestProps = {|
  +sampleIndex: IndexIntoSamplesTable,
  +categories: CategoryList,
  +fullThread: Thread,
|};

type Props = {|
  +cpuRatioInTimeRange: CPUProps | null,
  ...RestProps,
|};

/**
 * Render thread CPU usage if it's present in the profile.
 * This is split to reduce the rerender of the SampleTooltipRestContents component.
 */
class SampleTooltipCPUContents extends React.PureComponent<CPUProps> {
  render() {
    const { cpuRatio, timeRange } = this.props;

    const percentageText = formatPercent(cpuRatio);
    const cpuUsageAndPercentage = `${percentageText} (average over ${formatMilliseconds(
      timeRange
    )})`;

    return (
      <div className="tooltipDetails">
        <div className="tooltipLabel">CPU:</div>
        <div>{cpuUsageAndPercentage}</div>
        <TooltipDetailSeparator />
      </div>
    );
  }
}

/**
 * Render the non-CPU related parts of the SampleTooltipContents.
 */
class SampleTooltipRestContents extends React.PureComponent<RestProps> {
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
        <div className="tooltipDetails">
          <div className="tooltipLabel">Stack:</div>
        </div>
        <Backtrace
          maxStacks={20}
          stackIndex={stackIndex}
          thread={fullThread}
          implementationFilter="combined"
          categories={categories}
        />
      </>
    );
  }
}

/**
 * This class displays the tooltip contents for a given sample. Typically the user
 * will want to know what the function is, and its category.
 */
export class SampleTooltipContents extends React.PureComponent<Props> {
  render() {
    const {
      cpuRatioInTimeRange,
      sampleIndex,
      fullThread,
      categories,
    } = this.props;
    return (
      <>
        {cpuRatioInTimeRange === null ? null : (
          <SampleTooltipCPUContents
            cpuRatio={cpuRatioInTimeRange.cpuRatio}
            timeRange={cpuRatioInTimeRange.timeRange}
          />
        )}
        <SampleTooltipRestContents
          sampleIndex={sampleIndex}
          fullThread={fullThread}
          categories={categories}
        />
      </>
    );
  }
}
