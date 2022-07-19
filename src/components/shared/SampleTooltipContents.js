/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import * as React from 'react';

import { Backtrace } from './Backtrace';
import { TooltipDetailSeparator } from '../tooltip/TooltipDetails';
import {
  getCategoryPairLabel,
  getFuncNamesAndOriginsForPath,
  convertStackToCallNodeAndCategoryPath,
} from 'firefox-profiler/profile-logic/profile-data';
import {
  formatMilliseconds,
  formatPercent,
} from 'firefox-profiler/utils/format-numbers';

import type {
  ImplementationFilter,
  IndexIntoSamplesTable,
  CategoryList,
  Thread,
} from 'firefox-profiler/types';
import type { CpuRatioInTimeRange } from './thread/ActivityGraphFills';
import { ensureExists } from '../../utils/flow';

type CPUProps = CpuRatioInTimeRange;

type RestProps = {|
  +sampleIndex: IndexIntoSamplesTable,
  +categories: CategoryList,
  +rangeFilteredThread: Thread,
  +implementationFilter: ImplementationFilter,
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
      </div>
    );
  }
}

/**
 * Render the non-CPU related parts of the SampleTooltipContents.
 */
class SampleTooltipRestContents extends React.PureComponent<RestProps> {
  render() {
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
  render() {
    const {
      cpuRatioInTimeRange,
      sampleIndex,
      rangeFilteredThread,
      categories,
      implementationFilter,
    } = this.props;

    const { samples, stackTable } = rangeFilteredThread;
    const stackIndex = samples.stack[sampleIndex];
    const hasSamples = samples.length > 0 && stackTable.length > 1;
    let hasStack = false;
    if (hasSamples) {
      const stack = getFuncNamesAndOriginsForPath(
        convertStackToCallNodeAndCategoryPath(
          rangeFilteredThread,
          ensureExists(stackIndex)
        ),
        rangeFilteredThread
      );
      hasStack = stack.length > 1 || stack[0].funcName !== '(root)';
    }

    return (
      <>
        {cpuRatioInTimeRange === null ? null : (
          <SampleTooltipCPUContents
            cpuRatio={cpuRatioInTimeRange.cpuRatio}
            timeRange={cpuRatioInTimeRange.timeRange}
          />
        )}
        {hasStack && cpuRatioInTimeRange !== null ? (
          <TooltipDetailSeparator />
        ) : null}
        {!hasStack ? null : (
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
