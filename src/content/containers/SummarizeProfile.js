import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import { getProfileSummaries, getThreadNames, getProfileExpandedSummaries } from '../selectors/';
import SummarizeLineGraph from '../components/summarize-profile/SummarizeLineGraph';
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
                  {renderHeader(thread)}
                  {renderThreadSummary(summary, rollingSummary, isExpanded)}
                  {renderExpandButton(summary, thread, isExpanded, expand, collapse)}
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
              {renderHeader(thread)}
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

function renderExpandButton (summary, thread, isExpanded, expand, collapse) {
  // Only show the expand/collapse button when it is warranted.
  if (summary.length > EXPAND_LENGTH) {
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

function renderThreadSummary(summary, rollingSummary, isExpanded) {
  return summary.map(({category, samples, percentage}, i) => {
    if (i > EXPAND_LENGTH && !isExpanded) {
      return null;
    }
    return (
      <div className='summarize-profile-row' key={category}>
        <SummarizeLineGraph rollingSummary={rollingSummary} category={category} />
        <div className='summarize-profile-details'>
          <div className='summarize-profile-text'>{category}</div>
          <div className='summarize-profile-numeric'>{samples}</div>
          <div className='summarize-profile-numeric'>{displayPercentage(percentage)}</div>
        </div>
      </div>
    );
  });
}

function renderHeader (name) {
  return (
    <div>
      <div className='summarize-profile-thread' colSpan='3'>{name} Thread</div>
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

SummarizeProfile.propTypes = {
  summaries: PropTypes.array,
  expanded: PropTypes.object,
  threadNames: PropTypes.array,
};

function fill (size, fn) {
  const array = Array(size);
  for (let i = 0; i < size; i++) {
    array[i] = fn(i);
  }
  return array;
}

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

export default connect((state, props) => {
  return {
    expanded: getProfileExpandedSummaries(state, props),
    summaries: getProfileSummaries(state, props),
    threadNames: getThreadNames(state, props),
  };
}, actions)(SummarizeProfile);
