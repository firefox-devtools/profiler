/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import {
  TIMELINE_MARGIN_LEFT,
  TIMELINE_MARGIN_RIGHT,
} from '../../app-logic/constants';
import explicitConnect from '../../utils/connect';
import StackChartCanvas from './Canvas';
import {
  selectedThreadSelectors,
  getCommittedRange,
  getProfileInterval,
  getPreviewSelection,
  getScrollToSelectionGeneration,
} from '../../reducers/profile-view';
import { getSelectedThreadIndex } from '../../reducers/url-state';
import {
  getCategoryColorStrategy,
  getLabelingStrategy,
} from '../../reducers/stack-chart';
import StackSettings from '../shared/StackSettings';
import {
  updatePreviewSelection,
  changeSelectedCallNode,
} from '../../actions/profile-view';

import { getCallNodePathFromIndex } from '../../profile-logic/profile-data';
import type { Thread } from '../../types/profile';
import type {
  CallNodeInfo,
  IndexIntoCallNodeTable,
} from '../../types/profile-derived';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { StackTimingByDepth } from '../../profile-logic/stack-timing';
import type { GetCategory } from '../../profile-logic/color-categories';
import type { GetLabel } from '../../profile-logic/labeling-strategies';
import type { PreviewSelection } from '../../types/actions';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

require('./index.css');

const STACK_FRAME_HEIGHT = 16;

type StateProps = {|
  +thread: Thread,
  +maxStackDepth: number,
  +stackTimingByDepth: StackTimingByDepth,
  +timeRange: { start: Milliseconds, end: Milliseconds },
  +interval: Milliseconds,
  +getCategory: GetCategory,
  +getLabel: GetLabel,
  +previewSelection: PreviewSelection,
  +threadIndex: number,
  +callNodeInfo: CallNodeInfo,
  +selectedCallNodeIndex: IndexIntoCallNodeTable | null,
  +scrollToSelectionGeneration: number,
|};

type DispatchProps = {|
  +changeSelectedCallNode: typeof changeSelectedCallNode,
  +updatePreviewSelection: typeof updatePreviewSelection,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

class StackChartGraph extends React.PureComponent<Props> {
  _viewport: HTMLDivElement | null = null;
  /**
   * Determine the maximum amount available to zoom in.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const { timeRange: { start, end }, interval } = this.props;
    return interval / (end - start);
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
      maxStackDepth,
      stackTimingByDepth,
      timeRange,
      interval,
      getCategory,
      getLabel,
      previewSelection,
      updatePreviewSelection,
      callNodeInfo,
      selectedCallNodeIndex,
      scrollToSelectionGeneration,
    } = this.props;

    const maxViewportHeight = maxStackDepth * STACK_FRAME_HEIGHT;

    return (
      <div className="stackChart">
        <StackSettings />
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
              getCategory,
              getLabel,
              stackTimingByDepth,
              updatePreviewSelection,
              rangeStart: timeRange.start,
              rangeEnd: timeRange.end,
              stackFrameHeight: STACK_FRAME_HEIGHT,
              callNodeInfo,
              selectedCallNodeIndex,
              onSelectionChange: this._onSelectedCallNodeChange,
              scrollToSelectionGeneration,
            }}
          />
        </div>
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepth(
      state
    );

    return {
      thread: selectedThreadSelectors.getFilteredThread(state),
      maxStackDepth: selectedThreadSelectors.getCallNodeMaxDepth(state),
      stackTimingByDepth,
      timeRange: getCommittedRange(state),
      interval: getProfileInterval(state),
      getCategory: getCategoryColorStrategy(state),
      getLabel: getLabelingStrategy(state),
      previewSelection: getPreviewSelection(state),
      threadIndex: getSelectedThreadIndex(state),
      callNodeInfo: selectedThreadSelectors.getCallNodeInfo(state),
      selectedCallNodeIndex: selectedThreadSelectors.getSelectedCallNodeIndex(
        state
      ),
      scrollToSelectionGeneration: getScrollToSelectionGeneration(state),
    };
  },
  mapDispatchToProps: {
    changeSelectedCallNode,
    updatePreviewSelection,
  },
  component: StackChartGraph,
};
export default explicitConnect(options);

// This function is given the StackChartCanvas's chartProps.
function viewportNeedsUpdate(
  prevProps: { +stackTimingByDepth: StackTimingByDepth },
  newProps: { +stackTimingByDepth: StackTimingByDepth }
) {
  return prevProps.stackTimingByDepth !== newProps.stackTimingByDepth;
}
