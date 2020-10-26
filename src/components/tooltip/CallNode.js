/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';

import { getStackType } from 'firefox-profiler/profile-logic/transforms';
import { objectEntries } from 'firefox-profiler/utils/flow';
import { formatCallNodeNumberWithUnit } from 'firefox-profiler/utils/format-numbers';
import { Icon } from 'firefox-profiler/components/shared/Icon';
import {
  getFriendlyStackTypeName,
  getCategoryPairLabel,
} from 'firefox-profiler/profile-logic/profile-data';

import type { CallTree } from 'firefox-profiler/profile-logic/call-tree';
import type {
  Thread,
  CategoryList,
  PageList,
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  CallNodeInfo,
  WeightType,
  Milliseconds,
  CallTreeSummaryStrategy,
} from 'firefox-profiler/types';

import type { TimingsForPath } from 'firefox-profiler/profile-logic/profile-data';

import './CallNode.css';

const GRAPH_WIDTH = 150;
const GRAPH_HEIGHT = 10;

type Props = {|
  +thread: Thread,
  +weightType: WeightType,
  +pages: PageList | null,
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
|};

// For debugging purposes, allow tooltips to persist. This aids in inspecting
// the DOM structure.
window.persistTooltips = false;
if (process.env.NODE_ENV === 'development') {
  console.log('To debug tooltips, set window.persistTooltips to true.');
}

/**
 * This class collects the tooltip rendering for anything that cares about call nodes.
 * This includes the Flame Graph and Stack Chart.
 */
export class TooltipCallNode extends React.PureComponent<Props> {
  _renderTimings(
    maybeTimings: ?TimingsForPath,
    maybeDisplayData: ?CallNodeDisplayData
  ) {
    if (!maybeTimings || !maybeDisplayData) {
      return null;
    }
    const { totalTime, selfTime } = maybeTimings.forPath;
    const displayData = maybeDisplayData;
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
        <div className="tooltipCallNodeImplementationHeader" />
        <div className="tooltipCallNodeImplementationHeader">
          <span className="tooltipCallNodeImplementationHeaderSwatchRunning" />
          Running
        </div>
        <div className="tooltipCallNodeImplementationHeader">
          <span className="tooltipCallNodeImplementationHeaderSwatchSelf" />
          Self
        </div>
        {/* grid row -------------------------------------------------- */}
        <div className="tooltipLabel">Overall</div>
        <div className="tooltipCallNodeImplementationGraph">
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
        <div className="tooltipCallNodeImplementationTiming">
          {displayData.totalWithUnit}
        </div>
        <div className="tooltipCallNodeImplementationTiming">
          {displayData.selfWithUnit}
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
                <div className="tooltipCallNodeImplementationName tooltipLabel">
                  {getFriendlyStackTypeName(implementation)}
                </div>
                <div className="tooltipCallNodeImplementationGraph">
                  <div
                    className="tooltipCallNodeImplementationGraphRunning"
                    style={{
                      width: (GRAPH_WIDTH * time) / totalTime.value,
                    }}
                  />
                  <div
                    className="tooltipCallNodeImplementationGraphSelf"
                    style={{
                      width: (GRAPH_WIDTH * selfTimeValue) / totalTime.value,
                    }}
                  />
                </div>
                <div className="tooltipCallNodeImplementationTiming">
                  {formatCallNodeNumberWithUnit(
                    weightType,
                    isHighPrecision,
                    time
                  )}
                </div>
                <div className="tooltipCallNodeImplementationTiming">
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
      pages,
      callNodeInfo: { callNodeTable },
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

    // Only JavaScript functions have a filename.
    const fileNameIndex = thread.funcTable.fileName[funcIndex];
    if (fileNameIndex !== null) {
      let fileNameURL = thread.stringTable.getString(fileNameIndex);
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
          Script URL:
        </div>,
        fileNameURL,
      ];
    }

    let resource = null;
    const resourceIndex = thread.funcTable.resource[funcIndex];

    if (resourceIndex !== -1) {
      const resourceNameIndex = thread.resourceTable.name[resourceIndex];
      if (resourceNameIndex !== -1) {
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
    }

    // Finding current frame and parent frame URL(if there is).
    let pageAndParentPageURL;
    if (pages) {
      const page = pages.find(p => p.innerWindowID === innerWindowID);
      if (page) {
        if (page.embedderInnerWindowID !== 0) {
          // This is an iframe since it has an embedder.
          pageAndParentPageURL = [
            <div className="tooltipLabel" key="iframe">
              iframe URL:
            </div>,
            <div key="iframeVal">{page.url}</div>,
          ];

          // Getting the embedder URL now.
          const parentPage = pages.find(
            p => p.innerWindowID === page.embedderInnerWindowID
          );
          // Ideally it should find a page.
          if (parentPage) {
            pageAndParentPageURL.push(
              <div className="tooltipLabel" key="page">
                Page URL:
              </div>,
              <div key="pageVal">{parentPage.url}</div>
            );
          }
        } else {
          // This is a regular page without an embedder.
          pageAndParentPageURL = [
            <div className="tooltipLabel" key="page">
              Page URL:
            </div>,
            <div key="pageVal">{page.url}</div>,
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
          {this._renderTimings(timings, displayData)}
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
            <div className="tooltipLabel">Stack Type:</div>
            <div>{stackTypeLabel}</div>
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
