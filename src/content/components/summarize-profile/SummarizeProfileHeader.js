import React, { Component, PropTypes } from 'react';

class SummarizeProfileHeader extends Component {
  render () {
    const {threadName} = this.props;
    return (
      <div>
        <div className='summarize-profile-thread' colSpan='3'>{threadName} Thread</div>
        <div className='summarize-profile-header'>
          <div className='summarize-line-graph'>
            Rolling Summary
          </div>
          <div className='summarize-profile-details'>
            <div className='summarize-profile-text'>Category</div>
            <div className='summarize-profile-numeric'>Samples</div>
            <div className='summarize-profile-numeric'>% Time</div>
          </div>
        </div>
      </div>
    );
  }
}

SummarizeProfileHeader.propTypes = {
  threadName: PropTypes.string,
};

export default SummarizeProfileHeader;
