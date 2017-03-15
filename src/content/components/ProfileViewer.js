import React, { PureComponent, PropTypes } from 'react';
import { connect } from 'react-redux';
import TabBar from '../components/TabBar';
import ProfileSummaryView from '../containers/ProfileSummaryView';
import ProfileCallTreeView from '../containers/ProfileCallTreeView';
import ProfileMarkersView from '../containers/ProfileMarkersView';
import ProfileTaskTracerView from '../containers/ProfileTaskTracerView';
import ProfileLogView from '../containers/ProfileLogView';
import ProfileFilterNavigator from '../containers/ProfileFilterNavigator';
import ProfileSharing from '../containers/ProfileSharing';
import SymbolicationStatusOverlay from '../containers/SymbolicationStatusOverlay';
import TimelineView from '../containers/TimelineView';
import actions from '../actions';
import { getProfileViewOptions, getDisplayRange } from '../reducers/profile-view';
import { getSelectedTab } from '../reducers/url-state';
import ProfileViewerHeader from '../containers/ProfileViewerHeader';

class ProfileViewer extends PureComponent {
  constructor(props) {
    super(props);
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
        name: 'timeline',
        title: 'Timeline',
      },
    ];
  }

  _onSelectTab(selectedTab) {
    const { changeSelectedTab } = this.props;
    changeSelectedTab(selectedTab);
  }

  render() {
    const {
      className, viewOptions, timeRange, changeTabOrder, selectedTab,
    } = this.props;
    const { tabOrder } = viewOptions;
    return (
      <div className={className}>
        <div className={`${className}TopBar`}>
          <ProfileFilterNavigator />
          <ProfileSharing />
        </div>
        <ProfileViewerHeader />
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
          timeline: <TimelineView />,
          log: <ProfileLogView />,
        }[selectedTab]}
        <SymbolicationStatusOverlay />
      </div>
    );
  }
}

ProfileViewer.propTypes = {
  className: PropTypes.string.isRequired,
  viewOptions: PropTypes.object.isRequired,
  timeRange: PropTypes.object.isRequired,
  selectedTab: PropTypes.string.isRequired,
  changeSelectedTab: PropTypes.func.isRequired,
  changeTabOrder: PropTypes.func.isRequired,
};

export default connect(state => ({
  viewOptions: getProfileViewOptions(state),
  selectedTab: getSelectedTab(state),
  className: 'profileViewer',
  timeRange: getDisplayRange(state),
}), actions)(ProfileViewer);
