/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';

import { getStackType } from '../../profile-logic/transforms';
import { objectEntries } from '../../utils/flow';
import { formatCallNodeNumber } from '../../utils/format-numbers';
import NodeIcon from '../shared/NodeIcon';
import {
  getFriendlyStackTypeName,
  getCategoryPairLabel,
} from '../../profile-logic/profile-data';

import type { CallTree } from '../../profile-logic/call-tree';
import type { Thread, CategoryList } from '../../types/profile';
import type {
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  CallNodeInfo,
} from '../../types/profile-derived';
import type { TimingsForPath } from '../../profile-logic/profile-data';
import type { Milliseconds } from '../../types/units';

import './CallNode.css';

const GRAPH_WIDTH = 150;
const GRAPH_HEIGHT = 10;

type Props = {|
  thread: Thread,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  interval: Milliseconds,
  // Since this tooltip can be used in different context, provide some kind of duration
  // label, e.g. "100ms" or "33%".
  durationText: string,
  callTree?: CallTree,
  timings?: TimingsForPath,
|};

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
    const { interval, thread } = this.props;

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
        <div>{displayData.totalTimeWithUnit}</div>
        <div>{displayData.selfTimeWithUnit}</div>
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
                  {formatCallNodeNumber(interval, isHighPrecision, time)}ms
                </div>
                <div className="tooltipCallNodeImplementationTiming">
                  {selfTimeValue === 0
                    ? '—'
                    : `${formatCallNodeNumber(
                        interval,
                        isHighPrecision,
                        selfTimeValue
                      )}ms`}
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
      callNodeInfo: { callNodeTable },
    } = this.props;
    const categoryIndex = callNodeTable.category[callNodeIndex];
    const categoryColor = categories[categoryIndex].color;
    const subcategoryIndex = callNodeTable.subcategory[callNodeIndex];
    const funcIndex = callNodeTable.func[callNodeIndex];
    const funcStringIndex = thread.funcTable.name[funcIndex];
    const funcName = thread.stringTable.getString(funcStringIndex);

    let displayData;
    if (callTree) {
      displayData = callTree.getDisplayData(callNodeIndex);
    }

    let resourceOrFileName = null;
    // Only JavaScript functions have a filename.
    const fileNameIndex = thread.funcTable.fileName[funcIndex];
    if (fileNameIndex !== null) {
      let fileName = thread.stringTable.getString(fileNameIndex);
      const lineNumber = thread.funcTable.lineNumber[funcIndex];
      if (lineNumber !== null) {
        fileName += ':' + lineNumber;
        const columnNumber = thread.funcTable.columnNumber[funcIndex];
        if (columnNumber !== null) {
          fileName += ':' + columnNumber;
        }
      }

      // Because of our use of Grid Layout, all our elements need to be direct
      // children of the grid parent. That's why we use arrays here, to add
      // the elements as direct children.
      resourceOrFileName = [
        <div className="tooltipLabel" key="file">
          File:
        </div>,
        fileName,
      ];
    } else {
      const resourceIndex = thread.funcTable.resource[funcIndex];
      if (resourceIndex !== -1) {
        const resourceNameIndex = thread.resourceTable.name[resourceIndex];
        if (resourceNameIndex !== -1) {
          // Because of our use of Grid Layout, all our elements need to be direct
          // children of the grid parent. That's why we use arrays here, to add
          // the elements as direct children.
          resourceOrFileName = [
            <div className="tooltipLabel" key="resource">
              Resource:
            </div>,
            thread.stringTable.getString(resourceNameIndex),
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
              <NodeIcon displayData={displayData} />
            ) : null}
          </div>
        </div>
        <div className="tooltipCallNodeDetails">
          {this._renderTimings(timings, displayData)}
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
            {resourceOrFileName}
          </div>
        </div>
      </div>
    );
  }
}
