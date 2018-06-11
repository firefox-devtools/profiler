/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../utils/connect';
import ThreadActivityGraph from '../header/ThreadActivityGraph';
import ThreadStackGraph from '../header/ThreadStackGraph';
import { withChartViewport } from '../shared/chart/Viewport';
import {
  selectedThreadSelectors,
  getSelection,
  getProfile,
  getDisplayRange,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';
import {
  changeSelectedCallNode,
  focusCallTree,
} from '../../actions/profile-view';

import type {
  Thread,
  ThreadIndex,
  CategoryList,
  StackTable,
  IndexIntoStackTable,
  IndexIntoSamplesTable,
} from '../../types/profile';
import type { Milliseconds } from '../../types/units';
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
  +fullThread: Thread,
  +filteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
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
    (this: any)._onSampleClick = this._onSampleClick.bind(this);
  }

  _onSampleClick(sampleIndex: IndexIntoSamplesTable) {
    const {
      fullThread,
      filteredThread,
      callNodeInfo,
      selectedThreadIndex,
      changeSelectedCallNode,
      focusCallTree,
    } = this.props;
    const unfilteredStack = fullThread.samples.stack[sampleIndex];
    const filteredStack = filteredThread.samples.stack[sampleIndex];
    let newSelectedCallNode = -1;
    if (unfilteredStack !== null && filteredStack !== null) {
      const categoryEntranceStack = findLastCategoryChangeInStack(
        filteredStack,
        filteredThread.stackTable
      );
      const newSelectedStack =
        categoryEntranceStack !== null ? categoryEntranceStack : filteredStack;
      newSelectedCallNode =
        callNodeInfo.stackIndexToCallNodeIndex[newSelectedStack];
      changeSelectedCallNode(
        selectedThreadIndex,
        getCallNodePathFromIndex(
          callNodeInfo.stackIndexToCallNodeIndex[filteredStack],
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
      fullThread,
      filteredThread,
      interval,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      categories,
      selectedSamples,
    } = this.props;

    return (
      <div>
        <ThreadActivityGraph
          interval={interval}
          fullThread={fullThread}
          className="selectedThreadActivityGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          callNodeInfo={callNodeInfo}
          selectedCallNodeIndex={selectedCallNodeIndex}
          onSampleClick={this._onSampleClick}
          categories={categories}
          selectedSamples={selectedSamples}
        />
        <ThreadStackGraph
          interval={interval}
          thread={filteredThread}
          className="selectedThreadStackGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          callNodeInfo={callNodeInfo}
          selectedCallNodeIndex={selectedCallNodeIndex}
          onSampleClick={this._onSampleClick}
          upsideDown={true}
        />
      </div>
    );
  }
}

function viewportNeedsUpdate() {
  // By always returning false we prevent the viewport from being
  // reset and scrolled all the way to the bottom when doing
  // operations like changing the time selection or applying a
  // transform.
  return false;
}

const options: ExplicitConnectOptions<*, *, *> = {
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
      chartProps: {
        interval: getProfile(state).meta.interval,
        selectedThreadIndex: getSelectedThreadIndex(state),
        fullThread: selectedThreadSelectors.getRangeFilteredThread(state),
        filteredThread: selectedThreadSelectors.getFilteredThread(state),
        rangeStart,
        rangeEnd,
        callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
        selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
          state
        ),
        categories: getProfile(state).meta.categories,
        selectedSamples: selectedThreadSelectors.getSelectedSamplesInFilteredThread(
          state
        ),
      },
      viewportProps: {
        timeRange: getDisplayRange(state),
        maxViewportHeight: 0,
        maximumZoom: 0.0001,
        selection: profileSelection,
        startsAtBottom: true,
        disableHorizontalMovement: false,
        className: 'selectedThreadActivityGraphViewport',
        viewportNeedsUpdate,
      },
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    focusCallTree,
  },
  component: withChartViewport(SelectedThreadActivityGraph),
};
export default explicitConnect(options);
