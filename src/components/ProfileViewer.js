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
    this._onZoomButtonClick = this._onZoomButtonClick.bind(this);
  }

  _onZoomButtonClick(start, end) {
    this.props.addRangeFilterAndUnsetSelection(start, end, this.props.location);
  }

  render() {
    const {
      profile, className, threadOrder, changeThreadOrder,
      viewOptions, updateProfileSelection,
      timeRange, zeroAt, params, location,
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
                                    onZoomButtonClick={this._onZoomButtonClick}>
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
        <div className='treeAndSidebarWrapper'>
          <ProfileViewSidebar params={params} location={location} />
          <ProfileTreeView ref='treeView' params={params} location={location}/>
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
  params: PropTypes.any.isRequired,
  location: PropTypes.any.isRequired,
};

export default connect((state, props) => ({
  profile: getProfile(state, props),
  viewOptions: getProfileViewOptions(state, props),
  className: 'profileViewer',
  threadOrder: getThreadOrder(state, props),
  timeRange: getDisplayRange(state, props),
  zeroAt: getZeroAt(state, props),
}), actions)(ProfileViewer);
