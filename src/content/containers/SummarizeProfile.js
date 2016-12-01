import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getProfileSummaries, getThreadNames, getProfileExpandedSummaries } from '../selectors/';
import SummarizeLineGraph from '../components/summarize-profile/SummarizeLineGraph';
import SummarizeProfileHeader from '../components/summarize-profile/SummarizeProfileHeader';
import SummarizeProfileExpand from '../components/summarize-profile/SummarizeProfileExpand';
import SummarizeProfileThread from '../components/summarize-profile/SummarizeProfileThread';
import * as actions from '../actions';

const EXPAND_LENGTH = 5;

class SummarizeProfile extends Component {
  render() {
    const {
      summaries, expanded, threadNames,
      collapseProfileSummaryThread: collapse,
      expandProfileSummaryThread: expand,
    } = this.props;

    if (summaries) {
      return (
        <div className='summarize-profile'>
          {summaries.map(({thread, summary, rollingSummary}) => {
            const isExpanded = expanded.has(thread);

            return (
              <div key={thread}>
                <div className='summarize-profile-table'>
                  <SummarizeProfileHeader threadName={thread} />
                  {summary.map((summaryTable, index) => (
                    <SummarizeProfileThread
                      summaryTable={summaryTable}
                      rollingSummary={rollingSummary}
                      isExpanded={isExpanded}
                      index={index}
                      key={summaryTable.category}
                      expandLength={EXPAND_LENGTH} />
                  ))}
                  <SummarizeProfileExpand
                    summary={summary}
                    thread={thread}
                    isExpanded={isExpanded}
                    expand={expand}
                    collapse={collapse}
                    expandLength={EXPAND_LENGTH} />
                  </div>
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className='summarize-profile'>
        {threadNames.map(thread => (
          <div key={thread}>
            <div className='summarize-profile-table'>
              <SummarizeProfileHeader thread={thread} />
              {fill(3, i => (
                <div className='summarize-profile-row' key={i}>
                  <SummarizeLineGraph />
                  <div className='summarize-profile-details'>
                    <div className='summarize-profile-text'><div className='filler summarize-profile-filler'></div></div>
                    <div className='summarize-profile-numeric'><div className='filler summarize-profile-filler'></div></div>
                    <div className='summarize-profile-numeric'><div className='filler summarize-profile-filler'></div></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }
}

SummarizeProfile.propTypes = {
  summaries: PropTypes.array,
  expanded: PropTypes.object,
  threadNames: PropTypes.array,
  collapseProfileSummaryThread: PropTypes.function,
  expandProfileSummaryThread: PropTypes.function,
};

function fill (size, fn) {
  const array = Array(size);
  for (let i = 0; i < size; i++) {
    array[i] = fn(i);
  }
  return array;
}


export default connect((state, props) => {
  return {
    expanded: getProfileExpandedSummaries(state, props),
    summaries: getProfileSummaries(state, props),
    threadNames: getThreadNames(state, props),
  };
}, actions)(SummarizeProfile);
