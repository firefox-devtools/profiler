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
import {
  getCallNodePathFromIndex,
  getSampleCallNodes,
} from '../../profile-logic/profile-data';
import {
  changeSelectedCallNode,
  focusCallTree,
} from '../../actions/profile-view';

import type {
  Thread,
  ThreadIndex,
  CategoryList,
  StackTable,
  SamplesTable,
  IndexIntoSamplesTable,
  IndexIntoCategoryList,
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
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +focusCallTree: typeof focusCallTree,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

function findBestCallNode(
  callNodeInfo: CallNodeInfo,
  sampleCallNodes: Array<IndexIntoCallNodeTable | null>,
  sampleCategories: Array<IndexIntoCategoryList | null>,
  clickedCallNode: IndexIntoCallNodeTable,
  clickedCategory: IndexIntoCategoryList
): IndexIntoCallNodeTable {
  const { callNodeTable } = callNodeInfo;
  if (callNodeTable.category[clickedCallNode] !== clickedCategory) {
    return clickedCallNode;
  }

  const clickedDepth = callNodeTable.depth[clickedCallNode];
  const callNodesOnSameCategoryPath = [clickedCallNode];
  let callNode = clickedCallNode;
  while (true) {
    const parentCallNode = callNodeTable.prefix[callNode];
    if (parentCallNode === -1) {
      // The entire call path is just clickedCategory.
      return clickedCallNode; // TODO: is this a useful behavior?
    }
    if (callNodeTable.category[parentCallNode] !== clickedCategory) {
      break;
    }
    callNodesOnSameCategoryPath.push(parentCallNode);
    callNode = parentCallNode;
  }

  // Now find the callNode in callNodesOnSameCategoryPath with the lowest depth
  // such that selecting it will not highlight any samples whose unfiltered
  // category is different from clickedCategory. If no such callNode exists,
  // return clickedCallNode.

  const handledCallNodes = new Uint8Array(callNodeTable.length);
  function limitSameCategoryPathToCommonAncestor(callNode) {
    const walkUpToDepth =
      clickedDepth - (callNodesOnSameCategoryPath.length - 1);
    let depth = callNodeTable.depth[callNode];
    while (depth >= walkUpToDepth) {
      if (handledCallNodes[callNode]) {
        return;
      }
      handledCallNodes[callNode] = 1;
      if (depth <= clickedDepth) {
        if (callNode === callNodesOnSameCategoryPath[clickedDepth - depth]) {
          callNodesOnSameCategoryPath.length = clickedDepth - depth;
          return;
        }
      }
      callNode = callNodeTable.prefix[callNode];
      depth--;
    }
  }

  for (let sample = 0; sample < sampleCallNodes.length; sample++) {
    if (
      sampleCategories[sample] !== clickedCategory &&
      sampleCallNodes[sample] !== null
    ) {
      limitSameCategoryPathToCommonAncestor(sampleCallNodes[sample]);
    }
  }

  if (callNodesOnSameCategoryPath.length > 0) {
    return callNodesOnSameCategoryPath[callNodesOnSameCategoryPath.length - 1];
  }
  return clickedCallNode;
}

function getSampleCategories(
  samples: SamplesTable,
  stackTable: StackTable
): Array<IndexIntoSamplesTable | null> {
  return samples.stack.map(s => (s !== null ? stackTable.category[s] : null));
}

class SelectedThreadActivityGraphCanvas extends PureComponent<Props> {
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
    if (unfilteredStack === null) {
      return;
    }

    const clickedCategory = fullThread.stackTable.category[unfilteredStack];
    const { callNodeTable, stackIndexToCallNodeIndex } = callNodeInfo;
    const sampleCallNodes = getSampleCallNodes(
      filteredThread.samples,
      stackIndexToCallNodeIndex
    );
    const clickedCallNode = sampleCallNodes[sampleIndex];
    if (clickedCallNode === null) {
      return;
    }

    const sampleCategories = getSampleCategories(
      fullThread.samples,
      fullThread.stackTable
    );
    const chosenCallNode = findBestCallNode(
      callNodeInfo,
      sampleCallNodes,
      sampleCategories,
      clickedCallNode,
      clickedCategory
    );
    // Change selection twice: First, to clickedCallNode, in order to expand
    // the whole call path. Then, to chosenCallNode, to get the large-area
    // graph highlighting.
    changeSelectedCallNode(
      selectedThreadIndex,
      getCallNodePathFromIndex(clickedCallNode, callNodeTable)
    );
    changeSelectedCallNode(
      selectedThreadIndex,
      getCallNodePathFromIndex(chosenCallNode, callNodeTable)
    );
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
      treeOrderSampleComparator,
    } = this.props;

    return (
      <div>
        <ThreadActivityGraph
          interval={interval}
          fullThread={fullThread}
          className="selectedThreadActivityGraph"
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          onSampleClick={this._onSampleClick}
          categories={categories}
          selectedSamples={selectedSamples}
          treeOrderSampleComparator={treeOrderSampleComparator}
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

const SelectedThreadActivityGraphCanvasWithViewport = withChartViewport(
  SelectedThreadActivityGraphCanvas
);

function viewportNeedsUpdate() {
  // By always returning false we prevent the viewport from being
  // reset and scrolled all the way to the bottom when doing
  // operations like changing the time selection or applying a
  // transform.
  return false;
}

class SelectedThreadActivityGraph extends PureComponent<*> {
  render() {
    const {
      interval,
      selectedThreadIndex,
      fullThread,
      filteredThread,
      rangeStart,
      rangeEnd,
      callNodeInfo,
      selectedCallNodeIndex,
      categories,
      selectedSamples,
      treeOrderSampleComparator,
      selection,
      changeSelectedCallNode,
      focusCallTree,
      timeRange,
    } = this.props;
    return (
      <SelectedThreadActivityGraphCanvasWithViewport
        chartProps={{
          interval,
          selectedThreadIndex,
          fullThread,
          filteredThread,
          rangeStart,
          rangeEnd,
          callNodeInfo,
          selectedCallNodeIndex,
          categories,
          selectedSamples,
          treeOrderSampleComparator,
          changeSelectedCallNode,
          focusCallTree,
        }}
        viewportProps={{
          timeRange: timeRange,
          maxViewportHeight: 0,
          maximumZoom: 0.0001,
          selection: selection,
          startsAtBottom: true,
          disableHorizontalMovement: false,
          className: 'selectedThreadActivityGraphViewport',
          viewportNeedsUpdate,
        }}
      />
    );
  }
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
      treeOrderSampleComparator: selectedThreadSelectors.getTreeOrderComparatorInFilteredThread(
        state
      ),
      timeRange: getDisplayRange(state),
      selection: profileSelection,
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    focusCallTree,
  },
  component: SelectedThreadActivityGraph,
};
export default explicitConnect(options);
