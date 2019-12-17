/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';

import explicitConnect from '../../utils/connect';
import {
  selectedThreadSelectors,
  selectedNodeSelectors,
} from 'selectors/per-thread';
import { getSelectedThreadIndex } from 'selectors/url-state';
import { getCategories, getProfileInterval } from 'selectors/profile';
import { getFunctionName } from '../../profile-logic/function-info';
import {
  getFriendlyStackTypeName,
  shouldDisplaySubcategoryInfoForCategory,
} from '../../profile-logic/profile-data';
import CanSelectContent from './CanSelectContent';

import type { ConnectedProps } from '../../utils/connect';
import type { ThreadIndex, CategoryList } from '../../types/profile';
import type {
  CallNodeTable,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';
import type {
  BreakdownByImplementation,
  BreakdownByCategory,
  StackImplementation,
  TimingsForPath,
} from '../../profile-logic/profile-data';
import { formatMilliseconds, formatPercent } from '../../utils/format-numbers';

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
  +isIntervalInteger: boolean,
|};

// This component is responsible for displaying the breakdown data specific to
// the JavaScript engine and native code implementation.
class ImplementationBreakdown extends React.PureComponent<ImplementationBreakdownProps> {
  _orderedImplementations: $ReadOnlyArray<StackImplementation> = [
    'native',
    'interpreter',
    'baseline',
    'ion',
    'unknown',
  ];

  render() {
    const { breakdown, isIntervalInteger } = this.props;

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

    return <Breakdown data={data} isIntervalInteger={isIntervalInteger} />;
  }
}

type CategoryBreakdownProps = {|
  +breakdown: BreakdownByCategory,
  +categoryList: CategoryList,
  +isIntervalInteger: boolean,
|};

class CategoryBreakdown extends React.PureComponent<CategoryBreakdownProps> {
  render() {
    const { breakdown, categoryList, isIntervalInteger } = this.props;
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
    const maxFractionalDigits = isIntervalInteger ? 0 : 1;

    return (
      <div className="sidebar-categorylist">
        {data.map(({ category, value, subcategories }) => {
          return (
            <React.Fragment key={category.name}>
              <div className="sidebar-categoryname">
                <span
                  className={`sidebar-color colored-square category-color-${
                    category.color
                  }`}
                  title={category.name}
                />
                {category.name}
              </div>
              <div className="sidebar-categorytiming">
                {formatMilliseconds(value, 3, maxFractionalDigits)} (
                {formatPercent(value / totalTime)})
              </div>
              {shouldDisplaySubcategoryInfoForCategory(category)
                ? subcategories.map(({ name, value }) => (
                    <React.Fragment key={name}>
                      <div className="sidebar-subcategoryname">{name}</div>
                      <div className="sidebar-categorytiming">
                        {formatMilliseconds(value, 3, maxFractionalDigits)} (
                        {formatPercent(value / totalTime)})
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
  +isIntervalInteger: boolean,
|};

// This stateless component is responsible for displaying the implementation
// breakdown. It also computes the percentage from the total time.
function Breakdown({ data, isIntervalInteger }: BreakdownProps) {
  const totalTime = data.reduce((result, item) => result + item.value, 0);
  const maxFractionalDigits = isIntervalInteger ? 0 : 1;

  return data
    .filter(({ value }) => value)
    .map(({ group, value }) => {
      const percentage = Math.round((value / totalTime) * 100);

      return (
        <SidebarDetail label={group} key={group}>
          {formatMilliseconds(value, 3, maxFractionalDigits)} ({percentage}%)
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
  +isIntervalInteger: boolean,
|};

type Props = ConnectedProps<{||}, StateProps, {||}>;

class CallTreeSidebar extends React.PureComponent<Props> {
  render() {
    const {
      selectedNodeIndex,
      name,
      lib,
      timings,
      categoryList,
      isIntervalInteger,
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

    const totalTimePercent = Math.round((totalTime.value / rootTime) * 100);
    const selfTimePercent = Math.round((selfTime.value / rootTime) * 100);
    const totalTimeForFuncPercent = Math.round(
      (totalTimeForFunc.value / rootTime) * 100
    );
    const selfTimeForFuncPercent = Math.round(
      (selfTimeForFunc.value / rootTime) * 100
    );

    const maxFractionalDigits = isIntervalInteger ? 0 : 1;

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
          <h3 className="sidebar-title2">This selected call node</h3>
          <SidebarDetail label="Running Time">
            {totalTime.value
              ? `${formatMilliseconds(
                  totalTime.value,
                  3,
                  maxFractionalDigits
                )} (${totalTimePercent}%)`
              : '—'}
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTime.value
              ? `${formatMilliseconds(
                  selfTime.value,
                  3,
                  maxFractionalDigits
                )} (${selfTimePercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTime.breakdownByCategory ? (
            <>
              <h4 className="sidebar-title3">Categories</h4>
              <CategoryBreakdown
                breakdown={totalTime.breakdownByCategory}
                categoryList={categoryList}
                isIntervalInteger={isIntervalInteger}
              />
            </>
          ) : null}
          {totalTime.breakdownByImplementation && totalTime.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTime.breakdownByImplementation}
                isIntervalInteger={isIntervalInteger}
              />
            </React.Fragment>
          ) : null}
          {selfTime.breakdownByImplementation && selfTime.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTime.breakdownByImplementation}
                isIntervalInteger={isIntervalInteger}
              />
            </React.Fragment>
          ) : null}
          <h3 className="sidebar-title2">
            This function across the entire tree
          </h3>
          <SidebarDetail label="Running Time">
            {totalTimeForFunc.value
              ? `${formatMilliseconds(
                  totalTimeForFunc.value,
                  3,
                  maxFractionalDigits
                )} (${totalTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          <SidebarDetail label="Self Time">
            {selfTimeForFunc.value
              ? `${formatMilliseconds(
                  selfTimeForFunc.value,
                  3,
                  maxFractionalDigits
                )} (${selfTimeForFuncPercent}%)`
              : '—'}
          </SidebarDetail>
          {totalTimeForFunc.breakdownByImplementation &&
          totalTimeForFunc.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – running time</h4>
              <ImplementationBreakdown
                breakdown={totalTimeForFunc.breakdownByImplementation}
                isIntervalInteger={isIntervalInteger}
              />
            </React.Fragment>
          ) : null}
          {selfTimeForFunc.breakdownByImplementation &&
          selfTimeForFunc.value ? (
            <React.Fragment>
              <h4 className="sidebar-title3">Implementation – self time</h4>
              <ImplementationBreakdown
                breakdown={selfTimeForFunc.breakdownByImplementation}
                isIntervalInteger={isIntervalInteger}
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
    isIntervalInteger: Number.isInteger(getProfileInterval(state)),
  }),
  component: CallTreeSidebar,
});
