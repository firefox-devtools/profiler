/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import React, { PureComponent } from 'react';

import { ThreadHeightGraph } from './HeightGraph';
import { ensureExists } from 'firefox-profiler/utils/flow';

import type {
  Thread,
  CategoryList,
  IndexIntoSamplesTable,
  Milliseconds,
  SelectedState,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

type Props = {
  +className: string,
  +thread: Thread,
  +samplesSelectedStates: null | SelectedState[],
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +callNodeInfo: CallNodeInfo,
  +categories: CategoryList,
  +onSampleClick: (
    event: SyntheticMouseEvent<>,
    sampleIndex: IndexIntoSamplesTable
  ) => void,
  // Decide which way the stacks grow up from the floor, or down from the ceiling.
  +stacksGrowFromCeiling?: boolean,
  +trackName: string,
};

export class ThreadCPUGraph extends PureComponent<Props> {
  _heightFunction = (sampleIndex: IndexIntoSamplesTable): number | null => {
    const { thread } = this.props;
    const { samples } = thread;

    // Because the cpu value for one sample is about the interval between this
    // sample and the sample before it, in this function we need to look ahead
    // of one sample.
    if (sampleIndex >= samples.length - 1) {
      return 0;
    }
    return ensureExists(samples.threadCPURatio)[sampleIndex + 1] || 0;
  };

  render() {
    const {
      className,
      thread,
      samplesSelectedStates,
      interval,
      rangeStart,
      rangeEnd,
      categories,
      trackName,
      onSampleClick,
    } = this.props;

    // Making the CPU graph a histogram graph instead of a line graph here,
    // because making this histogram graph helps us see the real sample
    // positions better and helps us see the gaps between the samples.
    return (
      <ThreadHeightGraph
        heightFunc={this._heightFunction}
        maxValue={1}
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
