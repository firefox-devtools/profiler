/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import ThreadActivityGraph from '../header/ThreadActivityGraph';
import ThreadStackGraph from '../header/ThreadStackGraph';
import {
  selectedThreadSelectors,
  getSelection,
  getProfile,
  getDisplayRange,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import {
  getSampleIndexClosestToTime,
  getCallNodePathFromIndex,
  getSelectedSamples,
} from '../../profile-logic/profile-data';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import ProfileThreadJankOverview from '../header/ProfileThreadJankOverview';
import ProfileThreadTracingMarkerOverview from '../header/ProfileThreadTracingMarkerOverview';
import {
  changeSelectedThread,
  updateProfileSelection,
  changeRightClickedThread,
  changeSelectedCallNode,
  focusCallTree,
} from '../../actions/profile-view';
import EmptyThreadIndicator from '../header/EmptyThreadIndicator';

import type {
  Thread,
  ThreadIndex,
  CategoryList,
  StackTable,
  IndexIntoFrameTable,
  IndexIntoStackTable,
} from '../../types/profile';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type { State } from '../../types/reducers';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

type OwnProps = {||};

type StateProps = {|
  +selectedThreadIndex: ThreadIndex,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +thread: Thread,
  +threadName: string,
  +processDetails: string,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +unfilteredSamplesRange: StartEndRange | null,
  +categories: CategoryList,
  +selectedSamples: boolean[],
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

function findLastCategoryChangeInStack(
  stackIndex: IndexIntoStackTable,
  stackTable: StackTable
): IndexIntoStackTable | null {
  const stackCategory = stackTable.category[stackIndex];
  for (
    let previousStack = stackIndex,
      currentStack = stackTable.prefix[stackIndex];
    currentStack !== null;
    previousStack = currentStack, currentStack = stackTable.prefix[currentStack]
  ) {
    if (stackTable.category[currentStack] !== stackCategory) {
      return previousStack;
    }
  }
  return null;
}

class SelectedThreadActivityGraph extends PureComponent<Props> {
  constructor(props) {
    super(props);
    (this: any)._onStackClick = this._onStackClick.bind(this);
  }

  _onStackClick(time: number) {
    const { selectedThreadIndex, interval } = this.props;
    const {
      thread,
      callNodeInfo,
      changeSelectedCallNode,
      focusCallTree,
    } = this.props;
    const sampleIndex = getSampleIndexClosestToTime(
      thread.samples,
      time,
      interval
    );
    const sampleStack = thread.samples.stack[sampleIndex];
    let newSelectedCallNode = -1;
    if (sampleStack !== null) {
      const categoryEntranceStack = findLastCategoryChangeInStack(
        sampleStack,
        thread.stackTable
      );
      const newSelectedStack =
        categoryEntranceStack !== null ? categoryEntranceStack : sampleStack;
      newSelectedCallNode =
        callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
      changeSelectedCallNode(
        selectedThreadIndex,
        getCallNodePathFromIndex(
          callNodeInfo.stackIndexToCallNodeIndex[sampleStack],
          callNodeInfo.callNodeTable
        )
      );
      changeSelectedCallNode(
        selectedThreadIndex,
        getCallNodePathFromIndex(
          newSelectedCallNode,
          callNodeInfo.callNodeTable
        )
      );
    } else {
      changeSelectedCallNode(selectedThreadIndex, []);
    }
    focusCallTree();
  }
  render() {
    const {
      thread,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      threadName,
      processDetails,
      unfilteredSamplesRange,
      categories,
      selectedSamples,
    } = this.props;

    return (
      <div>
        <ThreadActivityGraph
          interval={interval}
          fullThread={thread}
          className="selectedThreadActivityGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          callNodeInfo={callNodeInfo}
          selectedCallNodeIndex={selectedCallNodeIndex}
          onStackClick={this._onStackClick}
          categories={categories}
          selectedSamples={selectedSamples}
        />
        <ThreadStackGraph
          interval={interval}
          thread={thread}
          className="selectedThreadStackGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          callNodeInfo={callNodeInfo}
          selectedCallNodeIndex={selectedCallNodeIndex}
          onStackClick={this._onStackClick}
          upsideDown={true}
        />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, DispatchProps> = {
  mapStateToProps: (state: State) => {
    const displayRange = getDisplayRange(state);
    const profileSelection = getSelection(state);
    const rangeStart = profileSelection.hasSelection
      ? profileSelection.selectionStart
      : displayRange.start;
    const rangeEnd = profileSelection.hasSelection
      ? profileSelection.selectionEnd
      : displayRange.end;
    return {
      interval: getProfile(state).meta.interval,
      selectedThreadIndex: getSelectedThreadIndex(state),
      thread: selectedThreadSelectors.getRangeFilteredThread(state),
      threadName: selectedThreadSelectors.getFriendlyThreadName(state),
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
      rangeStart,
      rangeEnd,
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
        state
      ),
      unfilteredSamplesRange: selectedThreadSelectors.unfilteredSamplesRange(
        state
      ),
      categories: getProfile(state).meta.categories,
      selectedSamples: selectedThreadSelectors.getSelectedSamplesInFilteredThread(
        state
      ),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    focusCallTree,
  },
  component: SelectedThreadActivityGraph,
};
export default explicitConnect(options);
