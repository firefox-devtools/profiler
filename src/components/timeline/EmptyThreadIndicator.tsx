/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
import { PureComponent } from 'react';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import { DivWithTooltip } from 'firefox-profiler/components/tooltip/DivWithTooltip';
import { oneLine } from 'common-tags';

import { Thread, Milliseconds, StartEndRange } from 'firefox-profiler/types';

import { SizeProps } from 'firefox-profiler/components/shared/WithSize';

import './EmptyThreadIndicator.css';

type SyntheticCssDeclarations = {
  [key: string]: string | number;
};

type Props = SizeProps & {
  readonly rangeStart: Milliseconds;
  readonly rangeEnd: Milliseconds;
  readonly thread: Thread;
  readonly interval: Milliseconds;
  readonly unfilteredSamplesRange: StartEndRange | null;
};

/**
 * This component displays the reasons why a thread may be empty. The supported indicators
 * include showing when the thread hasn't started up, when the buffer is empty with no
 * samples (most likely due to the circular buffer dropping data), and finally when the
 * thread was shut down.
 */
class EmptyThreadIndicatorImpl extends PureComponent<Props> {
  override render() {
    const style = getIndicatorPositions(this.props);
    return (
      <div className="timelineEmptyThreadIndicator">
        {style.startup ? (
          <DivWithTooltip
            style={style.startup}
            className="timelineEmptyThreadIndicatorBlock timelineEmptyThreadIndicatorStartup"
            tooltip="This thread hasn't started yet"
          />
        ) : null}
        {style.shutdown ? (
          <DivWithTooltip
            style={style.shutdown}
            className="timelineEmptyThreadIndicatorBlock timelineEmptyThreadIndicatorShutdown"
            tooltip="This thread has shut down here"
          />
        ) : null}
        {style.emptyBufferStart ? (
          <DivWithTooltip
            style={style.emptyBufferStart}
            className="timelineEmptyThreadIndicatorBlock timelineEmptyThreadIndicatorEmptyBuffer"
            tooltip={
              <span className="timelineEmptyThreadIndicatorLongTooltip">
                {oneLine`
                    This buffer was empty. Either the profiler was still initializing for
                    a new thread, or the profiling buffer was full. Increase your buffer
                    size before recording to potentially include more samples.
                  `}
              </span>
            }
          />
        ) : null}
      </div>
    );
  }
}

/**
 * Define this outside of the class so that it's easily testable. The internals
 * are a little complicated with the math, but the test file should have some
 * pretty clear explanations of the requirements:
 * src/test/components/EmptyThreadIndicator.test.js
 */
export function getIndicatorPositions(props: Props): {
  startup: SyntheticCssDeclarations | null;
  shutdown: SyntheticCssDeclarations | null;
  emptyBufferStart: SyntheticCssDeclarations | null;
} {
  const {
    rangeStart,
    rangeEnd,
    width,
    unfilteredSamplesRange,
    interval,
    thread: { processShutdownTime, registerTime, unregisterTime },
  } = props;
  const rangeLength = rangeEnd - rangeStart;
  const xPixelsPerMs = width / rangeLength;
  const threadEndTime =
    unregisterTime === null ? processShutdownTime : unregisterTime;

  // Did this thread startup in this time range?
  let startup = null;
  if (registerTime > rangeStart) {
    startup = {
      left: 0,
      width: Math.min(width, (registerTime - rangeStart) * xPixelsPerMs),
    };
  }

  // Did this thread shut down in this time range?
  let shutdown = null;
  if (threadEndTime !== null && threadEndTime < rangeEnd) {
    shutdown = {
      right: 0,
      width: Math.min(width, (rangeEnd - threadEndTime) * xPixelsPerMs),
    };
  }

  let emptyBufferStart = null;
  if (
    // Threads could have no samples, and therefore no range.
    unfilteredSamplesRange !== null &&
    // Was the buffer empty at the beginning of the range, at least one interval length
    // into the profile? This interval length ensures no awkward cut off where it's not
    // really needed.
    unfilteredSamplesRange.start >= rangeStart + interval &&
    // Only show this if it's actually in the current range.
    registerTime < rangeEnd
  ) {
    const startMilliseconds = Math.max(0, registerTime - rangeStart);
    emptyBufferStart = {
      left: startMilliseconds * xPixelsPerMs,
      width: Math.min(
        width,
        (unfilteredSamplesRange.start - Math.max(registerTime, rangeStart)) *
          xPixelsPerMs
      ),
    };
  }

  return { startup, shutdown, emptyBufferStart };
}

export const EmptyThreadIndicator = withSize<Props>(EmptyThreadIndicatorImpl);
