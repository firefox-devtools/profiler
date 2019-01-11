/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow
import * as React from 'react';

import { getStackType } from '../../profile-logic/transforms';
import NodeIcon from '../shared/NodeIcon';

import type { Thread, CategoryList } from '../../types/profile';
import type {
  IndexIntoCallNodeTable,
  CallNodeInfo,
  CallNodeDisplayData,
} from '../../types/profile-derived';

type Props = {|
  thread: Thread,
  callNodeIndex: IndexIntoCallNodeTable,
  callNodeInfo: CallNodeInfo,
  categories: CategoryList,
  // Since this tooltip can be used in different context, provide some kind of duration
  // label, e.g. "100ms" or "33%".
  durationText: string,
  displayData?: CallNodeDisplayData,
|};

/**
 * This class collects the tooltip rendering for anything that cares about call nodes.
 * This includes the Flame Graph and Stack Chart.
 */
export class TooltipCallNode extends React.PureComponent<Props> {
  render() {
    const {
      callNodeIndex,
      thread,
      durationText,
      categories,
      displayData,
      callNodeInfo: { callNodeTable },
    } = this.props;

    const categoryIndex = callNodeTable.category[callNodeIndex];
    const category = categories[categoryIndex];
    const funcIndex = callNodeTable.func[callNodeIndex];
    const funcStringIndex = thread.funcTable.name[funcIndex];
    const funcName = thread.stringTable.getString(funcStringIndex);

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
        stackTypeLabel = 'Unsymbolicated Native';
        break;
      default:
        throw new Error(`Unknown stack type case "${stackType}".`);
    }

    return (
      <div className="stackChartCanvasTooltip">
        <div className="tooltipOneLine tooltipHeader">
          <div className="tooltipTiming">{durationText}</div>
          <div className="tooltipTitle">{funcName}</div>
          <div className="tooltipIcon">
            {displayData && displayData.icon ? (
              <NodeIcon displayData={displayData} />
            ) : null}
          </div>
        </div>
        <div className="tooltipDetails">
          {/* Everything in this div needs to come in pairs of two in order to
              respect the CSS grid. */}
          <div className="tooltipLabel">Category:</div>
          <div>
            <span
              className={`category-swatch category-color-${category.color}`}
            />
            {category.name}
          </div>
          {/* --------------------------------------------------------------- */}
          {resourceOrFileName}
          {/* --------------------------------------------------------------- */}
          <div className="tooltipLabel">Stack Type:</div>
          <div>{stackTypeLabel}</div>
          {/* --------------------------------------------------------------- */}
          {displayData ? (
            <>
              <div className="tooltipLabel">Running Time:</div>
              <div>{displayData.totalTimeWithUnit}</div>
              {/* --------------------------------------------------------------- */}
              <div className="tooltipLabel">Self Time:</div>
              <div>{displayData.selfTimeWithUnit}</div>
            </>
          ) : null}
        </div>
      </div>
    );
  }
}
