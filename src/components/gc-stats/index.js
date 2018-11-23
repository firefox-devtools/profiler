/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import explicitConnect from '../../utils/connect';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';
import type { PauseInfo, GCStats } from '../../types/profile-derived';

import type { PreviewSelection } from '../../types/actions';
import {
  selectedThreadSelectors,
  getPreviewSelection,
  getProfileInterval,
} from '../../reducers/profile-view';
import {
  formatMilliseconds,
  formatNumber,
  formatValueTotal,
} from '../../utils/format-numbers';
import type { Milliseconds, StartEndRange } from '../../types/units';
import * as ProfileData from '../../profile-logic/profile-data';

type DispatchProps = {||};

type StateProps = {|
  +gcStats: GCStats,
  +previewSelection: PreviewSelection,
  +timeRange: StartEndRange,
|};

type Props = ConnectedProps<{||}, StateProps, DispatchProps>;

function _pauseInfoView(
  name: string,
  info: PauseInfo | null,
  totalTime: Milliseconds
): React.Node {
  if (!info) {
    return <div>No pauses for {name}.</div>;
  }

  return (
    <div>
      {info.numberOfPauses} pauses for {name}:<br />
      <table>
        <tr>
          <th className="tooltipLabel">Mean:</th>
          <td>
            {formatMilliseconds(info.meanPause, 3, 2)} &plusmn;{formatNumber(
              info.stdDev,
              3,
              2
            )}
          </td>
        </tr>
        <tr>
          <th className="tooltipLabel">Median:</th>
          <td>{formatMilliseconds(info.medianPause, 3, 2)}</td>
        </tr>
        <tr>
          <th className="tooltipLabel">90th percentile:</th>
          <td>{formatMilliseconds(info.p90Pause, 3, 2)}</td>
        </tr>
        <tr>
          <th className="tooltipLabel">Max:</th>
          <td>{formatMilliseconds(info.maxPause, 3, 2)}</td>
        </tr>
        <tr>
          <th className="tooltipLabel">Total:</th>
          <td>
            {formatValueTotal(info.totalPaused, totalTime, formatMilliseconds)}
          </td>
        </tr>
      </table>
    </div>
  );
}

class GCStatsView extends React.PureComponent<Props> {
  render() {
    const { gcStats, timeRange } = this.props;

    const totalTime = timeRange.end - timeRange.start;

    return (
      <div className="gcStats">
        {_pauseInfoView('Nursery collections', gcStats.minorPauses, totalTime)}
        {_pauseInfoView('Major slices', gcStats.slicePauses, totalTime)}
        {_pauseInfoView('All pauses', gcStats.allPauses, totalTime)}
        Number of majors: {gcStats.numMajor}
        <br />
      </div>
    );
  }
}

const options: ExplicitConnectOptions<{||}, StateProps, DispatchProps> = {
  mapStateToProps: state => {
    return {
      gcStats: selectedThreadSelectors.getPreviewFilteredGCStats(state),
      previewSelection: getPreviewSelection(state),
      timeRange: ProfileData.getTimeRangeForThread(
        selectedThreadSelectors.getPreviewFilteredThread(state),
        getProfileInterval(state)
      ),
    };
  },
  component: GCStatsView,
};

export default explicitConnect(options);
