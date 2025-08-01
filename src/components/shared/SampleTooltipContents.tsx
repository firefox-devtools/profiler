/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { Backtrace } from './Backtrace';
import { TooltipDetailSeparator } from '../tooltip/TooltipDetails';
import {
  getCategoryPairLabel,
  isSampleWithNonEmptyStack,
} from 'firefox-profiler/profile-logic/profile-data';
import { getFormattedTimelineValue } from 'firefox-profiler/profile-logic/committed-ranges';
import {
  formatMilliseconds,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';

import {
  ImplementationFilter,
  IndexIntoSamplesTable,
  CategoryList,
  Thread,
  Milliseconds,
} from 'firefox-profiler/types';
import { CpuRatioInTimeRange } from './thread/ActivityGraphFills';

type CPUProps = CpuRatioInTimeRange;

type RestProps = {
  readonly sampleIndex: IndexIntoSamplesTable;
  readonly categories: CategoryList;
  readonly rangeFilteredThread: Thread;
  readonly implementationFilter: ImplementationFilter;
};

type Props = RestProps & {
  readonly cpuRatioInTimeRange: CPUProps | null;
  readonly sampleIndex: IndexIntoSamplesTable | null;
  readonly zeroAt: Milliseconds;
  readonly profileTimelineUnit: string;
  readonly interval: Milliseconds;
};

/**
 * Render thread CPU usage if it's present in the profile.
 * This is split to reduce the rerender of the SampleTooltipRestContents component.
 */
class SampleTooltipCPUContents extends React.PureComponent<CPUProps> {
  override render() {
    const { cpuRatio, timeRange } = this.props;

    const percentageText = formatPercent(cpuRatio);
    const cpuUsageAndPercentage = `${percentageText} (average over ${formatMilliseconds(
      timeRange
    )})`;

    return (
      <div className="tooltipDetails">
        <div className="tooltipLabel">CPU:</div>
        <div>{cpuUsageAndPercentage}</div>
      </div>
    );
  }
}

/**
 * Render the non-CPU related parts of the SampleTooltipContents.
 */
class SampleTooltipRestContents extends React.PureComponent<RestProps> {
  override render() {
    const {
      sampleIndex,
      rangeFilteredThread,
      categories,
      implementationFilter,
    } = this.props;
    const { samples, stackTable } = rangeFilteredThread;
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
          thread={rangeFilteredThread}
          implementationFilter={implementationFilter}
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
  override render() {
    const {
      cpuRatioInTimeRange,
      sampleIndex,
      rangeFilteredThread,
      categories,
      implementationFilter,
      zeroAt,
      profileTimelineUnit,
      interval,
    } = this.props;

    let hasStack = false;
    let formattedSampleTime = null;
    if (sampleIndex !== null) {
      const { samples } = rangeFilteredThread;
      const sampleTime = samples.time[sampleIndex];

      hasStack = isSampleWithNonEmptyStack(sampleIndex, rangeFilteredThread);

      formattedSampleTime = getFormattedTimelineValue(
        sampleTime - zeroAt,
        profileTimelineUnit,
        // Make sure that we show enough precision for the given sample interval.
        interval / 10
      );
    }

    return (
      <>
        {formattedSampleTime !== null ? (
          <div className="tooltipDetails">
            <div className="tooltipLabel">Sampled at:</div>
            <div>{formattedSampleTime}</div>
          </div>
        ) : null}
        {cpuRatioInTimeRange === null ? null : (
          <SampleTooltipCPUContents
            cpuRatio={cpuRatioInTimeRange.cpuRatio}
            timeRange={cpuRatioInTimeRange.timeRange}
          />
        )}
        {hasStack && cpuRatioInTimeRange !== null ? (
          <TooltipDetailSeparator />
        ) : null}
        {!hasStack || sampleIndex === null ? null : (
          <SampleTooltipRestContents
            sampleIndex={sampleIndex}
            rangeFilteredThread={rangeFilteredThread}
            categories={categories}
            implementationFilter={implementationFilter}
          />
        )}
      </>
    );
  }
}
