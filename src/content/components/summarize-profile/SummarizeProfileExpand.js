import React, { PropTypes } from 'react';
import SummarizeLineGraph from './SummarizeLineGraph';

export function SummarizeProfileExpand (props) {
  const {summary, thread, isExpanded, expand, collapse, expandLength} = props;
  // Only show the expand/collapse button when it is warranted.
  if (summary.length > expandLength) {
    return (
      <div className='summarize-profile-row'>
        <SummarizeLineGraph isBlank={true} />
        <div className='summarize-profile-details'>
          {
            isExpanded
              ? <a className='summarize-profile-collapse expanded' onClick={() => collapse(thread) }>Collapse</a>
              : <a className='summarize-profile-collapse' onClick={() => expand(thread) }>Expand remaining categories...</a>
          }
        </div>
      </div>
    );
  }
  return null;
}

SummarizeProfileExpand.propTypes = {
  summary: PropTypes.array,
  thread: PropTypes.string,
  isExpanded: PropTypes.boolean,
  expand: PropTypes.func,
  collapse: PropTypes.func,
  expandLength: PropTypes.number,
};
