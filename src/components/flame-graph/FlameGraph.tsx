/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import * as React from 'react';

import {
  FlameGraphCanvas,
  type OwnProps as FlameGraphCanvasProps,
} from './Canvas';
import { ContextMenuTrigger } from 'firefox-profiler/components/shared/ContextMenuTrigger';

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
  SampleCategoriesAndSubcategories,
} from 'firefox-profiler/types';

import type { FlameGraphTiming } from 'firefox-profiler/profile-logic/flame-graph';
import type { CallNodeInfo } from 'firefox-profiler/profile-logic/call-node-info';

import type {
  CallTree,
  CallTreeTimings,
} from 'firefox-profiler/profile-logic/call-tree';

import './FlameGraph.css';

const STACK_FRAME_HEIGHT = 16;

/**
 * How "wide" a call node box needs to be for it to be able to be
 * selected with keyboard navigation. This is a fraction between 0 and
 * 1, where 1 means the box spans the whole viewport.
 */
const SELECTABLE_THRESHOLD = 0.001;

export type Props = {
  readonly thread: Thread;
  readonly weightType: WeightType;
  readonly innerWindowIDToPageMap: Map<InnerWindowID, Page> | null;
  readonly maxStackDepthPlusOne: number;
  readonly timeRange: StartEndRange;
  readonly previewSelection: PreviewSelection | null;
  readonly flameGraphTiming: FlameGraphTiming;
  readonly callTree: CallTree;
  readonly callNodeInfo: CallNodeInfo;
  readonly threadsKey: ThreadsKey;
  readonly selectedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly rightClickedCallNodeIndex: IndexIntoCallNodeTable | null;
  readonly scrollToSelectionGeneration: number;
  readonly categories: CategoryList;
  readonly interval: Milliseconds;
  readonly startsAtBottom: boolean;
  readonly callTreeSummaryStrategy: CallTreeSummaryStrategy;
  readonly ctssSamples: SamplesLikeTable;
  readonly ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  readonly tracedTiming: CallTreeTimings | null;
  readonly displayStackType: boolean;
  readonly contextMenuId?: string;
  readonly onSelectedCallNodeChange: (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => void;
  readonly onRightClickedCallNodeChange: (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => void;
  readonly onCallNodeEnterOrDoubleClick: (
    callNodeIndex: IndexIntoCallNodeTable | null
  ) => void;
  readonly onKeyboardTransformShortcut: (
    event: React.KeyboardEvent<HTMLElement>,
    nodeIndex: IndexIntoCallNodeTable
  ) => void;
};

export interface FlameGraphHandle {
  focus(): void;
}

export class FlameGraph
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

  _shouldDisplayTooltips = () => this.props.rightClickedCallNodeIndex === null;

  _takeViewportRef = (viewport: HTMLDivElement | null) => {
    this._viewport = viewport;
  };

  /* This method is called from ConnectedFlameGraph. */
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

    const depth = callNodeInfo.depthForNode(callNodeIndex);
    const row = flameGraphTiming.getRow(depth);
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

    const depth = callNodeInfo.depthForNode(callNodeIndex);
    const row = flameGraphTiming.getRow(depth);
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
      callTree,
      callNodeInfo,
      selectedCallNodeIndex,
      rightClickedCallNodeIndex,
      onSelectedCallNodeChange,
      onCallNodeEnterOrDoubleClick,
      onKeyboardTransformShortcut,
      startsAtBottom,
    } = this.props;

    if (
      // Please do not forget to update the switch/case below if changing the array to allow more keys.
      ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(event.key)
    ) {
      if (selectedCallNodeIndex === null) {
        // Just select the "root" node if we've got no prior selection.
        onSelectedCallNodeChange(0);
        return;
      }

      // In top-down layout the parent is visually above the selected box, so
      // ArrowUp navigates to the parent and ArrowDown to the first child.
      // In bottom-up layout it's the other way around.
      const isGoToParent = startsAtBottom
        ? event.key === 'ArrowDown'
        : event.key === 'ArrowUp';
      const isGoToChild = startsAtBottom
        ? event.key === 'ArrowUp'
        : event.key === 'ArrowDown';

      if (isGoToParent) {
        const prefix = callNodeInfo.prefixForNode(selectedCallNodeIndex);
        if (prefix !== -1) {
          onSelectedCallNodeChange(prefix);
        }
      } else if (isGoToChild) {
        const [callNodeIndex] = callTree.getChildren(selectedCallNodeIndex);
        // The call nodes returned from getChildren are sorted by
        // total time in descending order.  The first one in the
        // array, which is the one we pick, has the longest time and
        // thus the widest box.

        if (callNodeIndex !== undefined && this._wideEnough(callNodeIndex)) {
          onSelectedCallNodeChange(callNodeIndex);
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const callNodeIndex = this._nextSelectableInRow(
          selectedCallNodeIndex,
          event.key === 'ArrowLeft' ? -1 : 1
        );

        if (callNodeIndex !== undefined) {
          onSelectedCallNodeChange(callNodeIndex);
        }
      } else {
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
      onCallNodeEnterOrDoubleClick(nodeIndex);
      return;
    }

    onKeyboardTransformShortcut(event, nodeIndex);
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
        event.clipboardData!.setData('text/plain', funcName);
      }
    }
  };

  override render() {
    const {
      thread,
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
      startsAtBottom,
      innerWindowIDToPageMap,
      weightType,
      ctssSamples,
      ctssSampleCategoriesAndSubcategories,
      tracedTiming,
      displayStackType,
      contextMenuId = 'CallNodeContextMenu',
      onSelectedCallNodeChange,
      onRightClickedCallNodeChange,
      onCallNodeEnterOrDoubleClick,
    } = this.props;

    const maxViewportHeight = maxStackDepthPlusOne * STACK_FRAME_HEIGHT;

    return (
      <div className="flameGraphContent" onKeyDown={this._handleKeyDown}>
        <ContextMenuTrigger
          id={contextMenuId}
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
              startsAtBottom,
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
              onSelectionChange: onSelectedCallNodeChange,
              onRightClick: onRightClickedCallNodeChange,
              onDoubleClick: onCallNodeEnterOrDoubleClick,
              shouldDisplayTooltips: this._shouldDisplayTooltips,
              interval,
              startsAtBottom,
              ctssSamples,
              ctssSampleCategoriesAndSubcategories,
              tracedTiming,
              displayStackType,
            }}
          />
        </ContextMenuTrigger>
      </div>
    );
  }
}

function viewportNeedsUpdate(
  prevProps: FlameGraphCanvasProps,
  nextProps: FlameGraphCanvasProps
) {
  // By returning false we prevent the viewport from being
  // reset and scrolled all the way to the bottom when doing
  // operations like changing the time selection or applying a
  // transform.
  // We only reset the viewport if the layout direction changes.
  return prevProps.startsAtBottom !== nextProps.startsAtBottom;
}
