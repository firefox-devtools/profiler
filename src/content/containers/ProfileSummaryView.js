import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getProfile } from '../reducers/profile-view';
import { getProfileSummaries, getProfileExpandedSummaries } from '../reducers/summary-view';
import SummarizeLineGraph from '../components/SummarizeLineGraph';
import SummarizeProfileHeader from '../components/SummarizeProfileHeader';
import SummarizeProfileExpand from '../components/SummarizeProfileExpand';
import SummarizeProfileThread from '../components/SummarizeProfileThread';
import actions from '../actions';

require('./ProfileSummaryView.css');

const EXPAND_LENGTH = 5;

class ProfileSummaryView extends Component {
  render() {
    const {
      summaries, expanded, threads,
      collapseProfileSummaryThread: collapse,
      expandProfileSummaryThread: expand,
    } = this.props;

    if (summaries) {
      return (
        <div className='summarize-profile'>
          <div className='summarize-profile-inner'>
            {summaries.map(({threadIndex, summary, rollingSummary}) => {
              const { processType, name: threadName } = threads[threadIndex];
              const isExpanded = expanded.has(threadIndex);

              return (
                <div key={threadIndex}>
                  <div className='summarize-profile-table'>
                    <SummarizeProfileHeader threadName={threadName}
                                            processType={processType} />
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
                      threadIndex={threadIndex}
                      isExpanded={isExpanded}
                      expand={expand}
                      collapse={collapse}
                      expandLength={EXPAND_LENGTH} />
                    </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    return (
      <div className='summarize-profile'>
        <div className='summarize-profile-inner'>
          {threads.map((thread, threadIndex) => (
            <div key={threadIndex}>
              <div className='summarize-profile-table'>
                <SummarizeProfileHeader threadName={thread.name}
                                        processType={thread.processType} />
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
      </div>
    );
  }
}

ProfileSummaryView.propTypes = {
  summaries: PropTypes.array,
  expanded: PropTypes.object,
  threads: PropTypes.array,
  collapseProfileSummaryThread: PropTypes.func,
  expandProfileSummaryThread: PropTypes.func,
};

function fill(size, fn) {
  const array = Array(size);
  for (let i = 0; i < size; i++) {
    array[i] = fn(i);
  }
  return array;
}


export default connect(state => {
  return {
    expanded: getProfileExpandedSummaries(state),
    summaries: getProfileSummaries(state),
    threads: getProfile(state).threads,
  };
}, actions)(ProfileSummaryView);
