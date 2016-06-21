import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import ProfileTreeView from '../components/ProfileTreeView';
import ProfileThreadHeaderBar from '../components/ProfileThreadHeaderBar';
import ProfileViewSidebar from '../components/ProfileViewSidebar';
import Reorderable from '../components/Reorderable';
import TimelineWithRangeSelection from '../components/TimelineWithRangeSelection';
import * as actions from '../actions';
import { getProfile, getProfileViewOptions, getThreadOrder, getDisplayRange, getZeroAt } from '../selectors/';

class ProfileViewer extends Component {
  componentDidMount() {
    this.refs.treeView.getWrappedInstance().focus();
    this.refs.treeView.getWrappedInstance().procureInterestingInitialSelection();
  }

  render() {
    const {
      profile, className, threadOrder, changeThreadOrder,
      viewOptions, updateProfileSelection, addRangeFilterAndUnsetSelection,
      timeRange, zeroAt,
    } = this.props;
    const threads = profile.threads;
    const { hasSelection, isModifying, selectionStart, selectionEnd } = viewOptions.selection;
    return (
      <div className={className}>
        <TimelineWithRangeSelection className={`${className}Header`}
                                    zeroAt={zeroAt}
                                    rangeStart={timeRange.start}
                                    rangeEnd={timeRange.end}
                                    hasSelection={hasSelection}
                                    isModifying={isModifying}
                                    selectionStart={selectionStart}
                                    selectionEnd={selectionEnd}
                                    onSelectionChange={updateProfileSelection}
                                    onZoomButtonClick={addRangeFilterAndUnsetSelection}>
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
  changeThreadOrder: PropTypes.func.isRequired,
  viewOptions: PropTypes.object.isRequired,
  updateProfileSelection: PropTypes.func.isRequired,
  addRangeFilterAndUnsetSelection: PropTypes.func.isRequired,
  timeRange: PropTypes.object.isRequired,
  zeroAt: PropTypes.number.isRequired,
};

export default connect(state => ({
  profile: getProfile(state),
  viewOptions: getProfileViewOptions(state),
  className: 'profileViewer',
  threadOrder: getThreadOrder(state),
  timeRange: getDisplayRange(state),
  zeroAt: getZeroAt(state),
}), actions)(ProfileViewer);
