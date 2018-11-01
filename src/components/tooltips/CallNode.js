/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
// import colors from 'photon-colors';
// import {
//   withChartViewport,
//   type WithChartViewport,
// } from '../shared/chart/Viewport';
// import NodeIcon from '../shared/NodeIcon';
// import ChartCanvas from '../shared/chart/Canvas';
// import TextMeasurement from '../../utils/text-measurement';
// import { getStackType } from '../../profile-logic/transforms';
//
// import type { Thread } from '../../types/profile';
// import type { CssPixels } from '../../types/units';
// import type {
//   FlameGraphTiming,
//   FlameGraphDepth,
//   IndexIntoFlameGraphTiming,
// } from '../../profile-logic/flame-graph';
//
// import type {
//   CallNodeInfo,
//   IndexIntoCallNodeTable,
//   StackType,
// } from '../../types/profile-derived';
// import type { CallTree } from '../../profile-logic/call-tree';

// export type Props = {|
//   +thread: Thread,
//   +callNodeIndex: IndexIntoCallNodeTable,
//   +maxStackDepth: number,
//   +flameGraphTiming: FlameGraphTiming,
//   +callNodeInfo: CallNodeInfo,
//   +callTree: CallTree,
//   +stackFrameHeight: CssPixels,
//   +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
//   +onSelectionChange: (IndexIntoCallNodeTable | null) => void,
//   +disableTooltips: boolean,
//   +scrollToSelectionGeneration: number,
// |};

/* eslint-disable react/prefer-stateless-function */
export class TooltipCallNode extends React.PureComponent<{||}> {
  render() {
    return null;
    // const {
    //   thread,
    //   callNodeIndex,
    //   callTree,
    //   callNodeInfo: { callNodeTable },
    //   disableTooltips,
    // } = this.props;
    //
    // if (disableTooltips) {
    //   return null;
    // }
    //
    // // TODO - Reviewer, remind me of this.
    // // const stackTiming = flameGraphTiming[depth];
    // // const duration =
    // //   stackTiming.end[flameGraphTimingIndex] -
    // //   stackTiming.start[flameGraphTimingIndex];
    // const duration = 0;
    //
    // const funcIndex = callNodeTable.func[callNodeIndex];
    // const funcName = thread.stringTable.getString(
    //   thread.funcTable.name[funcIndex]
    // );
    //
    // const stackType = getStackType(thread, funcIndex);
    // const background = getBackgroundColor(
    //   stackType,
    //   stackTiming.selfTimeRelative[flameGraphTimingIndex]
    // );
    //
    // let stackTypeLabel;
    // switch (stackType) {
    //   case 'native':
    //     stackTypeLabel = 'Native';
    //     break;
    //   case 'js':
    //     stackTypeLabel = 'JavaScript';
    //     break;
    //   case 'unsymbolicated':
    //     stackTypeLabel = 'Unsymbolicated Native';
    //     break;
    //   default:
    //     throw new Error(`Unknown stack type case "${stackType}".`);
    // }
    //
    // const displayData = callTree.getDisplayData(callNodeIndex);
    //
    // return (
    //   <div className="flameGraphCanvasTooltip">
    //     <div className="tooltipHeader">
    //       <div className="tooltipTiming">{(100 * duration).toFixed(2)}%</div>
    //       <div className="tooltipTitle">{funcName}</div>
    //       <div className="tooltipIcon">
    //         {displayData.icon ? <NodeIcon displayData={displayData} /> : null}
    //       </div>
    //       <div className="tooltipLib">{displayData.lib}</div>
    //     </div>
    //     <div className="tooltipDetails">
    //       <div className="tooltipLabel">Stack Type:</div>
    //       <div>
    //         <div
    //           className="tooltipSwatch"
    //           style={{ backgroundColor: background }}
    //         />
    //         {stackTypeLabel}
    //       </div>
    //       <div className="tooltipLabel">Running Time:</div>
    //       <div>{displayData.totalTimeWithUnit}</div>
    //       <div className="tooltipLabel">Self Time:</div>
    //       <div>{displayData.selfTimeWithUnit}</div>
    //     </div>
    //   </div>
    // );
  }
}
