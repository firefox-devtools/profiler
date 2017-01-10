import React, { Component, PropTypes } from 'react';

const LINE_GRAPH_TITLE = 'The line graph represents the number of samples that were in ' +
  'a given category over time. In order to present a high-level summary, the samples ' +
  'are smoothed with a rolling average.';
const CATEGORY_TITLE = 'Each sample\'s call stack is used to place it in an ' +
  'appropriate category.';
const SAMPLE_TITLE = 'The profiler samples the call stack at a fixed rate. Each of ' +
  'these samples is categorized and then summed over the course of the recording.';
const PERCENT_TIME_TITLE = 'The percentage of time represents the percentage of how ' +
  'many samples of a given category were observed over the entire course of the ' +
  'recording.';

class SummarizeProfileHeader extends Component {
  render() {
    const { threadName, processType } = this.props;
    return (
      <div>
        <div className='summarize-profile-thread' colSpan='3'>{threadName} Thread, {processType} process</div>
        <div className='summarize-profile-header'>
          <div className='summarize-line-graph' title={LINE_GRAPH_TITLE}>
            Rolling Average of Samples
          </div>
          <div className='summarize-profile-details'>
            <div className='summarize-profile-text' title={CATEGORY_TITLE}>Category</div>
            <div className='summarize-profile-numeric' title={SAMPLE_TITLE}>Samples</div>
            <div className='summarize-profile-numeric' title={PERCENT_TIME_TITLE}>% Time</div>
          </div>
        </div>
      </div>
    );
  }
}

SummarizeProfileHeader.propTypes = {
  threadName: PropTypes.string.isRequired,
  processType: PropTypes.string.isRequired,
};

export default SummarizeProfileHeader;
