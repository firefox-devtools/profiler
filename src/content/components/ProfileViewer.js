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
import * as actions from '../actions';
import { getProfile, getProfileViewOptions, getThreadOrder, getDisplayRange, getZeroAt } from '../selectors/';

class ProfileViewer extends Component {
  constructor(props) {
    super(props);
    this._onZoomButtonClick = this._onZoomButtonClick.bind(this);
    this._onIntervalMarkerSelect = this._onIntervalMarkerSelect.bind(this);
    this._onSelectTab = this._onSelectTab.bind(this);

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
    ];
  }

  _onZoomButtonClick(start, end) {
    const { addRangeFilterAndUnsetSelection, zeroAt, location } = this.props;
    addRangeFilterAndUnsetSelection(start - zeroAt, end - zeroAt, location);
  }

  _onIntervalMarkerSelect(threadIndex, start, end) {
    const { timeRange, updateProfileSelection, changeSelectedThread, location } = this.props;
    updateProfileSelection({
      hasSelection: true,
      isModifying: false,
      selectionStart: Math.max(timeRange.start, start),
      selectionEnd: Math.min(timeRange.end, end),
    });
    changeSelectedThread(threadIndex, location);
  }

  _onSelectTab(selectedTab) {
    const { changeSelectedTab, dataSource, location, params } = this.props;
    changeSelectedTab(selectedTab, dataSource, location, params);
  }

  render() {
    const {
      profile, className, threadOrder, changeThreadOrder,
      viewOptions, updateProfileSelection,
      timeRange, zeroAt, params, location,
      changeTabOrder, dataSource,
    } = this.props;
    const threads = profile.threads;
    const { selection, tabOrder } = viewOptions;
    const { hasSelection, isModifying, selectionStart, selectionEnd } = selection;
    const { selectedTab } = params;
    return (
      <div className={className}>
        <div className={`${className}TopBar`}>
          <ProfileFilterNavigator location={location}/>
          <ProfileSharing dataSource={dataSource} location={location} params={params}/>
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
          <div className={`${className}HeaderIntervalMarkerTimelineContainer ${className}HeaderIntervalMarkerTimelineContainerGfx`}>
            {
              threadOrder.map(threadIndex => {
                const threadName = threads[threadIndex].name;
                return (
                  [((threadName === 'GeckoMain' || threadName === 'Content') ?
                    <ProfileThreadJankTimeline className={`${className}HeaderIntervalMarkerTimeline`}
                                               rangeStart={timeRange.start}
                                               rangeEnd={timeRange.end}
                                               threadIndex={threadIndex}
                                               key={`jank${threadIndex}`}
                                               onSelect={this._onIntervalMarkerSelect}
                                               location={location} /> : null),
                    <ProfileThreadTracingMarkerTimeline className={`${className}HeaderIntervalMarkerTimeline ${className}HeaderIntervalMarkerTimelineGfx ${className}HeaderIntervalMarkerTimelineThread${threadName}`}
                                                        rangeStart={timeRange.start}
                                                        rangeEnd={timeRange.end}
                                                        threadIndex={threadIndex}
                                                        key={`gfx${threadIndex}`}
                                                        onSelect={this._onIntervalMarkerSelect}
                                                        location={location} />]
                );
              })
            }
          </div>
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
                                      rangeEnd={timeRange.end}
                                      params={params}
                                      location={location}/>
            )
          }
          </Reorderable>
        </TimelineWithRangeSelection>
        <TabBar tabs={this._tabs}
                selectedTabName={selectedTab}
                tabOrder={tabOrder}
                onSelectTab={this._onSelectTab}
                onChangeTabOrder={changeTabOrder} />
        {{
          summary: <ProfileSummaryView params={params} location={location} />,
          calltree: <ProfileCallTreeView params={params} location={location} />,
          markers: <ProfileMarkersView params={params} location={location} />,
          tasktracer: <ProfileTaskTracerView params={params} location={location} rangeStart={timeRange.start} rangeEnd={timeRange.end} />,
          log: <ProfileLogView params={params} location={location} />,
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
  dataSource: PropTypes.string.isRequired,
  params: PropTypes.any.isRequired,
  location: PropTypes.any.isRequired,
  changeSelectedThread: PropTypes.func.isRequired,
  changeSelectedTab: PropTypes.func.isRequired,
  changeTabOrder: PropTypes.func.isRequired,
};

export default connect((state, props) => ({
  profile: getProfile(state, props),
  viewOptions: getProfileViewOptions(state, props),
  className: 'profileViewer',
  threadOrder: getThreadOrder(state, props),
  timeRange: getDisplayRange(state, props),
  zeroAt: getZeroAt(state, props),
}), actions)(ProfileViewer);
