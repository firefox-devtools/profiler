/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import memoize from 'memoize-immutable';
import explicitConnect from '../../utils/connect';
import { assertExhaustiveCheck } from '../../utils/flow';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from '../../selectors/per-thread';
import { getSelectedThreadIndex } from '../../selectors/url-state';
import { getCategories } from '../../selectors/profile';
import { getFunctionName } from '../../profile-logic/function-info';
import {
  getFriendlyStackTypeName,
  shouldDisplaySubcategoryInfoForCategory,
} from '../../profile-logic/profile-data';
import CanSelectContent from './CanSelectContent';

import type { ConnectedProps } from '../../utils/connect';
import type {
  ThreadIndex,
  CategoryList,
  CallNodeTable,
  IndexIntoCallNodeTable,
  TracedTiming,
  Milliseconds,
  WeightType,
} from 'firefox-profiler/types';

import type {
  BreakdownByImplementation,
  BreakdownByCategory,
  StackImplementation,
  TimingsForPath,
} from '../../profile-logic/profile-data';
import {
  formatMilliseconds,
  formatPercent,
  formatBytes,
  formatNumber,
} from '../../utils/format-numbers';

type SidebarDetailProps = {|
  +label: string,
  +color?: string,
  +children: React.Node,
|};

function SidebarDetail({ label, children }: SidebarDetailProps) {
  return (
    <React.Fragment>
      <div className="sidebar-label">{label}:</div>
      <div className="sidebar-value">{children}</div>
    </React.Fragment>
  );
}

type ImplementationBreakdownProps = {|
  +breakdown: BreakdownByImplementation,
  +number: number => string,
|};

// This component is responsible for displaying the breakdown data specific to
// the JavaScript engine and native code implementation.
class ImplementationBreakdown extends React.PureComponent<ImplementationBreakdownProps> {
  _orderedImplementations: $ReadOnlyArray<StackImplementation> = [
    'native',
    'interpreter',
    'blinterp',
    'baseline',
    'ion',
    'unknown',
  ];

  render() {
    const { breakdown, number } = this.props;

    const data = [];

    for (const implementation of this._orderedImplementations) {
      const value = breakdown[implementation];
      if (!value && implementation === 'unknown') {
        continue;
      }

      data.push({
        group: getFriendlyStackTypeName(implementation),
        value: value || 0,
      });
    }

    return <Breakdown data={data} number={number} />;
  }
}

type CategoryBreakdownProps = {|
  +breakdown: BreakdownByCategory,
  +categoryList: CategoryList,
  +number: number => string,
|};

class CategoryBreakdown extends React.PureComponent<CategoryBreakdownProps> {
  render() {
    const { breakdown, categoryList, number } = this.props;

    const data = breakdown
      .map((oneCategoryBreakdown, categoryIndex) => {
        const category = categoryList[categoryIndex];
        return {
          category,
          value: oneCategoryBreakdown.entireCategoryValue || 0,
          subcategories: category.subcategories
            .map((subcategoryName, subcategoryIndex) => ({
              name: subcategoryName,
              value:
                oneCategoryBreakdown.subcategoryBreakdown[subcategoryIndex],
            }))
            // sort subcategories in descending order
            .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
            .filter(({ value }) => value),
        };
      })
      // sort categories in descending order
      .sort(({ value: valueA }, { value: valueB }) => valueB - valueA)
      .filter(({ value }) => value);

    // Values can be negative for diffing tracks, that's why we use the absolute
    // value to compute the total time. Indeed even if all values average out,
    // we want to display a sensible percentage.
    const totalTime = data.reduce(
      (accum, { value }) => accum + Math.abs(value),
      0
    );

    return (
      <div className="sidebar-categorylist">
        {data.map(({ category, value, subcategories }) => {
          return (
            <React.Fragment key={category.name}>
              <div className="sidebar-categoryname">
                <span
                  className={`sidebar-color colored-square category-color-${category.color}`}
                  title={category.name}
                />
                {category.name}
              </div>
              <div className="sidebar-categorytiming">
                {number(value)} ({formatPercent(value / totalTime)})
              </div>
              {shouldDisplaySubcategoryInfoForCategory(category)
                ? subcategories.map(({ name, value }) => (
                    <React.Fragment key={name}>
                      <div className="sidebar-subcategoryname">{name}</div>
                      <div className="sidebar-categorytiming">
                        {number(value)} ({formatPercent(value / totalTime)})
                      </div>
                    </React.Fragment>
                  ))
                : null}
            </React.Fragment>
          );
        })}
      </div>
    );
  }
}

type BreakdownProps = {|
  +data: $ReadOnlyArray<{|
    group: string,
    value: Milliseconds,
  |}>,
  number: number => string,
|};

// This stateless component is responsible for displaying the implementation
// breakdown. It also computes the percentage from the total time.
function Breakdown({ data, number }: BreakdownProps) {
  const totalTime = data.reduce((result, item) => result + item.value, 0);

  return data
    .filter(({ value }) => value)
    .map(({ group, value }) => {
      const percentage = Math.round((value / totalTime) * 100);

      return (
        <SidebarDetail label={group} key={group}>
          {number(value)} ({percentage}%)
        </SidebarDetail>
      );
    });
}

type StateProps = {|
  +selectedNodeIndex: IndexIntoCallNodeTable | null,
  +callNodeTable: CallNodeTable,
  +selectedThreadIndex: ThreadIndex,
  +name: string,
  +lib: string,
  +timings: TimingsForPath,
  +categoryList: CategoryList,
  +weightType: WeightType,
  +tracedTiming: TracedTiming | null,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

type WeightDetails = {
  running: string,
  self: string,
  number: (n: number) => string,
};

class CallTreeSidebar extends React.PureComponent<Props> {
  _getWeightDetails = memoize((weightType: WeightType): WeightDetails => {
    switch (weightType) {
      case 'tracing-ms':
        return {
          running: 'Running time',
          self: 'Self Time',
          number: n => formatMilliseconds(n, 3, 1),
        };
      case 'samples':
        return {
          running: 'Running total',
          self: 'Self Total',
          // TODO - L10n the plurals
          number: n => (n === 1 ? '1 sample' : `${formatNumber(n, 0)} samples`),
        };
      case 'bytes':
        return {
          running: 'Running size',
          self: 'Self Size',
          number: n => formatBytes(n),
        };
      default:
        throw assertExhaustiveCheck(weightType, 'Unhandled WeightType.');
    }
  });

  render() {
    const {
      selectedNodeIndex,
      name,
      lib,
      timings,
      categoryList,
      weightType,
      tracedTiming,
    } = this.props;
    const {
      forPath: { selfTime, totalTime },
      forFunc: { selfTime: selfTimeForFunc, totalTime: totalTimeForFunc },
      rootTime,
    } = timings;

    if (selectedNodeIndex === null) {
      return (
        <div className="sidebar sidebar-calltree">
          Select a node to display some information about it.
        </div>
      );
    }

    const { number, running, self } = this._getWeightDetails(weightType);

    const totalTimePercent = Math.round((totalTime.value / rootTime) * 100);
    const selfTimePercent = Math.round((selfTime.value / rootTime) * 100);
    const totalTimeForFuncPercent = Math.round(
      (totalTimeForFunc.value / rootTime) * 100
    );
    const selfTimeForFuncPercent = Math.round(
      (selfTimeForFunc.value / rootTime) * 100
    );

    return (
      <aside className="sidebar sidebar-calltree">
        <div className="sidebar-contents-wrapper">
          <header className="sidebar-titlegroup">
            <CanSelectContent
              tagName="h2"
              className="sidebar-title"
              content={name}
            />
            {lib ? (
              <CanSelectContent
                tagName="p"
                className="sidebar-subtitle"
                content={lib}
              />
            ) : null}
          </header>
          {tracedTiming ? (
            <SidebarDetail label="Traced running time">
              {formatMilliseconds(
                tracedTiming.running[selectedNodeIndex],
                3,
                1
              )}
            </SidebarDetail>
          ) : null}
          {tracedTiming ? (
            <SidebarDetail label="Traced self time">
              {tracedTiming.self[selectedNodeIndex] === 0
                ? '—'
                : formatMilliseconds(
                    tracedTiming.self[selectedNodeIndex],
                    3,
                    1
                  )}
            </SidebarDetail>
          ) : null}
          <SidebarDetail label={running}>
            {totalTime.value
              ? `${number(totalTime.value)} (${totalTimePercent}%)`
              : '—'}
          </SidebarDetail>
          <SidebarDetail label={self}>
            {selfTime.value
              ? `${number(selfTime.value)} (${selfTimePercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTime.breakdownByCategory ? (
            <>
              <h4 className="sidebar-title3">Categories</h4>
              <CategoryBreakdown
                breakdown={totalTime.breakdownByCategory}
                categoryList={categoryList}
                number={number}
              />
            </>
          ) : null}
          {totalTime.breakdownByImplementation && totalTime.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTime.breakdownByImplementation}
                number={number}
              />
            </React.Fragment>
          ) : null}
          {selfTime.breakdownByImplementation && selfTime.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTime.breakdownByImplementation}
                number={number}
              />
            </React.Fragment>
          ) : null}
          <h3 className="sidebar-title2">
            This function across the entire tree
          </h3>
          <SidebarDetail label="Running Time">
            {totalTimeForFunc.value
              ? `${number(
                  totalTimeForFunc.value
                )} (${totalTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTimeForFunc.value
              ? `${number(selfTimeForFunc.value)} (${selfTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTimeForFunc.breakdownByImplementation &&
          totalTimeForFunc.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTimeForFunc.breakdownByImplementation}
                number={number}
              />
            </React.Fragment>
          ) : null}
          {selfTimeForFunc.breakdownByImplementation &&
          selfTimeForFunc.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTimeForFunc.breakdownByImplementation}
                number={number}
              />
            </React.Fragment>
          ) : null}
        </div>
      </aside>
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    selectedNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(state),
    callNodeTable: selectedThreadSelectors.getCallNodeInfo(state).callNodeTable,
    selectedThreadIndex: getSelectedThreadIndex(state),
    name: getFunctionName(selectedNodeSelectors.getName(state)),
    lib: selectedNodeSelectors.getLib(state),
    timings: selectedNodeSelectors.getTimingsForSidebar(state),
    categoryList: getCategories(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    tracedTiming: selectedThreadSelectors.getTracedTiming(state),
  }),
  component: CallTreeSidebar,
});
