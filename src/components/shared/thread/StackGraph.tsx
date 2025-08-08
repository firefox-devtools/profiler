/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';

import { ThreadHeightGraph } from './HeightGraph';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  Milliseconds,
  IndexIntoCallNodeTable,
  SelectedState,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

type Props = {
  readonly className: string;
  readonly thread: Thread;
  readonly samplesSelectedStates: null | SelectedState[];
  readonly sampleNonInvertedCallNodes: Array<IndexIntoCallNodeTable | null>;
  readonly interval: Milliseconds;
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly callNodeInfo: CallNodeInfo;
  readonly categories: CategoryList;
  readonly onSampleClick: (
    event: React.MouseEvent<HTMLCanvasElement>,
    sampleIndex: IndexIntoSamplesTable
  ) => void;
  // Decide which way the stacks grow up from the floor, or down from the ceiling.
  readonly stacksGrowFromCeiling?: boolean;
  readonly trackName: string;
};

export class ThreadStackGraph extends PureComponent<Props> {
  _heightFunction = (sampleIndex: IndexIntoSamplesTable): number | null => {
    const { callNodeInfo, sampleNonInvertedCallNodes } = this.props;
    const nonInvertedCallNodeIndex = sampleNonInvertedCallNodes[sampleIndex];
    if (nonInvertedCallNodeIndex === null) {
      return null;
    }

    const callNodeTable = callNodeInfo.getCallNodeTable();
    return callNodeTable.depth[nonInvertedCallNodeIndex];
  };

  override render() {
    const {
      className,
      thread,
      samplesSelectedStates,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      categories,
      trackName,
      onSampleClick,
    } = this.props;
    const callNodeTable = callNodeInfo.getCallNodeTable();

    let maxDepth = 0;
    for (let i = 0; i < callNodeTable.depth.length; i++) {
      if (callNodeTable.depth[i] > maxDepth) {
        maxDepth = callNodeTable.depth[i];
      }
    }

    return (
      <ThreadHeightGraph
        heightFunc={this._heightFunction}
        maxValue={maxDepth}
        className={className}
        trackName={trackName}
        interval={interval}
        thread={thread}
        samplesSelectedStates={samplesSelectedStates}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        categories={categories}
        onSampleClick={onSampleClick}
      />
    );
  }
}
