/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';

import { getStackType } from 'firefox-profiler/profile-logic/transforms';
import { parseFileNameFromSymbolication } from 'firefox-profiler/utils/special-paths';
import { objectEntries } from 'firefox-profiler/utils/flow';
import { formatCallNodeNumberWithUnit } from 'firefox-profiler/utils/format-numbers';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import {
  getFriendlyStackTypeName,
  getCategoryPairLabel,
} from 'firefox-profiler/profile-logic/profile-data';
import { countPositiveValues } from 'firefox-profiler/utils';

import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';
import type {
  Thread,
  CategoryList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  CallNodeInfo,
  WeightType,
  Milliseconds,
  CallTreeSummaryStrategy,
  InnerWindowID,
  Page,
  IndexIntoCategoryList,
  IndexIntoSubcategoryListForCategory,
} from 'firefox-profiler/types';

import type {
  TimingsForPath,
  ItemTimings,
  OneCategoryBreakdown,
} from 'firefox-profiler/profile-logic/profile-data';

import './CallNode.css';
import classNames from 'classnames';

const GRAPH_WIDTH = 150;
const GRAPH_HEIGHT = 10;

type Props = {|
  +thread: Thread,
  +weightType: WeightType,
  +innerWindowIDToPageMap: Map<InnerWindowID, Page> | null,
  +callNodeIndex: IndexIntoCallNodeTable,
  +callNodeInfo: CallNodeInfo,
  +categories: CategoryList,
  +interval: Milliseconds,
  // Since this tooltip can be used in different context, provide some kind of duration
  // label, e.g. "100ms" or "33%".
  +durationText: string,
  +callTree?: CallTree,
  +timings?: TimingsForPath,
  +callTreeSummaryStrategy: CallTreeSummaryStrategy,
  +displayStackType: boolean,
|};

/**
 * This class collects the tooltip rendering for anything that cares about call nodes.
 * This includes the Flame Graph and Stack Chart.
 */
export class TooltipCallNode extends React.PureComponent<Props> {
  _renderOneSubCategoryLine(
    label: string,
    categoryIndex: IndexIntoCategoryList,
    subcategoryIndex: IndexIntoSubcategoryListForCategory,
    selfTime: number,
    totalTime: number,
    overallTotalTime: number,
    isHighPrecision: boolean,
    isCategoryHeader: boolean
  ) {
    const { categories, weightType } = this.props;
    const color = categories[categoryIndex].color;
    return (
      <React.Fragment key={`${categoryIndex}-${subcategoryIndex}`}>
        <div
          className={classNames({
            tooltipCallNodeName: true,
            tooltipLabel: true,
            tooltipCategoryRowHeader: isCategoryHeader,
          })}
        >
          {label}
        </div>
        <div
          className={classNames('tooltipCallNodeGraph ', {
            tooltipCategoryRowHeader: isCategoryHeader,
          })}
        >
          <div
            className="tooltipCallNodeGraphRunning"
            style={{
              width: (GRAPH_WIDTH * totalTime) / overallTotalTime,
              'background-color': `var(--category-color-${color})`,
            }}
          />
          <div
            className="tooltipCallNodeGraphSelf"
            style={{
              width: (GRAPH_WIDTH * selfTime) / overallTotalTime,
              'background-color': `var(--category-color-${color})`,
            }}
          />
        </div>
        <div
          className={classNames({
            tooltipCallNodeTiming: true,
            tooltipCategoryRowHeader: isCategoryHeader,
          })}
        >
          {formatCallNodeNumberWithUnit(weightType, isHighPrecision, totalTime)}
        </div>
        <div
          className={classNames({
            tooltipCallNodeTiming: true,
            tooltipCategoryRowHeader: isCategoryHeader,
          })}
        >
          {selfTime === 0
            ? '—'
            : formatCallNodeNumberWithUnit(
                weightType,
                isHighPrecision,
                selfTime
              )}
        </div>
      </React.Fragment>
    );
  }

  _renderOneCategoryLine(
    { selfTime, totalTime }: ItemTimings,
    category: IndexIntoCategoryList,
    isHighPrecision: boolean
  ): Array<React.Node> {
    if (totalTime.breakdownByCategory === null) {
      return [];
    }
    const { entireCategoryValue, subcategoryBreakdown }: OneCategoryBreakdown =
      totalTime.breakdownByCategory[category];
    if (entireCategoryValue === 0) {
      return [];
    }
    const { categories } = this.props;
    const selfTimeValue = selfTime.breakdownByCategory
      ? selfTime.breakdownByCategory[category].entireCategoryValue
      : 0;

    const rows = [];

    if (countPositiveValues(subcategoryBreakdown) <= 1) {
      const subCategory = subcategoryBreakdown.findIndex((val) => val > 0);
      rows.push(
        this._renderOneSubCategoryLine(
          getCategoryPairLabel(categories, category, subCategory),
          category,
          subCategory,
          selfTimeValue,
          entireCategoryValue,
          entireCategoryValue,
          isHighPrecision,
          true
        )
      );
      return rows;
    }

    // there are at least two subcategories

    const categoryName = categories[category].name;

    rows.push(
      this._renderOneSubCategoryLine(
        categoryName,
        category,
        -1,
        selfTimeValue,
        entireCategoryValue,
        entireCategoryValue,
        isHighPrecision,
        true
      )
    );

    const pushSubCategory = (
      subCategory: IndexIntoSubcategoryListForCategory
    ) => {
      const subCategoryValue = subcategoryBreakdown[subCategory];
      if (subCategoryValue === 0) {
        return;
      }
      const selfTimeValue = selfTime.breakdownByCategory
        ? selfTime.breakdownByCategory[category].subcategoryBreakdown[
            subCategory
          ]
        : 0;
      rows.push(
        this._renderOneSubCategoryLine(
          categories[category].subcategories[subCategory],
          category,
          subCategory,
          selfTimeValue,
          subCategoryValue,
          entireCategoryValue,
          isHighPrecision,
          false
        )
      );
    };

    // Start at 1, we'll add the "Other" subcategory at the end if needed.
    for (
      let subCategory = 1;
      subCategory < subcategoryBreakdown.length;
      subCategory++
    ) {
      pushSubCategory(subCategory);
    }

    pushSubCategory(0);
    return rows;
  }

  _renderCategoryTimings(
    maybeTimings: ?TimingsForPath,
    maybeDisplayData: ?CallNodeDisplayData
  ) {
    if (!maybeTimings || !maybeDisplayData) {
      return null;
    }
    const { totalTime, selfTime } = maybeTimings.forPath;
    const totalBreakdownByCategory = totalTime.breakdownByCategory;
    if (!totalBreakdownByCategory) {
      return null;
    }

    const { thread, weightType } = this.props;

    // JS Tracer threads have data relevant to the microsecond level.
    const isHighPrecision: boolean = Boolean(thread.isJsTracer);

    const rows: Array<React.Node> = [];
    totalBreakdownByCategory.forEach((_, category) => {
      rows.push(
        ...this._renderOneCategoryLine(
          { totalTime, selfTime },
          category,
          isHighPrecision
        )
      );
    });

    return (
      <div className="tooltipCallNodeCategory">
        {/* grid row -------------------------------------------------- */}
        <div />
        <div className="tooltipCallNodeHeader" />
        <div className="tooltipCallNodeHeader">
          <span className="tooltipCallNodeHeaderSwatchRunning" />
          Running
        </div>
        <div className="tooltipCallNodeHeader">
          <span className="tooltipCallNodeHeaderSwatchSelf" />
          Self
        </div>
        {/* grid row -------------------------------------------------- */}
        <div className="tooltipLabel tooltipCategoryLabel tooltipCategoryRowHeader">
          Overall
        </div>
        <div className="tooltipCallNodeGraph tooltipCategoryRow tooltipCategoryRowHeader">
          <div
            className="tooltipCallNodeGraphRunning"
            style={{
              width: GRAPH_WIDTH,
            }}
          />
          <div
            className="tooltipCallNodeGraphSelf"
            style={{
              width: (GRAPH_WIDTH * selfTime.value) / totalTime.value,
            }}
          />
        </div>
        <div className="tooltipCallNodeTiming tooltipCategoryRow tooltipCategoryRowHeader">
          {formatCallNodeNumberWithUnit(
            weightType,
            isHighPrecision,
            totalTime.value
          )}
        </div>
        <div className="tooltipCallNodeTiming tooltipCategoryRow tooltipCategoryRowHeader">
          {selfTime.value === 0
            ? '—'
            : formatCallNodeNumberWithUnit(
                weightType,
                isHighPrecision,
                selfTime.value
              )}
        </div>
        {rows}
      </div>
    );
  }

  _canRenderImplementationTimings(
    maybeTimings: ?TimingsForPath,
    maybeDisplayData: ?CallNodeDisplayData
  ) {
    if (!maybeTimings || !maybeDisplayData) {
      return false;
    }
    return Boolean(maybeTimings.forPath.totalTime.breakdownByImplementation);
  }

  _renderImplementationTimings(
    maybeTimings: ?TimingsForPath,
    maybeDisplayData: ?CallNodeDisplayData
  ) {
    if (!maybeTimings || !maybeDisplayData) {
      return null;
    }
    const { totalTime, selfTime } = maybeTimings.forPath;
    if (!totalTime.breakdownByImplementation) {
      return null;
    }

    const sortedTotalBreakdownByImplementation = objectEntries(
      totalTime.breakdownByImplementation
    ).sort((a, b) => b[1] - a[1]);
    const { thread, weightType } = this.props;

    // JS Tracer threads have data relevant to the microsecond level.
    const isHighPrecision = Boolean(thread.isJsTracer);

    return (
      <div className="tooltipCallNodeImplementation">
        {/* grid row -------------------------------------------------- */}
        <div />
        <div className="tooltipCallNodeHeader" />
        <div className="tooltipCallNodeHeader">
          <span className="tooltipCallNodeHeaderSwatchRunning" />
          Running
        </div>
        <div className="tooltipCallNodeHeader">
          <span className="tooltipCallNodeHeaderSwatchSelf" />
          Self
        </div>
        {/* grid row -------------------------------------------------- */}
        <div className="tooltipLabel">Overall</div>
        <div className="tooltipCallNodeGraph">
          <div
            className="tooltipCallNodeImplementationGraphRunning"
            style={{
              width: GRAPH_WIDTH,
            }}
          />
          <div
            className="tooltipCallNodeImplementationGraphSelf"
            style={{
              width: (GRAPH_WIDTH * selfTime.value) / totalTime.value,
            }}
          />
        </div>
        <div className="tooltipCallNodeTiming">
          {formatCallNodeNumberWithUnit(
            weightType,
            isHighPrecision,
            totalTime.value
          )}
        </div>
        <div className="tooltipCallNodeTiming">
          {selfTime.value === 0
            ? '—'
            : formatCallNodeNumberWithUnit(
                weightType,
                isHighPrecision,
                selfTime.value
              )}
        </div>
        {/* grid row -------------------------------------------------- */}
        {sortedTotalBreakdownByImplementation.map(
          ([implementation, time], index) => {
            let selfTimeValue = 0;
            if (selfTime.breakdownByImplementation) {
              selfTimeValue =
                selfTime.breakdownByImplementation[implementation] || 0;
            }

            return (
              <React.Fragment key={index}>
                <div className="tooltipCallNodeName tooltipLabel">
                  {getFriendlyStackTypeName(implementation)}
                </div>
                <div className="tooltipCallNodeGraph">
                  <div
                    className="tooltipCallNodeGraphRunning"
                    style={{
                      width: (GRAPH_WIDTH * time) / totalTime.value,
                    }}
                  />
                  <div
                    className="tooltipCallNodeGraphSelf"
                    style={{
                      width: (GRAPH_WIDTH * selfTimeValue) / totalTime.value,
                    }}
                  />
                </div>
                <div className="tooltipCallNodeTiming">
                  {formatCallNodeNumberWithUnit(
                    weightType,
                    isHighPrecision,
                    time
                  )}
                </div>
                <div className="tooltipCallNodeTiming">
                  {selfTimeValue === 0
                    ? '—'
                    : formatCallNodeNumberWithUnit(
                        weightType,
                        isHighPrecision,
                        selfTimeValue
                      )}
                </div>
              </React.Fragment>
            );
          }
        )}
      </div>
    );
  }

  render() {
    const {
      callNodeIndex,
      thread,
      durationText,
      categories,
      callTree,
      timings,
      callTreeSummaryStrategy,
      innerWindowIDToPageMap,
      callNodeInfo: { callNodeTable },
      displayStackType,
    } = this.props;
    const categoryIndex = callNodeTable.category[callNodeIndex];
    const categoryColor = categories[categoryIndex].color;
    const subcategoryIndex = callNodeTable.subcategory[callNodeIndex];
    const funcIndex = callNodeTable.func[callNodeIndex];
    const innerWindowID = callNodeTable.innerWindowID[callNodeIndex];
    const funcStringIndex = thread.funcTable.name[funcIndex];
    const funcName = thread.stringTable.getString(funcStringIndex);

    let displayData;
    if (callTree) {
      displayData = callTree.getDisplayData(callNodeIndex);
    }

    let fileName = null;

    const fileNameIndex = thread.funcTable.fileName[funcIndex];
    if (fileNameIndex !== null) {
      let fileNameURL = thread.stringTable.getString(fileNameIndex);
      // fileNameURL could be a path from symbolication (potentially using "special path"
      // syntax, e.g. hg:...), or it could be a URL, if the function is a JS function.
      // If it's a path from symbolication, strip it down to just the actual path.
      fileNameURL = parseFileNameFromSymbolication(fileNameURL).path;

      // JS functions have information about where the function starts.
      // Add :<line>:<col> to the URL, if known.
      const lineNumber = thread.funcTable.lineNumber[funcIndex];
      if (lineNumber !== null) {
        fileNameURL += ':' + lineNumber;
        const columnNumber = thread.funcTable.columnNumber[funcIndex];
        if (columnNumber !== null) {
          fileNameURL += ':' + columnNumber;
        }
      }

      // Because of our use of Grid Layout, all our elements need to be direct
      // children of the grid parent. That's why we use arrays here, to add
      // the elements as direct children.
      fileName = [
        <div className="tooltipLabel" key="file">
          File:
        </div>,
        <div className="tooltipDetailsUrl" key="fileVal">
          {fileNameURL}
        </div>,
      ];
    }

    let resource = null;
    const resourceIndex = thread.funcTable.resource[funcIndex];

    if (resourceIndex !== -1) {
      const resourceNameIndex = thread.resourceTable.name[resourceIndex];
      // Because of our use of Grid Layout, all our elements need to be direct
      // children of the grid parent. That's why we use arrays here, to add
      // the elements as direct children.
      resource = [
        <div className="tooltipLabel" key="resource">
          Resource:
        </div>,
        thread.stringTable.getString(resourceNameIndex),
      ];
    }

    // Finding current frame and parent frame URL(if there is).
    let pageAndParentPageURL;
    if (innerWindowIDToPageMap) {
      const page = innerWindowIDToPageMap.get(innerWindowID);
      if (page) {
        if (page.embedderInnerWindowID !== 0) {
          // This is an iframe since it has an embedder.
          pageAndParentPageURL = [
            <div className="tooltipLabel" key="iframe">
              iframe URL:
            </div>,
            <div className="tooltipDetailsUrl" key="iframeVal">
              {page.url}
            </div>,
          ];

          // Getting the embedder URL now.
          const parentPage = innerWindowIDToPageMap.get(
            page.embedderInnerWindowID
          );
          // Ideally it should find a page.
          if (parentPage) {
            pageAndParentPageURL.push(
              <div className="tooltipLabel" key="page">
                Page URL:
              </div>,
              <div key="pageVal">
                {parentPage.url}
                {parentPage.isPrivateBrowsing ? ' (private)' : null}
              </div>
            );
          }
        } else {
          // This is a regular page without an embedder.
          pageAndParentPageURL = [
            <div className="tooltipLabel" key="page">
              Page URL:
            </div>,
            <div className="tooltipDetailsUrl" key="pageVal">
              {page.url}
              {page.isPrivateBrowsing ? ' (private)' : null}
            </div>,
          ];
        }
      }
    }

    const stackType = getStackType(thread, funcIndex);
    let stackTypeLabel;
    switch (stackType) {
      case 'native':
        stackTypeLabel = 'Native';
        break;
      case 'js':
        stackTypeLabel = 'JavaScript';
        break;
      case 'unsymbolicated':
        stackTypeLabel = thread.funcTable.isJS[funcIndex]
          ? 'Unsymbolicated native'
          : 'Unsymbolicated or generated JIT instructions';
        break;
      default:
        throw new Error(`Unknown stack type case "${stackType}".`);
    }

    return (
      <div
        className="tooltipCallNode"
        style={{
          '--graph-width': GRAPH_WIDTH + 'px',
          '--graph-height': GRAPH_HEIGHT + 'px',
        }}
      >
        <div className="tooltipOneLine tooltipHeader">
          <div className="tooltipTiming">{durationText}</div>
          <div className="tooltipTitle">{funcName}</div>
          <div className="tooltipIcon">
            {displayData && displayData.icon ? (
              <Icon displayData={displayData} />
            ) : null}
          </div>
        </div>
        <div className="tooltipCallNodeDetails">
          {this._canRenderImplementationTimings(timings, displayData)
            ? this._renderImplementationTimings(timings, displayData)
            : this._renderCategoryTimings(timings, displayData)}
          {callTreeSummaryStrategy !== 'timing' && displayData ? (
            <div className="tooltipDetails tooltipCallNodeDetailsLeft">
              {/* Everything in this div needs to come in pairs of two in order to
                respect the CSS grid. */}
              <div className="tooltipLabel">Total Bytes:</div>
              <div>{displayData.totalWithUnit}</div>
              {/* --------------------------------------------------------------- */}
              <div className="tooltipLabel">Self Bytes:</div>
              <div>{displayData.selfWithUnit}</div>
              {/* --------------------------------------------------------------- */}
            </div>
          ) : null}
          <div className="tooltipDetails tooltipCallNodeDetailsLeft">
            {/* Everything in this div needs to come in pairs of two in order to
                respect the CSS grid. */}
            {displayStackType ? (
              <>
                <div className="tooltipLabel">Stack Type:</div>
                <div>{stackTypeLabel}</div>
              </>
            ) : null}
            {/* --------------------------------------------------------------- */}
            <div className="tooltipLabel">Category:</div>
            <div>
              <span
                className={`colored-square category-color-${categoryColor}`}
              />
              {getCategoryPairLabel(
                categories,
                categoryIndex,
                subcategoryIndex
              )}
            </div>
            {/* --------------------------------------------------------------- */}
            {pageAndParentPageURL}
            {fileName}
            {resource}
          </div>
        </div>
      </div>
    );
  }
}
