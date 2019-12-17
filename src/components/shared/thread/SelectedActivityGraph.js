/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import explicitConnect from '../../../utils/connect';
import ThreadActivityGraph from './ActivityGraph';
import ThreadStackGraph from './StackGraph';
import { withChartViewport } from '../chart/Viewport';
import {
  getPreviewSelection,
  getProfile,
  getCommittedRange,
} from 'selectors/profile';
import { selectedThreadSelectors } from 'selectors/per-thread';
import { getSelectedThreadIndex } from 'selectors/url-state';
import {
  selectBestAncestorCallNodeAndExpandCallTree,
  focusCallTree,
  selectLeafCallNode,
} from '../../../actions/profile-view';

import type {
  Thread,
  ThreadIndex,
  CategoryList,
  IndexIntoSamplesTable,
} from '../../../types/profile';
import type { Milliseconds, StartEndRange } from '../../../types/units';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  SelectedState,
} from '../../../types/profile-derived';
import type { State } from '../../../types/state';
import type { PreviewSelection } from '../../../types/actions';
import type { ConnectedProps } from '../../../utils/connect';
import type { Viewport } from '../chart/Viewport';

type CanvasProps = {|
  // The viewport property is injected by the withViewport component, but is not
  // actually used or needed in this case. However, withViewport has side effects
  // of enabling event listeners for adjusting the view.
  +viewport: Viewport,
  +selectedThreadIndex: ThreadIndex,
  +interval: Milliseconds,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +fullThread: Thread,
  +filteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +categories: CategoryList,
  +samplesSelectedStates: null | SelectedState[],
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
  +selectBestAncestorCallNodeAndExpandCallTree: typeof selectBestAncestorCallNodeAndExpandCallTree,
  +selectLeafCallNode: typeof selectLeafCallNode,
  +focusCallTree: typeof focusCallTree,
|};

class SelectedThreadActivityGraphCanvas extends PureComponent<CanvasProps> {
  /**
   *
   */
  _onActivitySampleClick = (sampleIndex: IndexIntoSamplesTable) => {
    const {
      selectedThreadIndex,
      selectBestAncestorCallNodeAndExpandCallTree,
      focusCallTree,
    } = this.props;
    selectBestAncestorCallNodeAndExpandCallTree(
      selectedThreadIndex,
      sampleIndex
    );
    focusCallTree();
  };

  _onStackSampleClick = (sampleIndex: IndexIntoSamplesTable) => {
    const {
      selectedThreadIndex,
      selectLeafCallNode,
      focusCallTree,
    } = this.props;
    selectLeafCallNode(selectedThreadIndex, sampleIndex);
    focusCallTree();
  };

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
      samplesSelectedStates,
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
          onSampleClick={this._onActivitySampleClick}
          categories={categories}
          samplesSelectedStates={samplesSelectedStates}
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
          onSampleClick={this._onStackSampleClick}
          categories={categories}
          stacksGrowFromCeiling={true}
        />
      </div>
    );
  }
}

const SelectedThreadActivityGraphCanvasWithViewport = withChartViewport(
  SelectedThreadActivityGraphCanvas
);

/**
 * The viewport contents never change size from this component, so it never needs
 * explicit updating, outside of how the viewport manages its own size and positioning.
 */
function viewportNeedsUpdate() {
  return false;
}

type OwnProps = {||};

type StateProps = {|
  +selectedThreadIndex: ThreadIndex,
  +interval: Milliseconds,
  +timeRange: StartEndRange,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +fullThread: Thread,
  +filteredThread: Thread,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +categories: CategoryList,
  +previewSelection: PreviewSelection,
  +samplesSelectedStates: null | SelectedState[],
  +treeOrderSampleComparator: (
    IndexIntoSamplesTable,
    IndexIntoSamplesTable
  ) => number,
|};

type DispatchProps = {|
  +selectBestAncestorCallNodeAndExpandCallTree: typeof selectBestAncestorCallNodeAndExpandCallTree,
  +selectLeafCallNode: typeof selectLeafCallNode,
  +focusCallTree: typeof focusCallTree,
|};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class SelectedThreadActivityGraph extends PureComponent<Props> {
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
      samplesSelectedStates,
      treeOrderSampleComparator,
      previewSelection,
      selectBestAncestorCallNodeAndExpandCallTree,
      selectLeafCallNode,
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
          samplesSelectedStates,
          treeOrderSampleComparator,
          selectBestAncestorCallNodeAndExpandCallTree,
          selectLeafCallNode,
          focusCallTree,
        }}
        viewportProps={{
          timeRange: timeRange,
          maxViewportHeight: 0,
          maximumZoom: 0.0001,
          previewSelection,
          startsAtBottom: true,
          disableHorizontalMovement: false,
          className: 'selectedThreadActivityGraphViewport',
          viewportNeedsUpdate,
          marginLeft: 0,
          marginRight: 0,
        }}
      />
    );
  }
}

export default explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state: State) => {
    const committedRange = getCommittedRange(state);
    const previewSelection = getPreviewSelection(state);
    const rangeStart = previewSelection.hasSelection
      ? previewSelection.selectionStart
      : committedRange.start;
    const rangeEnd = previewSelection.hasSelection
      ? previewSelection.selectionEnd
      : committedRange.end;
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
      samplesSelectedStates: selectedThreadSelectors.getSamplesSelectedStatesInFilteredThread(
        state
      ),
      treeOrderSampleComparator: selectedThreadSelectors.getTreeOrderComparatorInFilteredThread(
        state
      ),
      timeRange: getCommittedRange(state),
      previewSelection,
    };
  },
  mapDispatchToProps: {
    selectBestAncestorCallNodeAndExpandCallTree,
    selectLeafCallNode,
    focusCallTree,
  },
  component: SelectedThreadActivityGraph,
});
