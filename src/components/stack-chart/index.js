/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
  JS_TRACER_MAXIMUM_CHART_ZOOM,
} from '../../app-logic/constants';
import explicitConnect from '../../utils/connect';
import StackChartCanvas from './Canvas';
import {
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getCategories,
  getPageList,
  getZeroAt,
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getShowUserTimings,
  getSelectedThreadIndex,
} from '../../selectors/url-state';
import StackChartEmptyReasons from './StackChartEmptyReasons';
import StackSettings from '../shared/StackSettings';
import TransformNavigator from '../shared/TransformNavigator';
import {
  updatePreviewSelection,
  changeSelectedCallNode,
  changeRightClickedCallNode,
  changeRightClickedReact,
} from '../../actions/profile-view';

import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';
import type { Thread, CategoryList, PageList } from '../../types/profile';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CombinedTimingRows,
  MarkerIndex,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { PreviewSelection } from '../../types/actions';
import type { ConnectedProps } from '../../utils/connect';

require('./index.css');

const STACK_FRAME_HEIGHT = 16;

type StateProps = {|
  +thread: Thread,
  +pages: PageList | null,
  +maxStackDepth: number,
  +combinedTimingRows: CombinedTimingRows,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +previewSelection: PreviewSelection,
  +threadIndex: number,
  +callNodeInfo: CallNodeInfo,
  +categories: CategoryList,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +rightClickedCallNodeIndex: IndexIntoCallNodeTable | null,
  +scrollToSelectionGeneration: number,
  getMarker: Function,
  +userTimings: MarkerIndex[],
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +changeRightClickedCallNode: typeof changeRightClickedCallNode,
  +changeRightClickedReact: typeof changeRightClickedReact,
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class StackChartGraph extends React.PureComponent<Props> {
  _viewport: HTMLDivElement | null = null;
  /**
   * Determine the maximum amount available to zoom in.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const {
      timeRange: { start, end },
      interval,
      thread,
    } = this.props;
    // JS Tracer does not care about the interval.
    const modifier = thread.jsTracer ? JS_TRACER_MAXIMUM_CHART_ZOOM : interval;
    return modifier / (end - start);
  }

  _onSelectedCallNodeChange = (
    callNodeorMarkerIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadIndex, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadIndex,
      getCallNodePathFromIndex(
        callNodeorMarkerIndex,
        callNodeInfo.callNodeTable
      )
    );
  };

  _onRightClickReact = (data: Object | null) => {
    console.log('index _onRightClick()', data);
    const { threadIndex, changeRightClickedReact } = this.props;

    changeRightClickedReact(threadIndex, data);
  };

  _onRightClickedCallNodeChange = (
    callNodeorMarkerIndex: IndexIntoCallNodeTable | null
  ) => {
    const {
      callNodeInfo,
      threadIndex,
      changeRightClickedCallNode,
    } = this.props;

    changeRightClickedCallNode(
      threadIndex,
      getCallNodePathFromIndex(
        callNodeorMarkerIndex,
        callNodeInfo.callNodeTable
      )
    );
  };

  _shouldDisplayTooltips = () => this.props.rightClickedCallNodeIndex === null;
  _shouldDisplayTooltipsReact = () => this.props.rightClickedReactData === null;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  _focusViewport = () => {
    if (this._viewport) {
      this._viewport.focus();
    }
  };

  componentDidMount() {
    this._focusViewport();
  }

  render() {
    const {
      thread,
      threadIndex,
      maxStackDepth,
      combinedTimingRows,
      timeRange,
      interval,
      previewSelection,
      updatePreviewSelection,
      callNodeInfo,
      categories,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
      pages,
      getMarker,
      userTimings,
      zeroAt,
    } = this.props;

    const maxViewportHeight = maxStackDepth * STACK_FRAME_HEIGHT;

    return (
      <div
        className="stackChart"
        id="stack-chart-tab"
        role="tabpanel"
        aria-labelledby="stack-chart-tab-button"
      >
        <StackSettings disableCallTreeSummaryButtons={true} />
        <TransformNavigator />
        {maxStackDepth === 0 && userTimings.length === 0 ? (
          <StackChartEmptyReasons />
        ) : (
          <div className="stackChartContent">
            <StackChartCanvas
              viewportProps={{
                previewSelection,
                timeRange,
                maxViewportHeight,
                viewportNeedsUpdate,
                marginLeft: TIMELINE_MARGIN_LEFT,
                marginRight: TIMELINE_MARGIN_RIGHT,
                maximumZoom: this.getMaximumZoom(),
                containerRef: this._takeViewportRef,
              }}
              chartProps={{
                interval,
                thread,
                pages,
                threadIndex,
                combinedTimingRows,
                getMarker,
                // $FlowFixMe Error introduced by upgrading to v0.96.0. See issue #1936.
                updatePreviewSelection,
                rangeStart: timeRange.start,
                rangeEnd: timeRange.end,
                stackFrameHeight: STACK_FRAME_HEIGHT,
                callNodeInfo,
                categories,
                selectedCallNodeIndex,
                onSelectionChange: this._onSelectedCallNodeChange,
                onRightClick: this._onRightClickedCallNodeChange,
                onRightClickReact: this._onRightClickReact,
                shouldDisplayTooltipsReact: this._shouldDisplayTooltipsReact,
                shouldDisplayTooltips: this._shouldDisplayTooltips,
                scrollToSelectionGeneration,
                zeroAt,
              }}
            />
          </div>
        )}
      </div>
    );
  }
}

export default explicitConnect<{||}, StateProps, DispatchProps>({
  mapStateToProps: state => {
    const showUserTimings = getShowUserTimings(state);
    const combinedTimingRows = showUserTimings
      ? selectedThreadSelectors.getCombinedTimingRows(state)
      : selectedThreadSelectors.getStackTimingByDepth(state);

    return {
      thread: selectedThreadSelectors.getFilteredThread(state),
      maxStackDepth: selectedThreadSelectors.getCallNodeMaxDepth(state),
      combinedTimingRows,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      previewSelection: getPreviewSelection(state),
      threadIndex: getSelectedThreadIndex(state),
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      categories: getCategories(state),
      selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
        state
      ),
      rightClickedReactData: selectedThreadSelectors.getRightClickedReactData(
        state
      ),
      rightClickedCallNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(
        state
      ),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      pages: getPageList(state),
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      userTimings: selectedThreadSelectors.getUserTimingMarkerIndexes(state),
      zeroAt: getZeroAt(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    changeRightClickedReact,
    updatePreviewSelection,
  },
  component: StackChartGraph,
});

// This function is given the StackChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +combinedTimingRows: CombinedTimingRows },
  newProps: { +combinedTimingRows: CombinedTimingRows }
) {
  return prevProps.combinedTimingRows !== newProps.combinedTimingRows;
}
