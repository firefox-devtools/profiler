import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { selectedThreadSelectors } from '../selectors/';
import * as actions from '../actions';

class ProfileLogView extends Component {
  render() {
    const { thread } = this.props;
    const { markers, stringTable } = thread;
    return (
      <div className='logViewWrapper'>
        <pre className='logViewPre'>
          {
            markers.data.map((data, markerIndex) => markerIndex).filter(markerIndex => {
              const data = markers.data[markerIndex];
              return data !== null && ('category' in data) && data.category === 'log';
            }).map(markerIndex => {
              return stringTable.getString(markers.name[markerIndex]);
            }).join('')
          }
        </pre>
      </div>
    );
  }
}

ProfileLogView.propTypes = {
  thread: PropTypes.object.isRequired,
};

export default connect((state, props) => ({
  thread: selectedThreadSelectors.getRangeSelectionFilteredThread(state, props),
}), actions)(ProfileLogView);
