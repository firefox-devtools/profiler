/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';

import { getStackType } from '../../profile-logic/transforms';
import { objectEntriesMap, assertExhaustiveCheck } from '../../utils/flow';
import { formatMilliseconds } from '../../utils/format-numbers';
import NodeIcon from '../shared/NodeIcon';

import type { CallTree } from '../../profile-logic/call-tree';
import type { Thread, CategoryList } from '../../types/profile';
import type {
  IndexIntoCallNodeTable,
  CallNodeDisplayData,
  CallNodeInfo,
} from '../../types/profile-derived';
import type {
  TimingsForPath,
  StackImplementation,
} from '../../profile-logic/profile-data';

import './CallNode.css';

const GRAPH_WIDTH = 150;
const GRAPH_HEIGHT = 10;

type Props = {|
  thread: Thread,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  // Since this tooltip can be used in different context, provide some kind of duration
  // label, e.g. "100ms" or "33%".
  durationText: string,
  callTree?: CallTree,
  timings?: TimingsForPath,
|};

function _getFriendlyStackTypeName(
  implementation: StackImplementation
): string {
  switch (implementation) {
    case 'ion':
    case 'baseline':
      return `JS JIT (${implementation})`;
    case 'interpreter':
      return 'JS interpreter';
    case 'native':
      return 'Native code';
    case 'unknown':
      return implementation;
    default:
      throw assertExhaustiveCheck(implementation);
  }
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
    const timings = maybeTimings;
    const displayData = maybeDisplayData;
    const { breakdownByImplementation } = timings.forPath.totalTime;
    if (!breakdownByImplementation) {
      return null;
    }
    const sortedBreakdown = objectEntriesMap(breakdownByImplementation).sort(
      (a, b) => b[1] - a[1]
    );

    const totalTime = sortedBreakdown.reduce(
      (memo, [, value]) => memo + value,
      0
    );

    return (
      <div className="tooltipCallNodeImplementation">
        {/* grid row -------------------------------------------------- */}
        <div />
        <div className="tooltipCallNodeImplementationHeader" />
        <div className="tooltipCallNodeImplementationHeader">
          <span className="tooltipCallNodeImplementationHeaderSwatchRunning" />Running
        </div>
        <div className="tooltipCallNodeImplementationHeader">
          <span className="tooltipCallNodeImplementationHeaderSwatchSelf" />Self
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
              width: GRAPH_WIDTH * displayData.selfTimeNumeric / totalTime,
            }}
          />
        </div>
        <div>{displayData.totalTimeWithUnit}</div>
        <div>{displayData.selfTimeWithUnit}</div>
        {/* grid row -------------------------------------------------- */}
        {sortedBreakdown.map(([implementation, time], index) => {
          let selfTime = 0;
          const selfBreakdownMap =
            timings.forPath.selfTime.breakdownByImplementation;
          if (selfBreakdownMap) {
            selfTime = selfBreakdownMap[implementation] || 0;
          }

          return (
            <React.Fragment key={index}>
              <div className="tooltipCallNodeImplementationName tooltipLabel">
                {_getFriendlyStackTypeName(implementation)}
              </div>
              <div className="tooltipCallNodeImplementationGraph">
                <div
                  className="tooltipCallNodeImplementationGraphRunning"
                  style={{
                    width: GRAPH_WIDTH * time / totalTime,
                  }}
                />
                <div
                  className="tooltipCallNodeImplementationGraphSelf"
                  style={{
                    width: GRAPH_WIDTH * selfTime / totalTime,
                  }}
                />
              </div>
              <div className="tooltipCallNodeImplementationTiming">
                {formatMilliseconds(time)}
              </div>
              <div className="tooltipCallNodeImplementationTiming">
                {selfTime === 0 ? '—' : formatMilliseconds(selfTime)}
              </div>
            </React.Fragment>
          );
        })}
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
    const category = categories[categoryIndex];
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
      // Because of our use of Grid Layout, all our elements need to be direct
      // children of the grid parent. That's why we use arrays here, to add
      // the elements as direct children.
      resourceOrFileName = [
        <div className="tooltipLabel" key="file">
          File:
        </div>,
        thread.stringTable.getString(fileNameIndex),
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
                className={`category-swatch category-color-${category.color}`}
              />
              {category.name}
            </div>
            {/* --------------------------------------------------------------- */}
            {resourceOrFileName}
          </div>
        </div>
      </div>
    );
  }
}
