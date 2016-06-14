import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getTimeRangeIncludingAllThreads } from '../profile-data';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import ProfileViewSidebar from '../components/ProfileViewSidebar';
import Reorderable from '../components/Reorderable';
import TimelineWithRangeSelection from '../components/TimelineWithRangeSelection';
import * as Actions from '../actions';
import { getProfile, getProfileViewOptions, getThreadOrder } from '../selectors/';

class ProfileViewer extends Component {
  componentDidMount() {
    this.refs.treeView.getWrappedInstance().focus();
    this.refs.treeView.getWrappedInstance().procureInterestingInitialSelection();
  }

  render() {
    const {
      profile, className, threadOrder, onChangeThreadOrder,
      viewOptions, onSelectionChange,
    } = this.props;
    const timeRange = getTimeRangeIncludingAllThreads(profile);
    const threads = profile.threads;
    const { hasSelection, selectionStart, selectionEnd } = viewOptions.selection;
    return (
      <div className={className}>
        <TimelineWithRangeSelection className={`${className}Header`}
                                    zeroAt={timeRange.start}
                                    rangeStart={timeRange.start}
                                    rangeEnd={timeRange.end}
                                    hasSelection={hasSelection}
                                    selectionStart={selectionStart}
                                    selectionEnd={selectionEnd}
                                    onSelectionChange={onSelectionChange}>
          <Reorderable tagName='ol'
                       className={`${className}HeaderThreadList`}
                       order={threadOrder}
                       orient='vertical'
                       onChangeOrder={onChangeThreadOrder}>
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
        </TimelineWithRangeSelection>
        <div className='treeAndSidebarWrapper'>
          <ProfileViewSidebar />
          <ProfileTreeView ref='treeView'/>
         </div>
      </div>
    );
  }
}

ProfileViewer.propTypes = {
  profile: PropTypes.object.isRequired,
  className: PropTypes.string.isRequired,
  threadOrder: PropTypes.array.isRequired,
  onChangeThreadOrder: PropTypes.func.isRequired,
  viewOptions: PropTypes.object.isRequired,
  onSelectionChange: PropTypes.func.isRequired,
};

export default connect(state => ({
  profile: getProfile(state),
  viewOptions: getProfileViewOptions(state),
  className: 'profileViewer',
  threadOrder: getThreadOrder(state),
}), dispatch => ({
  onChangeThreadOrder: newThreadOrder => {
    dispatch(Actions.changeThreadOrder(newThreadOrder));
  },
  onSelectionChange: newSelection => {
    dispatch(Actions.updateProfileSelection(newSelection));
  },
}))(ProfileViewer);
