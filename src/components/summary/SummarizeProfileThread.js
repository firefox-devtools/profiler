/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import SummarizeLineGraph from './SummarizeLineGraph';

class SummarizeProfileThread extends PureComponent {
  render() {
    const {
      summaryTable,
      rollingSummary,
      isExpanded,
      index,
      expandLength,
    } = this.props;
    if (index > expandLength && !isExpanded) {
      return null;
    }
    const { category, samples, percentage } = summaryTable;
    return (
      <div className="summarize-profile-row">
        <SummarizeLineGraph
          rollingSummary={rollingSummary}
          category={category}
        />
        <div className="summarize-profile-details">
          <div className="summarize-profile-text">
            {category}
          </div>
          <div className="summarize-profile-numeric">
            {samples}
          </div>
          <div className="summarize-profile-numeric">
            {displayPercentage(percentage)}
          </div>
        </div>
      </div>
    );
  }
}

SummarizeProfileThread.propTypes = {
  summaryTable: PropTypes.object,
  rollingSummary: PropTypes.array,
  isExpanded: PropTypes.bool,
  index: PropTypes.number,
  expandLength: PropTypes.number,
};

export default SummarizeProfileThread;
/**
 * Format a percentage for display, e.g. 0.1344844543 => "13.45%".
 * @param {number} n - The number.
 * @returns {string} The formatted string.
 */
function displayPercentage(n) {
  const percentage = Math.round(n * 1000);
  const integer = Math.floor(percentage / 10);
  const decimal = Math.floor(percentage - integer * 10);
  return `${integer}.${decimal}`;
}
