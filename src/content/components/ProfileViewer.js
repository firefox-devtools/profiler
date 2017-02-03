import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import Reorderable from '../components/Reorderable';
import TimelineWithRangeSelection from '../components/TimelineWithRangeSelection';
import TabBar from '../components/TabBar';
import ProfileSummaryView from '../containers/ProfileSummaryView';
import ProfileCallTreeView from '../containers/ProfileCallTreeView';
import ProfileMarkersView from '../containers/ProfileMarkersView';
import ProfileTaskTracerView from '../containers/ProfileTaskTracerView';
import ProfileLogView from '../containers/ProfileLogView';
import ProfileThreadJankTimeline from '../containers/ProfileThreadJankTimeline';
import ProfileThreadTracingMarkerTimeline from '../containers/ProfileThreadTracingMarkerTimeline';
import ProfileFilterNavigator from '../containers/ProfileFilterNavigator';
import ProfileSharing from '../containers/ProfileSharing';
import SymbolicationStatusOverlay from '../containers/SymbolicationStatusOverlay';
import FlameChartView from '../containers/FlameChartView';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import * as actions from '../actions';
import { getProfile, getProfileViewOptions, getThreadOrder, getDisplayRange, getZeroAt, getSelectedTab } from '../selectors/';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._onZoomButtonClick = this._onZoomButtonClick.bind(this);
    this._onIntervalMarkerSelect = this._onIntervalMarkerSelect.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);

    // If updating this list, make sure and update the tabOrder reducer with another index.
    this._tabs = [
      {
        name: 'summary',
        title: 'Summary',
      },
      {
        name: 'calltree',
        title: 'Call Tree',
      },
      {
        name: 'markers',
        title: 'Markers',
      },
      {
        name: 'tasktracer',
        title: 'Task Tracer',
      },
      {
        name: 'log',
        title: 'Log',
      },
      {
        name: 'flameChart',
        title: 'Timeline',
      },
    ];
  }

  _onZoomButtonClick(start, end) {
    const { addRangeFilterAndUnsetSelection, zeroAt } = this.props;
    addRangeFilterAndUnsetSelection(start - zeroAt, end - zeroAt);
  }

  _onIntervalMarkerSelect(threadIndex, start, end) {
    const { timeRange, updateProfileSelection, changeSelectedThread } = this.props;
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(timeRange.start, start),
      selectionEnd: Math.min(timeRange.end, end),
    });
    changeSelectedThread(threadIndex);
  }

  _onSelectTab(selectedTab) {
    const { changeSelectedTab } = this.props;
    changeSelectedTab(selectedTab);
  }

  render() {
    const {
      profile, className, threadOrder, changeThreadOrder,
      viewOptions, updateProfileSelection,
      timeRange, zeroAt,
      changeTabOrder, selectedTab,
    } = this.props;
    const threads = profile.threads;
    const { selection, tabOrder } = viewOptions;
    const { hasSelection, isModifying, selectionStart, selectionEnd } = selection;
    return (
      <div className={className}>
        <div className={`${className}TopBar`}>
          <ProfileFilterNavigator />
          <ProfileSharing />
        </div>
        <TimelineWithRangeSelection className={`${className}Header`}
                                    zeroAt={zeroAt}
                                    rangeStart={timeRange.start}
                                    rangeEnd={timeRange.end}
                                    minSelectionStartWidth={profile.meta.interval}
                                    hasSelection={hasSelection}
                                    isModifying={isModifying}
                                    selectionStart={selectionStart}
                                    selectionEnd={selectionEnd}
                                    onSelectionChange={updateProfileSelection}
                                    onZoomButtonClick={this._onZoomButtonClick}>
          <div className={`${className}HeaderIntervalMarkerTimelineContainer ${className}HeaderIntervalMarkerTimelineContainerJank`}>
            {
              threadOrder.map(threadIndex => {
                const threadName = threads[threadIndex].name;
                const processType = threads[threadIndex].processType;
                return (
                  ((threadName === 'GeckoMain' && processType !== 'plugin') ?
                    <ProfileThreadJankTimeline className={`${className}HeaderIntervalMarkerTimeline ${className}HeaderIntervalMarkerTimelineJank`}
                                               rangeStart={timeRange.start}
                                               rangeEnd={timeRange.end}
                                               threadIndex={threadIndex}
                                               key={threadIndex}
                                               onSelect={this._onIntervalMarkerSelect} /> : null)
                );
              })
            }
          </div>
          <div className={`${className}HeaderIntervalMarkerTimelineContainer ${className}HeaderIntervalMarkerTimelineContainerGfx`}>
            {
              threadOrder.map(threadIndex => {
                const threadName = threads[threadIndex].name;
                const processType = threads[threadIndex].processType;
                return (
                  (((threadName === 'GeckoMain' || threadName === 'Compositor') && processType !== 'plugin') ?
                    <ProfileThreadTracingMarkerTimeline className={`${className}HeaderIntervalMarkerTimeline ${className}HeaderIntervalMarkerTimelineGfx ${className}HeaderIntervalMarkerTimelineThread${threadName}`}
                                                        rangeStart={timeRange.start}
                                                        rangeEnd={timeRange.end}
                                                        threadIndex={threadIndex}
                                                        key={threadIndex}
                                                        onSelect={this._onIntervalMarkerSelect} /> : null)
                );
              })
            }
          </div>
          <OverflowEdgeIndicator className={`${className}HeaderOverflowEdgeIndicator`}>
            <Reorderable tagName='ol'
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
            </Reorderable>
          </OverflowEdgeIndicator>
        </TimelineWithRangeSelection>
        <TabBar tabs={this._tabs}
                selectedTabName={selectedTab}
                tabOrder={tabOrder}
                onSelectTab={this._onSelectTab}
                onChangeTabOrder={changeTabOrder} />
        {{
          summary: <ProfileSummaryView />,
          calltree: <ProfileCallTreeView />,
          markers: <ProfileMarkersView />,
          tasktracer: <ProfileTaskTracerView rangeStart={timeRange.start} rangeEnd={timeRange.end} />,
          flameChart: <FlameChartView />,
          log: <ProfileLogView />,
        }[selectedTab]}

        <SymbolicationStatusOverlay />

      </div>
    );
  }
}

ProfileViewer.propTypes = {
  profile: PropTypes.object.isRequired,
  className: PropTypes.string.isRequired,
  threadOrder: PropTypes.array.isRequired,
  changeThreadOrder: PropTypes.func.isRequired,
  viewOptions: PropTypes.object.isRequired,
  updateProfileSelection: PropTypes.func.isRequired,
  addRangeFilterAndUnsetSelection: PropTypes.func.isRequired,
  timeRange: PropTypes.object.isRequired,
  zeroAt: PropTypes.number.isRequired,
  selectedTab: PropTypes.string.isRequired,
  changeSelectedThread: PropTypes.func.isRequired,
  changeSelectedTab: PropTypes.func.isRequired,
  changeTabOrder: PropTypes.func.isRequired,
};

export default connect(state => ({
  profile: getProfile(state),
  viewOptions: getProfileViewOptions(state),
  selectedTab: getSelectedTab(state),
  className: 'profileViewer',
  threadOrder: getThreadOrder(state),
  timeRange: getDisplayRange(state),
  zeroAt: getZeroAt(state),
}), actions)(ProfileViewer);
