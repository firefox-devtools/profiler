import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getProfileSummaries } from '../selectors/';

class SummarizeProfile extends Component {
  render() {
    const {
      summaries,
    } = this.props;

    return (
      <div className='summarize-profile'>
        {
          !summaries ? 'Analyzing the profile to generate a summary...'
          : summaries.map(({thread, summary}) => (
            <div className='summarize-profile-table' key={thread}>
              <div className='summarize-profile-thread' colSpan='3'>{thread} Thread</div>
              <div className='summarize-profile-header'>
                <div className='summarize-profile-text'>Category</div>
                <div className='summarize-profile-numeric'>Samples</div>
                <div className='summarize-profile-numeric'>% Time</div>
              </div>
              {summary.map(({category, samples, percentage}) => (
                <div className='summarize-profile-row' key={category}>
                  <div className='summarize-profile-text'>{category}</div>
                  <div className='summarize-profile-numeric'>{samples}</div>
                  <div className='summarize-profile-numeric'>{displayPercentage(percentage)}</div>
                </div>
              ))}
            </div>
        ))}
      </div>
    );
  }
}

SummarizeProfile.propTypes = {
  summaries: PropTypes.array,
};

export default connect((state, props) => {
  return {
    summaries: getProfileSummaries(state, props),
  };
})(SummarizeProfile);

/**
 * Format a percentage for display, e.g. 0.1344844543 => "13.45%".
 * @param {number} n - The number.
 * @returns {string} The formatted string.
 */
function displayPercentage (n) {
  const percentage = Math.round(n * 1000);
  const integer = Math.floor(percentage / 10);
  const decimal = Math.floor(percentage - integer * 10);
  return `${integer}.${decimal}`;
}
