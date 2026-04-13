/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';
import {
  TIMELINE_MARGIN_RIGHT,
  JS_TRACER_MAXIMUM_CHART_ZOOM,
  TIMELINE_MARGIN_LEFT,
} from '../../app-logic/constants';
import explicitConnect from '../../utils/connect';
import { StackChartCanvas } from './Canvas';
import {
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getCategories,
  getInnerWindowIDToPageMap,
  getProfileUsesMultipleStackTypes,
  getProfileTimelineUnit,
} from '../../selectors/profile';
import {
  getStackChartSameWidths,
  getShowUserTimings,
  getSelectedThreadsKey,
} from 'firefox-profiler/selectors/url-state';
import type { SameWidthsIndexToTimestampMap } from 'firefox-profiler/profile-logic/stack-timing';
import { selectedThreadSelectors } from '../../selectors/per-thread';
import { StackChartEmptyReasons } from './StackChartEmptyReasons';
import { ContextMenuTrigger } from '../shared/ContextMenuTrigger';
import { StackSettings } from '../shared/StackSettings';
import { TransformNavigator } from '../shared/TransformNavigator';
import {
  updatePreviewSelection,
  changeSelectedCallNode,
  changeRightClickedCallNode,
  handleCallNodeTransformShortcut,
  updateBottomBoxContentsAndMaybeOpen,
  changeMouseTimePosition,
} from '../../actions/profile-view';

import { getBottomBoxInfoForCallNode } from '../../profile-logic/bottom-box';

import type {
  Thread,
  CategoryList,
  IndexIntoCallNodeTable,
  CombinedTimingRows,
  MarkerIndex,
  Marker,
  Milliseconds,
  UnitIntervalOfProfileRange,
  StartEndRange,
  PreviewSelection,
  WeightType,
  ThreadsKey,
  InnerWindowID,
  Page,
  TimelineUnit,
} from 'firefox-profiler/types';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type { ConnectedProps } from '../../utils/connect';

import './index.css';

const STACK_FRAME_HEIGHT = 16;

type OwnProps = {
  readonly filterScrollPos?: number;
  readonly setFilterScrollPos?: (pos: number) => void;
};

type StateProps = {
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly combinedTimingRows: CombinedTimingRows;
  readonly sameWidthsIndexToTimestampMap: SameWidthsIndexToTimestampMap;
  readonly timeRange: StartEndRange;
  readonly interval: Milliseconds;
  readonly previewSelection: PreviewSelection | null;
  readonly threadsKey: ThreadsKey;
  readonly callNodeInfo: CallNodeInfo;
  readonly categories: CategoryList;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly scrollToSelectionGeneration: number;
  readonly getMarker: (param: MarkerIndex) => Marker;
  readonly userTimings: MarkerIndex[];
  readonly displayStackType: boolean;
  readonly hasFilteredCtssSamples: boolean;
  readonly useStackChartSameWidths: boolean;
  readonly timelineUnit: TimelineUnit;
};

type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly updatePreviewSelection: typeof updatePreviewSelection;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
  readonly changeMouseTimePosition: typeof changeMouseTimePosition;
};

type Props = ConnectedProps<OwnProps, StateProps, DispatchProps>;

class StackChartImpl extends React.PureComponent<Props> {
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
    const { callNodeInfo, threadsKey, changeSelectedCallNode } = this.props;
    changeSelectedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
  };

  _onRightClickedCallNodeChange = (callNodeIndex: number | null) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;

    changeRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
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

  _handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const {
      threadsKey,
      thread,
      callNodeInfo,
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      handleCallNodeTransformShortcut,
      updateBottomBoxContentsAndMaybeOpen,
    } = this.props;

    const nodeIndex =
      rightClickedCallNodeIndex !== null
        ? rightClickedCallNodeIndex
        : selectedCallNodeIndex;
    if (nodeIndex === null) {
      return;
    }

    if (event.key === 'Enter') {
      const bottomBoxInfo = getBottomBoxInfoForCallNode(
        nodeIndex,
        callNodeInfo,
        thread,
        thread.samples
      );
      updateBottomBoxContentsAndMaybeOpen('stack-chart', bottomBoxInfo);
      return;
    }

    handleCallNodeTransformShortcut(event, threadsKey, nodeIndex);
  };

  _onDoubleClick = (callNodeIndex: IndexIntoCallNodeTable | null) => {
    if (callNodeIndex === null) {
      return;
    }

    const { thread, callNodeInfo, updateBottomBoxContentsAndMaybeOpen } =
      this.props;

    const bottomBoxInfo = getBottomBoxInfoForCallNode(
      callNodeIndex,
      callNodeInfo,
      thread,
      thread.samples
    );
    updateBottomBoxContentsAndMaybeOpen('stack-chart', bottomBoxInfo);
  };

  _onCopy = (event: ClipboardEvent) => {
    if (document.activeElement === this._viewport) {
      event.preventDefault();
      const { callNodeInfo, selectedCallNodeIndex, thread } = this.props;
      if (selectedCallNodeIndex !== null) {
        const funcIndex = callNodeInfo.funcForNode(selectedCallNodeIndex);
        const funcName = thread.stringTable.getString(
          thread.funcTable.name[funcIndex]
        );
        if (event.clipboardData) {
          event.clipboardData.setData('text/plain', funcName);
        }
      }
    }
  };

  override componentDidMount() {
    document.addEventListener('copy', this._onCopy, false);
    this._focusViewport();
  }

  override componentWillUnmount() {
    document.removeEventListener('copy', this._onCopy, false);
  }

  override render() {
    const {
      thread,
      threadsKey,
      combinedTimingRows,
      sameWidthsIndexToTimestampMap,
      timeRange,
      interval,
      previewSelection,
      changeMouseTimePosition,
      callNodeInfo,
      categories,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
      innerWindowIDToPageMap,
      getMarker,
      userTimings,
      weightType,
      displayStackType,
      hasFilteredCtssSamples,
      useStackChartSameWidths,
      timelineUnit,
      filterScrollPos,
      setFilterScrollPos,
    } = this.props;

    const maxViewportHeight = combinedTimingRows.length * STACK_FRAME_HEIGHT;

    return (
      <div
        className="stackChart"
        id="stack-chart-tab"
        role="tabpanel"
        aria-labelledby="stack-chart-tab-button"
      >
        <StackSettings hideInvertCallstack={true} />
        <TransformNavigator
          filterScrollPos={filterScrollPos}
          setFilterScrollPos={setFilterScrollPos}
        />
        {!hasFilteredCtssSamples && userTimings.length === 0 ? (
          <StackChartEmptyReasons />
        ) : (
          <ContextMenuTrigger
            id="CallNodeContextMenu"
            attributes={{
              className: 'treeViewContextMenu',
            }}
          >
            <div className="stackChartContent" onKeyDown={this._handleKeyDown}>
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
                  weightType,
                  innerWindowIDToPageMap,
                  threadsKey,
                  combinedTimingRows,
                  sameWidthsIndexToTimestampMap,
                  getMarker,
                  changeMouseTimePosition,
                  rangeStart: timeRange.start,
                  rangeEnd: timeRange.end,
                  stackFrameHeight: STACK_FRAME_HEIGHT,
                  callNodeInfo,
                  categories,
                  selectedCallNodeIndex,
                  onDoubleClick: this._onDoubleClick,
                  onSelectionChange: this._onSelectedCallNodeChange,
                  // TODO: support right clicking user timing markers #2354.
                  onRightClick: this._onRightClickedCallNodeChange,
                  shouldDisplayTooltips: this._shouldDisplayTooltips,
                  scrollToSelectionGeneration,
                  marginLeft: TIMELINE_MARGIN_LEFT,
                  displayStackType: displayStackType,
                  useStackChartSameWidths,
                  timelineUnit,
                }}
              />
            </div>
          </ContextMenuTrigger>
        )}
      </div>
    );
  }
}

export const StackChart = explicitConnect<OwnProps, StateProps, DispatchProps>({
  mapStateToProps: (state) => {
    const showUserTimings = getShowUserTimings(state);
    const combinedTimingRows = showUserTimings
      ? selectedThreadSelectors.getCombinedTimingRows(state)
      : selectedThreadSelectors.getStackTimingByDepth(state);

    return {
      thread: selectedThreadSelectors.getFilteredThread(state),
      // Use the raw WeightType here, as the stack chart does not use the call tree
      weightType: selectedThreadSelectors.getSamplesWeightType(state),
      combinedTimingRows,
      sameWidthsIndexToTimestampMap:
        selectedThreadSelectors.getSameWidthsIndexToTimestampMap(state),
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      previewSelection: getPreviewSelection(state),
      threadsKey: getSelectedThreadsKey(state),
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      categories: getCategories(state),
      selectedCallNodeIndex:
        selectedThreadSelectors.getSelectedCallNodeIndex(state),
      rightClickedCallNodeIndex:
        selectedThreadSelectors.getRightClickedCallNodeIndex(state),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
      innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
      getMarker: selectedThreadSelectors.getMarkerGetter(state),
      userTimings: selectedThreadSelectors.getUserTimingMarkerIndexes(state),
      displayStackType: getProfileUsesMultipleStackTypes(state),
      hasFilteredCtssSamples:
        selectedThreadSelectors.getHasFilteredCtssSamples(state),
      useStackChartSameWidths: getStackChartSameWidths(state),
      timelineUnit: getProfileTimelineUnit(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    updatePreviewSelection,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
    changeMouseTimePosition,
  },
  component: StackChartImpl,
});

// This function is given the StackChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { readonly combinedTimingRows: CombinedTimingRows },
  newProps: { readonly combinedTimingRows: CombinedTimingRows }
) {
  return prevProps.combinedTimingRows !== newProps.combinedTimingRows;
}
