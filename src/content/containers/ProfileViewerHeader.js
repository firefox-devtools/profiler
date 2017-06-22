/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent, PropTypes } from 'react';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import Reorderable from '../components/Reorderable';
import TimeSelectionScrubber from '../components/TimeSelectionScrubber';
import ProfileThreadJankOverview from './ProfileThreadJankOverview';
import ProfileThreadTracingMarkerOverview from './ProfileThreadTracingMarkerOverview';
import OverflowEdgeIndicator from '../components/OverflowEdgeIndicator';
import { connect } from 'react-redux';
import { getProfile, getProfileViewOptions, getThreadOrder, getDisplayRange, getZeroAt } from '../reducers/profile-view';
import actions from '../actions';

import type { Profile, ThreadIndex } from '../../common/types/profile';
import type { ProfileSelection } from '../actions/types';
import type { Milliseconds, StartEndRange } from '../../common/types/units';

type Props = {
  profile: Profile,
  className: string,
  threadOrder: ThreadIndex[],
  selection: ProfileSelection,
  timeRange: StartEndRange,
  zeroAt: Milliseconds,
  changeThreadOrder: ThreadIndex[] => void,
  updateProfileSelection: ProfileSelection => void,
  addRangeFilterAndUnsetSelection: (Milliseconds, Milliseconds) => void,
  changeSelectedThread: ThreadIndex => void,
};

class ProfileViewerHeader extends PureComponent {
  props: Props;

  constructor(props) {
    super(props);
    (this: any)._onZoomButtonClick = this._onZoomButtonClick.bind(this);
    (this: any)._onIntervalMarkerSelect = this._onIntervalMarkerSelect.bind(this);
  }

  _onZoomButtonClick(start: Milliseconds, end: Milliseconds) {
    const { addRangeFilterAndUnsetSelection, zeroAt } = this.props;
    addRangeFilterAndUnsetSelection(start - zeroAt, end - zeroAt);
  }

  _onIntervalMarkerSelect(threadIndex: ThreadIndex, start: Milliseconds, end: Milliseconds) {
    const { timeRange, updateProfileSelection, changeSelectedThread } = this.props;
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(timeRange.start, start),
      selectionEnd: Math.min(timeRange.end, end),
    });
    changeSelectedThread(threadIndex);
  }

  render() {
    const {
      profile, className, threadOrder, changeThreadOrder, selection,
      updateProfileSelection, timeRange, zeroAt,
    } = this.props;
    const threads = profile.threads;

    return <TimeSelectionScrubber className={`${className}Header`}
                           zeroAt={zeroAt}
                           rangeStart={timeRange.start}
                           rangeEnd={timeRange.end}
                           minSelectionStartWidth={profile.meta.interval}
                           selection={selection}
                           onSelectionChange={updateProfileSelection}
                           onZoomButtonClick={this._onZoomButtonClick}>
      <div className={`${className}HeaderIntervalMarkerOverviewContainer ${className}HeaderIntervalMarkerOverviewContainerJank`}>
        {
          threadOrder.map(threadIndex => {
            const threadName = threads[threadIndex].name;
            const processType = threads[threadIndex].processType;
            return (
              ((threadName === 'GeckoMain' && processType !== 'plugin') ?
                <ProfileThreadJankOverview className={`${className}HeaderIntervalMarkerOverview ${className}HeaderIntervalMarkerOverviewJank`}
                                           rangeStart={timeRange.start}
                                           rangeEnd={timeRange.end}
                                           threadIndex={threadIndex}
                                           key={threadIndex}
                                           onSelect={this._onIntervalMarkerSelect}
                                           isModifyingSelection={selection.isModifying} /> : null)
            );
          })
        }
      </div>
      <div className={`${className}HeaderIntervalMarkerOverviewContainer ${className}HeaderIntervalMarkerOverviewContainerGfx`}>
        {
          threadOrder.map(threadIndex => {
            const threadName = threads[threadIndex].name;
            const processType = threads[threadIndex].processType;
            return (
              (((threadName === 'GeckoMain' || threadName === 'Compositor' || threadName ==='Renderer') && processType !== 'plugin') ?
                <ProfileThreadTracingMarkerOverview className={`${className}HeaderIntervalMarkerOverview ${className}HeaderIntervalMarkerOverviewGfx ${className}HeaderIntervalMarkerOverviewThread${threadName}`}
                                                    rangeStart={timeRange.start}
                                                    rangeEnd={timeRange.end}
                                                    threadIndex={threadIndex}
                                                    key={threadIndex}
                                                    onSelect={this._onIntervalMarkerSelect}
                                                    isModifyingSelection={selection.isModifying} /> : null)
            );
          })
        }
      </div>
      <OverflowEdgeIndicator className={`${className}HeaderOverflowEdgeIndicator`}>
        {<Reorderable tagName='ol'
                     className={`${className}HeaderThreadList`}
                     order={threadOrder}
                     orient='vertical'
                     onChangeOrder={changeThreadOrder}>
          {
            threads.map((thread, threadIndex) =>
              <ProfileThreadHeaderBar key={threadIndex}
                                      index={threadIndex}
                                      interval={profile.meta.interval}
                                      rangeStart={timeRange.start}
                                      rangeEnd={timeRange.end}/>
            )
          }
        </Reorderable>}
      </OverflowEdgeIndicator>
    </TimeSelectionScrubber>;
  }
}

ProfileViewerHeader.propTypes = {
  profile: PropTypes.object.isRequired,
  className: PropTypes.string.isRequired,
  threadOrder: PropTypes.array.isRequired,
  changeThreadOrder: PropTypes.func.isRequired,
  selection: PropTypes.object.isRequired,
  updateProfileSelection: PropTypes.func.isRequired,
  addRangeFilterAndUnsetSelection: PropTypes.func.isRequired,
  timeRange: PropTypes.object.isRequired,
  zeroAt: PropTypes.number.isRequired,
  changeSelectedThread: PropTypes.func.isRequired,
};

export default connect(state => ({
  profile: getProfile(state),
  selection: getProfileViewOptions(state).selection,
  className: 'profileViewer',
  threadOrder: getThreadOrder(state),
  timeRange: getDisplayRange(state),
  zeroAt: getZeroAt(state),
}), actions)(ProfileViewerHeader);
