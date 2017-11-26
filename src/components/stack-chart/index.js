/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { connect } from 'react-redux';
import StackChartCanvas from './Canvas';
import {
  selectedThreadSelectors,
  getDisplayRange,
  getProfileInterval,
  getProfileViewOptions,
} from '../../reducers/profile-view';
import {
  getCategoryColorStrategy,
  getLabelingStrategy,
} from '../../reducers/stack-chart';
import { updateProfileSelection } from '../../actions/profile-view';
import StackChartSettings from './Settings';

import type { Thread } from '../../types/profile';
import type {
  Milliseconds,
  UnitIntervalOfProfileRange,
} from '../../types/units';
import type { StackTimingByDepth } from '../../profile-logic/stack-timing';
import type { GetCategory } from '../../profile-logic/color-categories';
import type { GetLabel } from '../../profile-logic/labeling-strategies';
import type { ProfileSelection } from '../../types/actions';

require('./index.css');

const STACK_FRAME_HEIGHT = 16;

type Props = {
  thread: Thread,
  maxStackDepth: number,
  stackTimingByDepth: StackTimingByDepth,
  timeRange: { start: Milliseconds, end: Milliseconds },
  threadIndex: number,
  interval: Milliseconds,
  getCategory: GetCategory,
  getLabel: GetLabel,
  updateProfileSelection: typeof updateProfileSelection,
  selection: ProfileSelection,
  threadName: string,
  processDetails: string,
};

class StackChartGraph extends React.PureComponent<Props> {
  /**
   * Determine the maximum amount available to zoom in.
   */
  getMaximumZoom(): UnitIntervalOfProfileRange {
    const { timeRange: { start, end }, interval } = this.props;
    return interval / (end - start);
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
      updateProfileSelection,
      selection,
      threadName,
      processDetails,
    } = this.props;

    const maxViewportHeight = maxStackDepth * STACK_FRAME_HEIGHT;

    return (
      <div className="stackChart">
        <StackChartSettings />
        <div className="stackChartGraph">
          <div title={processDetails} className="stackChartLabels grippy">
            <span>
              {threadName}
            </span>
          </div>
          <StackChartCanvas
            // ChartViewport props
            timeRange={timeRange}
            maxViewportHeight={maxViewportHeight}
            maximumZoom={this.getMaximumZoom()}
            selection={selection}
            updateProfileSelection={updateProfileSelection}
            viewportNeedsUpdate={viewportNeedsUpdate}
            // StackChartCanvas props
            interval={interval}
            thread={thread}
            rangeStart={timeRange.start}
            rangeEnd={timeRange.end}
            stackTimingByDepth={stackTimingByDepth}
            getCategory={getCategory}
            getLabel={getLabel}
            maxStackDepth={maxStackDepth}
            stackFrameHeight={STACK_FRAME_HEIGHT}
          />
        </div>
      </div>
    );
  }
}

export default connect(
  state => {
    const stackTimingByDepth = selectedThreadSelectors.getStackTimingByDepthForStackChart(
      state
    );

    return {
      thread: selectedThreadSelectors.getFilteredThreadForStackChart(state),
      maxStackDepth: selectedThreadSelectors.getCallNodeMaxDepthForStackChart(
        state
      ),
      stackTimingByDepth,
      timeRange: getDisplayRange(state),
      interval: getProfileInterval(state),
      getCategory: getCategoryColorStrategy(state),
      getLabel: getLabelingStrategy(state),
      selection: getProfileViewOptions(state).selection,
      threadName: selectedThreadSelectors.getFriendlyThreadName(state),
      processDetails: selectedThreadSelectors.getThreadProcessDetails(state),
    };
  },
  { updateProfileSelection }
)(StackChartGraph);

function viewportNeedsUpdate(prevProps, newProps) {
  return prevProps.stackTimingByDepth !== newProps.stackTimingByDepth;
}
