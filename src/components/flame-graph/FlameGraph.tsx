/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import { explicitConnectWithForwardRef } from '../../utils/connect';
import { FlameGraphCanvas } from './Canvas';

import {
  getCategories,
  getCommittedRange,
  getPreviewSelection,
  getScrollToSelectionGeneration,
  getProfileInterval,
  getInnerWindowIDToPageMap,
  getProfileUsesMultipleStackTypes,
} from 'firefox-profiler/selectors/profile';
import { selectedThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  getSelectedThreadsKey,
  getInvertCallstack,
} from '../../selectors/url-state';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';
import {
  changeSelectedCallNode,
  changeRightClickedCallNode,
  handleCallNodeTransformShortcut,
  updateBottomBoxContentsAndMaybeOpen,
} from 'firefox-profiler/actions/profile-view';
import { extractNonInvertedCallTreeTimings } from 'firefox-profiler/profile-logic/call-tree';
import { ensureExists } from 'firefox-profiler/utils/flow';

import type {
  Thread,
  CategoryList,
  Milliseconds,
  StartEndRange,
  WeightType,
  SamplesLikeTable,
  PreviewSelection,
  CallTreeSummaryStrategy,
  IndexIntoCallNodeTable,
  ThreadsKey,
  InnerWindowID,
  Page,
} from 'firefox-profiler/types';

import type { FlameGraphTiming } from 'firefox-profiler/profile-logic/flame-graph';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type {
  CallTree,
  CallTreeTimings,
} from 'firefox-profiler/profile-logic/call-tree';

import type { ConnectedProps } from 'firefox-profiler/utils/connect';

import './FlameGraph.css';

const STACK_FRAME_HEIGHT = 16;

/**
 * How "wide" a call node box needs to be for it to be able to be
 * selected with keyboard navigation. This is a fraction between 0 and
 * 1, where 1 means the box spans the whole viewport.
 */
const SELECTABLE_THRESHOLD = 0.001;

type StateProps = {
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly unfilteredThread: Thread;
  readonly ctssSampleIndexOffset: number;
  readonly maxStackDepthPlusOne: number;
  readonly timeRange: StartEndRange;
  readonly previewSelection: PreviewSelection;
  readonly flameGraphTiming: FlameGraphTiming;
  readonly callTree: CallTree;
  readonly callNodeInfo: CallNodeInfo;
  readonly threadsKey: ThreadsKey;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly scrollToSelectionGeneration: number;
  readonly categories: CategoryList;
  readonly interval: Milliseconds;
  readonly isInverted: boolean;
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly unfilteredCtssSamples: SamplesLikeTable;
  readonly tracedTiming: CallTreeTimings | null;
  readonly displayStackType: boolean;
};
type DispatchProps = {
  readonly changeSelectedCallNode: typeof changeSelectedCallNode;
  readonly changeRightClickedCallNode: typeof changeRightClickedCallNode;
  readonly handleCallNodeTransformShortcut: typeof handleCallNodeTransformShortcut;
  readonly updateBottomBoxContentsAndMaybeOpen: typeof updateBottomBoxContentsAndMaybeOpen;
};
type Props = ConnectedProps<{}, StateProps, DispatchProps>;

export interface FlameGraphHandle {
  focus(): void;
}

class FlameGraphImpl
  extends React.PureComponent<Props>
  implements FlameGraphHandle
{
  _viewport: HTMLDivElement | null = null;

  override componentDidMount() {
    document.addEventListener('copy', this._onCopy, false);
  }

  override componentWillUnmount() {
    document.removeEventListener('copy', this._onCopy, false);
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

  _onRightClickedCallNodeChange = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    const { callNodeInfo, threadsKey, changeRightClickedCallNode } = this.props;
    changeRightClickedCallNode(
      threadsKey,
      callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
    );
  };

  _onCallNodeEnterOrDoubleClick = (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => {
    if (callNodeIndex === null) {
      return;
    }
    const { callTree, updateBottomBoxContentsAndMaybeOpen } = this.props;
    const bottomBoxInfo = callTree.getBottomBoxInfoForCallNode(callNodeIndex);
    updateBottomBoxContentsAndMaybeOpen('flame-graph', bottomBoxInfo);
  };

  _shouldDisplayTooltips = () => this.props.rightClickedCallNodeIndex === null;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  /* This method is called from MaybeFlameGraph. */
  /* eslint-disable-next-line react/no-unused-class-component-methods */
  focus = () => {
    if (this._viewport) {
      this._viewport.focus();
    }
  };

  /**
   * Is the box for this call node wide enough to be selected?
   */
  _wideEnough = (callNodeIndex: IndexIntoCallNodeTable): boolean => {
    const { flameGraphTiming, callNodeInfo } = this.props;

    const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    const depth = callNodeTable.depth[callNodeIndex];
    const row = flameGraphTiming[depth];
    const columnIndex = row.callNode.indexOf(callNodeIndex);
    return row.end[columnIndex] - row.start[columnIndex] > SELECTABLE_THRESHOLD;
  };

  /**
   * Return next keyboard selectable callNodeIndex along one
   * horizontal direction.
   *
   * `direction` should be either -1 (left) or 1 (right).
   *
   * Returns undefined if no selectable callNodeIndex can be found.
   * This means we're already at the end, or the boxes of all
   * candidate call nodes are too narrow to be selected.
   */
  _nextSelectableInRow = (
    startingCallNodeIndex: IndexIntoCallNodeTable,
    direction: 1 | -1
  ): IndexIntoCallNodeTable | void => {
    const { flameGraphTiming, callNodeInfo } = this.props;

    let callNodeIndex = startingCallNodeIndex;

    const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
    const depth = callNodeTable.depth[callNodeIndex];
    const row = flameGraphTiming[depth];
    let columnIndex = row.callNode.indexOf(callNodeIndex);

    do {
      columnIndex += direction;
      callNodeIndex = row.callNode[columnIndex];
      if (
        row.end[columnIndex] - row.start[columnIndex] >
        SELECTABLE_THRESHOLD
      ) {
        // The box for this callNodeIndex is wide enough. We've found
        // a candidate.
        break;
      }
    } while (callNodeIndex !== undefined);

    return callNodeIndex;
  };

  _handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const {
      threadsKey,
      callTree,
      callNodeInfo,
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      changeSelectedCallNode,
      handleCallNodeTransformShortcut,
    } = this.props;
    const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();

    if (
      // Please do not forget to update the switch/case below if changing the array to allow more keys.
      ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      if (selectedCallNodeIndex === null) {
        // Just select the "root" node if we've got no prior selection.
        changeSelectedCallNode(
          threadsKey,
          callNodeInfo.getCallNodePathFromIndex(0)
        );
        return;
      }

      switch (event.key) {
        case 'ArrowDown': {
          const prefix = callNodeTable.prefix[selectedCallNodeIndex];
          if (prefix !== -1) {
            changeSelectedCallNode(
              threadsKey,
              callNodeInfo.getCallNodePathFromIndex(prefix)
            );
          }
          break;
        }
        case 'ArrowUp': {
          const [callNodeIndex] = callTree.getChildren(selectedCallNodeIndex);
          // The call nodes returned from getChildren are sorted by
          // total time in descending order.  The first one in the
          // array, which is the one we pick, has the longest time and
          // thus the widest box.

          if (callNodeIndex !== undefined && this._wideEnough(callNodeIndex)) {
            changeSelectedCallNode(
              threadsKey,
              callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
            );
          }
          break;
        }
        case 'ArrowLeft':
        case 'ArrowRight': {
          const callNodeIndex = this._nextSelectableInRow(
            selectedCallNodeIndex,
            event.key === 'ArrowLeft' ? -1 : 1
          );

          if (callNodeIndex !== undefined) {
            changeSelectedCallNode(
              threadsKey,
              callNodeInfo.getCallNodePathFromIndex(callNodeIndex)
            );
          }
          break;
        }
        default:
          // We shouldn't arrive here, thanks to the if block at the top.
          console.error(
            `An unknown key "${event.key}" was pressed, this shouldn't happen.`
          );
      }
      return;
    }

    // Otherwise, handle shortcuts for the call node transforms.
    const nodeIndex =
      rightClickedCallNodeIndex !== null
        ? rightClickedCallNodeIndex
        : selectedCallNodeIndex;
    if (nodeIndex === null) {
      return;
    }

    if (event.key === 'Enter') {
      this._onCallNodeEnterOrDoubleClick(nodeIndex);
      return;
    }

    handleCallNodeTransformShortcut(event, threadsKey, nodeIndex);
  };

  _onCopy = (event: ClipboardEvent) => {
    if (document.activeElement === this._viewport) {
      event.preventDefault();
      const { callNodeInfo, selectedCallNodeIndex, thread } = this.props;
      const callNodeTable = callNodeInfo.getNonInvertedCallNodeTable();
      if (selectedCallNodeIndex !== null) {
        const funcIndex = callNodeTable.func[selectedCallNodeIndex];
        const funcName = thread.stringTable.getString(
          thread.funcTable.name[funcIndex]
        );
        event.clipboardData!.setData('text/plain', funcName);
      }
    }
  };

  override render() {
    const {
      thread,
      unfilteredThread,
      ctssSampleIndexOffset,
      threadsKey,
      maxStackDepthPlusOne,
      flameGraphTiming,
      callTree,
      callNodeInfo,
      timeRange,
      previewSelection,
      rightClickedCallNodeIndex,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
      callTreeSummaryStrategy,
      categories,
      interval,
      isInverted,
      innerWindowIDToPageMap,
      weightType,
      ctssSamples,
      unfilteredCtssSamples,
      tracedTiming,
      displayStackType,
    } = this.props;

    // Get the CallTreeTimingsNonInverted out of tracedTiming. We pass this
    // along rather than the more generic CallTreeTimings type so that the
    // FlameGraphCanvas component can operate on the more specialized type.
    // (CallTreeTimingsNonInverted and CallTreeTimingsInverted are very
    // different, and the flame graph is only used with non-inverted timings.)
    const tracedTimingNonInverted =
      tracedTiming !== null
        ? ensureExists(
            extractNonInvertedCallTreeTimings(tracedTiming),
            'The flame graph should only ever see non-inverted timings, see UrlState.getInvertCallstack'
          )
        : null;

    const maxViewportHeight = maxStackDepthPlusOne * STACK_FRAME_HEIGHT;

    return (
      <div className="flameGraphContent" onKeyDown={this._handleKeyDown}>
        <ContextMenuTrigger
          id="CallNodeContextMenu"
          attributes={{
            className: 'treeViewContextMenu',
          }}
        >
          <FlameGraphCanvas
            key={threadsKey}
            // ChartViewport props
            viewportProps={{
              timeRange,
              maxViewportHeight,
              maximumZoom: 1,
              previewSelection,
              startsAtBottom: true,
              disableHorizontalMovement: true,
              viewportNeedsUpdate,
              marginLeft: 0,
              marginRight: 0,
              containerRef: this._takeViewportRef,
            }}
            // FlameGraphCanvas props
            chartProps={{
              thread,
              innerWindowIDToPageMap,
              weightType,
              unfilteredThread,
              ctssSampleIndexOffset,
              maxStackDepthPlusOne,
              flameGraphTiming,
              callTree,
              callNodeInfo,
              categories,
              selectedCallNodeIndex,
              rightClickedCallNodeIndex,
              scrollToSelectionGeneration,
              callTreeSummaryStrategy,
              stackFrameHeight: STACK_FRAME_HEIGHT,
              onSelectionChange: this._onSelectedCallNodeChange,
              onRightClick: this._onRightClickedCallNodeChange,
              onDoubleClick: this._onCallNodeEnterOrDoubleClick,
              shouldDisplayTooltips: this._shouldDisplayTooltips,
              interval,
              isInverted,
              ctssSamples,
              unfilteredCtssSamples,
              tracedTiming: tracedTimingNonInverted,
              displayStackType,
            }}
          />
        </ContextMenuTrigger>
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

export const FlameGraph = explicitConnectWithForwardRef<
  {},
  StateProps,
  DispatchProps,
  FlameGraphHandle
>({
  mapStateToProps: (state) => ({
    thread: selectedThreadSelectors.getFilteredThread(state),
    unfilteredThread: selectedThreadSelectors.getThread(state),
    weightType: selectedThreadSelectors.getWeightTypeForCallTree(state),
    // Use the filtered call node max depth, rather than the preview filtered one, so
    // that the viewport height is stable across preview selections.
    maxStackDepthPlusOne:
      selectedThreadSelectors.getFilteredCallNodeMaxDepthPlusOne(state),
    flameGraphTiming: selectedThreadSelectors.getFlameGraphTiming(state),
    callTree: selectedThreadSelectors.getCallTree(state),
    timeRange: getCommittedRange(state),
    previewSelection: getPreviewSelection(state),
    callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
    categories: getCategories(state),
    threadsKey: getSelectedThreadsKey(state),
    selectedCallNodeIndex:
      selectedThreadSelectors.getSelectedCallNodeIndex(state),
    rightClickedCallNodeIndex:
      selectedThreadSelectors.getRightClickedCallNodeIndex(state),
    scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    interval: getProfileInterval(state),
    isInverted: getInvertCallstack(state),
    callTreeSummaryStrategy:
      selectedThreadSelectors.getCallTreeSummaryStrategy(state),
    innerWindowIDToPageMap: getInnerWindowIDToPageMap(state),
    ctssSamples: selectedThreadSelectors.getPreviewFilteredCtssSamples(state),
    ctssSampleIndexOffset:
      selectedThreadSelectors.getPreviewFilteredCtssSampleIndexOffset(state),
    unfilteredCtssSamples:
      selectedThreadSelectors.getUnfilteredCtssSamples(state),
    tracedTiming: selectedThreadSelectors.getTracedTiming(state),
    displayStackType: getProfileUsesMultipleStackTypes(state),
  }),
  mapDispatchToProps: {
    changeSelectedCallNode,
    changeRightClickedCallNode,
    handleCallNodeTransformShortcut,
    updateBottomBoxContentsAndMaybeOpen,
  },
  options: { forwardRef: true },
  component: FlameGraphImpl,
});
