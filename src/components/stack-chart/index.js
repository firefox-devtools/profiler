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
} from '../../selectors/profile';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import {
  getShowUserTimings,
  getSelectedThreadIndex,
} from '../../selectors/url-state';
import StackChartEmptyReasons from './StackChartEmptyReasons';
import ContextMenuTrigger from '../shared/ContextMenuTrigger';
import StackSettings from '../shared/StackSettings';
import TransformNavigator from '../shared/TransformNavigator';
import {
  updatePreviewSelection,
  changeSelectedCallNode,
  changeRightClickedCallNode,
} from '../../actions/profile-view';

import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';

import type { Thread, CategoryList, PageList } from '../../types/profile';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
  CombinedTimingRows,
  MarkerIndex,
  Marker,
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
  +getMarker: MarkerIndex => Marker,
  +userTimings: MarkerIndex[],
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +changeRightClickedCallNode: typeof changeRightClickedCallNode,
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
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadIndex, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadIndex,
      getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
    );
  };

  _onRightClickedCallNodeChange = (callNodeIndex: number | null) => {
    const {
      callNodeInfo,
      threadIndex,
      changeRightClickedCallNode,
    } = this.props;

    changeRightClickedCallNode(
      threadIndex,
      getCallNodePathFromIndex(callNodeIndex, callNodeInfo.callNodeTable)
    );
  };

  _shouldDisplayTooltips = () => this.props.rightClickedCallNodeIndex === null;

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
          <ContextMenuTrigger
            id="CallNodeContextMenu"
            attributes={{
              className: 'treeViewContextMenu',
            }}
          >
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
                  // TODO: support right clicking user timing markers #2354.
                  onRightClick: this._onRightClickedCallNodeChange,
                  shouldDisplayTooltips: this._shouldDisplayTooltips,
                  scrollToSelectionGeneration,
                }}
              />
            </div>
          </ContextMenuTrigger>
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
      rightClickedCallNodeIndex: selectedThreadSelectors.getRightClickedCallNodeIndex(
        state
      ),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      pages: getPageList(state),
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      userTimings: selectedThreadSelectors.getUserTimingMarkerIndexes(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
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
