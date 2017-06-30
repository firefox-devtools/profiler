/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { connect } from 'react-redux';
import { getThreads } from '../../reducers/profile-view';
import { getThreadOrder, getHiddenThreads } from '../../reducers/url-state';
import { changeThreadOrder } from '../../actions/profile-view';
import FlameChartSettings from './FlameChartSettings';
import TimelineFlameChart from './TimelineFlameChart';
import TimelineMarkers from './TimelineMarkers';
import Reorderable from '../shared/Reorderable';
import { withSize } from '../shared/WithSize';

import type { State } from '../../types/reducers';
import type { Thread, ThreadIndex } from '../../types/profile';

require('./TimelineView.css');

type Props = {
  threads: Thread[],
  threadOrder: ThreadIndex[],
  hiddenThreads: ThreadIndex[],
  height: number,
  changeThreadOrder: typeof changeThreadOrder,
};

class TimlineViewTimelinesImpl extends PureComponent {
  props: Props;

  _scrollElement: ?HTMLElement;

  constructor(props: Props) {
    super(props);
    (this: any)._getScrollElement = this._getScrollElement.bind(this);
    (this: any)._setScrollElementRef = this._setScrollElementRef.bind(this);
  }

  _getScrollElement(): ?HTMLElement {
    return this._scrollElement;
  }

  _setScrollElementRef(element: HTMLElement) {
    this._scrollElement = element;
  }

  render() {
    const {
      threads,
      threadOrder,
      changeThreadOrder,
      height,
      hiddenThreads,
    } = this.props;

    return (
      <div className="timelineViewTimelines">
        <div
          className="timelineViewTimelinesScroller"
          ref={this._setScrollElementRef}
        >
          <div className="timelineViewDivider">Sample based callstacks</div>
          <Reorderable
            tagName="div"
            className="timelineViewTimelinesThreadList"
            order={threadOrder}
            orient="vertical"
            onChangeOrder={changeThreadOrder}
          >
            {threads.map(
              (_, threadIndex) =>
                hiddenThreads.includes(threadIndex)
                  ? // If this thread is hidden, render out a stub element so that the
                    // Reorderable Component still works across all the threads.
                    <div className="timelineViewRowHidden" />
                  : <div className="timelineViewRow" key={threadIndex}>
                      <TimelineFlameChart
                        threadIndex={threadIndex}
                        viewHeight={height}
                        getScrollElement={this._getScrollElement}
                      />
                    </div>
            )}
          </Reorderable>
          <div className="timelineViewDivider">Marker Events</div>
          <Reorderable
            tagName="div"
            className="timelineViewTimelinesThreadList"
            order={threadOrder}
            orient="vertical"
            onChangeOrder={changeThreadOrder}
          >
            {threads.map(
              (_, threadIndex) =>
                hiddenThreads.includes(threadIndex)
                  ? // If this thread is hidden, render out a stub element so that the
                    // Reorderable Component still works across all the threads.
                    <div className="timelineViewRowHidden" />
                  : <div className="timelineViewRow" key={threadIndex}>
                      <TimelineMarkers
                        threadIndex={threadIndex}
                        viewHeight={height}
                        getScrollElement={this._getScrollElement}
                      />
                    </div>
            )}
          </Reorderable>
        </div>
      </div>
    );
  }
}

const TimelineViewTimelines = withSize(TimlineViewTimelinesImpl);

class TimelineView extends PureComponent {
  props: {
    threads: Thread[],
    threadOrder: ThreadIndex[],
    hiddenThreads: ThreadIndex[],
    changeThreadOrder: typeof changeThreadOrder,
  };

  render() {
    const {
      threads,
      threadOrder,
      changeThreadOrder,
      hiddenThreads,
    } = this.props;
    return (
      <div className="timelineView">
        <FlameChartSettings />
        <TimelineViewTimelines
          threads={threads}
          threadOrder={threadOrder}
          hiddenThreads={hiddenThreads}
          changeThreadOrder={changeThreadOrder}
        />
      </div>
    );
  }
}

export default connect(
  (state: State) => ({
    threads: getThreads(state),
    threadOrder: getThreadOrder(state),
    hiddenThreads: getHiddenThreads(state),
  }),
  { changeThreadOrder }
)(TimelineView);
