/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import { ThreadHeightGraph } from './HeightGraph';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  Milliseconds,
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';
import type { HeightFunctionParams } from './HeightGraph';

type Props = {|
  +className: string,
  +thread: Thread,
  +tabFilteredThread: Thread,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +categories: CategoryList,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable
  ) => void,
  // Decide which way the stacks grow up from the floor, or down from the ceiling.
  +stacksGrowFromCeiling?: boolean,
  +trackName: string,
|};

export class ThreadStackGraph extends PureComponent<Props> {
  _heightFunction = ({
    callNodeIndex,
    yPixelsPerHeight,
  }: HeightFunctionParams): number => {
    const { callNodeInfo } = this.props;
    const { callNodeTable } = callNodeInfo;

    return callNodeTable.depth[callNodeIndex] * yPixelsPerHeight;
  };

  render() {
    const {
      className,
      thread,
      tabFilteredThread,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      categories,
      trackName,
      onSampleClick,
    } = this.props;
    const { callNodeTable } = callNodeInfo;

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
        tabFilteredThread={tabFilteredThread}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
        callNodeInfo={callNodeInfo}
        selectedCallNodeIndex={selectedCallNodeIndex}
        categories={categories}
        onSampleClick={onSampleClick}
      />
    );
  }
}
