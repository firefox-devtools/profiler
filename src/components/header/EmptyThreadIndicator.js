/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React, { PureComponent } from 'react';
import { withSize } from '../shared/WithSize';
import DivWithTooltip from '../shared/DivWithTooltip';
import { oneLine } from 'common-tags';

import type { Thread } from '../../types/profile';
import type { Milliseconds, StartEndRange } from '../../types/units';
import type { SizeProps } from '../shared/WithSize';

import './EmptyThreadIndicator.css';

type SyntheticCssDeclarations = {
  [string]: string | number,
};

type Props = {|
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +thread: Thread,
  +interval: Milliseconds,
  +unfilteredSamplesRange: StartEndRange | null,
  ...SizeProps,
|};

class EmptyThreadIndicator extends PureComponent<Props> {
  _canvas: HTMLCanvasElement | null;
  _requestedAnimationFrame: boolean | null;

  _getIndicatorPositions(): {|
    startup: SyntheticCssDeclarations | null,
    shutdown: SyntheticCssDeclarations | null,
    emptyBufferStart: SyntheticCssDeclarations | null,
  |} {
    const {
      rangeStart,
      rangeEnd,
      width,
      unfilteredSamplesRange,
      interval,
      thread: { processShutdownTime, registerTime, unregisterTime },
    } = this.props;
    const rangeLength = rangeEnd - rangeStart;
    const xPixelsPerMs = width / rangeLength;

    const threadEndTime =
      unregisterTime === null ? processShutdownTime : unregisterTime;

    // Did this thread startup in this time range?
    let startup = null;
    if (registerTime > rangeStart) {
      startup = {
        left: 0,
        width: (registerTime - rangeStart) * xPixelsPerMs,
      };
    }

    // Did this thread shut down in this time range?
    let shutdown = null;
    if (threadEndTime !== null && threadEndTime < rangeEnd) {
      shutdown = {
        right: 0,
        width: (rangeEnd - threadEndTime) * xPixelsPerMs,
      };
    }

    let emptyBufferStart = null;
    if (
      // Threads could have no samples, and therefore no range.
      unfilteredSamplesRange !== null &&
      // Was the buffer empty at the beginning of the range, at least one interval length
      // into the profile? This interval length ensures no awkward cut off where it's not
      // really needed.
      unfilteredSamplesRange.start > rangeStart + interval
    ) {
      const startMilliseconds = Math.max(0, registerTime - rangeStart);
      emptyBufferStart = {
        left: startMilliseconds * xPixelsPerMs,
        right:
          width - (unfilteredSamplesRange.start - rangeStart) * xPixelsPerMs,
      };
    }

    return { startup, shutdown, emptyBufferStart };
  }

  render() {
    const style = this._getIndicatorPositions();
    return (
      <div className="headerEmptyThreadIndicator">
        {style.startup
          ? <DivWithTooltip
              style={style.startup}
              className="headerEmptyThreadIndicatorBlock headerEmptyThreadIndicatorStartup"
              tooltip="This thread hasn't started yet"
            />
          : null}
        {style.shutdown
          ? <DivWithTooltip
              style={style.shutdown}
              className="headerEmptyThreadIndicatorBlock headerEmptyThreadIndicatorShutdown"
              tooltip="This thread has shut down here"
            />
          : null}
        {style.emptyBufferStart
          ? <DivWithTooltip
              style={style.emptyBufferStart}
              className="headerEmptyThreadIndicatorBlock headerEmptyThreadIndicatorEmptyBuffer"
              tooltip={
                <span className="headerEmptyThreadIndicatorLongTooltip">
                  {oneLine`
                    This buffer was empty. Either the profiler was still initializing for
                    a new thread, or the profiling buffer was full. Increase your buffer
                    size before recording to potentially include more samples.
                  `}
                </span>
              }
            />
          : null}
      </div>
    );
  }
}

export default withSize(EmptyThreadIndicator);
