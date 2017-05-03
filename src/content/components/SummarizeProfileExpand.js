import React, { PureComponent, PropTypes } from 'react';
import SummarizeLineGraph from './SummarizeLineGraph';

class SummarizeProfileExpand extends PureComponent {
  render() {
    const {summary, threadIndex, isExpanded, expand, collapse, expandLength} = this.props;
    // Only show the expand/collapse button when it is warranted.
    if (summary.length > expandLength) {
      return (
        <div className='summarize-profile-row'>
          <SummarizeLineGraph isBlank={true} />
          <div className='summarize-profile-details'>
            {
              isExpanded
                ? <a className='summarize-profile-collapse expanded' onClick={() => collapse(threadIndex) }>Collapse</a>
                : <a className='summarize-profile-collapse' onClick={() => expand(threadIndex) }>Expand remaining categories...</a>
            }
          </div>
        </div>
      );
    }
    return null;
  }
}

SummarizeProfileExpand.propTypes = {
  summary: PropTypes.array,
  threadIndex: PropTypes.number.isRequired,
  isExpanded: PropTypes.bool,
  expand: PropTypes.func,
  collapse: PropTypes.func,
  expandLength: PropTypes.number,
};

export default SummarizeProfileExpand;
