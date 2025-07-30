/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as React from 'react';
import { TrackEventDelayGraph } from './TrackEventDelayGraph';
import {
  TRACK_EVENT_DELAY_HEIGHT,
  TRACK_EVENT_DELAY_LINE_WIDTH,
} from 'firefox-profiler/app-logic/constants';

import { ThreadIndex } from 'firefox-profiler/types';

import './TrackEventDelay.css';

type Props = {
  readonly threadIndex: ThreadIndex;
};

export class TrackEventDelay extends React.PureComponent<Props, {}> {
  override render() {
    const { threadIndex } = this.props;
    const graphHeight = TRACK_EVENT_DELAY_HEIGHT;
    return (
      <div
        className="timelineTrackEventDelay"
        style={{
          height: graphHeight,
          '--graph-height': `${graphHeight}px`,
          '--markers-height': `0px`,
        } as React.CSSProperties}
      >
        <TrackEventDelayGraph
          threadIndex={threadIndex}
          lineWidth={TRACK_EVENT_DELAY_LINE_WIDTH}
          graphHeight={graphHeight}
        />
      </div>
    );
  }
}