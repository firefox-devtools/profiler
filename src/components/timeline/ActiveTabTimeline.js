/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import TimelineRuler from './Ruler';
import TimelineSelection from './Selection';
import OverflowEdgeIndicator from './OverflowEdgeIndicator';
import { withSize } from '../shared/WithSize';
import explicitConnect from '../../utils/connect';
import { getPanelLayoutGeneration } from '../../selectors/app';
import { getCommittedRange, getZeroAt } from '../../selectors/profile';

import './index.css';

import type { SizeProps } from '../shared/WithSize';
import type { InitialSelectedTrackReference } from '../../types/profile-derived';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type { ConnectedProps } from '../../utils/connect';

type StateProps = {|
  +committedRange: StartEndRange,
  +panelLayoutGeneration: number,
  +zeroAt: Milliseconds,
|};

type Props = {|
  ...SizeProps,
  ...ConnectedProps<{||}, StateProps, {||}>,
|};

type State = {|
  initialSelected: InitialSelectedTrackReference | null,
|};

class ActiveTabTimeline extends React.PureComponent<Props, State> {
  state = {
    initialSelected: null,
  };

  /**
   * This method collects the initially selected track's HTMLElement. This allows the timeline
   * to scroll the initially selected track into view once the page is loaded.
   */
  setInitialSelected = (el: InitialSelectedTrackReference) => {
    this.setState({ initialSelected: el });
  };

  render() {
    const { committedRange, zeroAt, width, panelLayoutGeneration } = this.props;

    return (
      <>
        <TimelineSelection width={width}>
          <TimelineRuler
            zeroAt={zeroAt}
            rangeStart={committedRange.start}
            rangeEnd={committedRange.end}
            width={width}
          />
          <OverflowEdgeIndicator
            className="timelineOverflowEdgeIndicator"
            panelLayoutGeneration={panelLayoutGeneration}
            initialSelected={this.state.initialSelected}
          >
            <ol className="timelineThreadList">
              {/* TODO: Add the active tab global tracks here */}
            </ol>
          </OverflowEdgeIndicator>
        </TimelineSelection>
      </>
    );
  }
}

export default explicitConnect<{||}, StateProps, {||}>({
  mapStateToProps: state => ({
    committedRange: getCommittedRange(state),
    zeroAt: getZeroAt(state),
    panelLayoutGeneration: getPanelLayoutGeneration(state),
  }),
  component: withSize<Props>(ActiveTabTimeline),
});
