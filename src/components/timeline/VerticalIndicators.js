/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import { DivWithTooltip } from 'firefox-profiler/components/tooltip/DivWithTooltip';
import { withSize } from 'firefox-profiler/components/shared/WithSize';
import { displayNiceUrl } from 'firefox-profiler/utils';
import { formatSeconds } from 'firefox-profiler/utils/format-numbers';

import type { SizeProps } from 'firefox-profiler/components/shared/WithSize';
import type {
  PageList,
  Marker,
  MarkerIndex,
  Milliseconds,
} from 'firefox-profiler/types';

import './VerticalIndicators.css';

type Props = {|
  +getMarker: MarkerIndex => Marker,
  +verticalMarkerIndexes: MarkerIndex[],
  +pages: PageList | null,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +zeroAt: Milliseconds,
  ...SizeProps,
|};

/**
 * This component draws vertical indicators from navigation related markers for a track
 * in the timeline.
 */
class VerticalIndicatorsImpl extends React.PureComponent<Props> {
  render() {
    const {
      getMarker,
      verticalMarkerIndexes,
      pages,
      rangeStart,
      rangeEnd,
      zeroAt,
      width,
    } = this.props;
    return (
      <div
        data-testid="vertical-indicators"
        className="timelineVerticalIndicators"
      >
        {verticalMarkerIndexes.map(markerIndex => {
          const marker = getMarker(markerIndex);
          // Decide on the indicator color.
          let color = '#000';
          switch (marker.name) {
            case 'Navigation::Start':
              color = 'var(--grey-40)';
              break;
            case 'Load':
              color = 'var(--red-60)';
              break;
            case 'DOMContentLoaded':
              color = 'var(--blue-50)';
              break;
            default:
              if (marker.name.startsWith('Contentful paint ')) {
                color = 'var(--green-60)';
              }
          }

          // Compute the positioning
          const rangeLength = rangeEnd - rangeStart;
          const xPixelsPerMs = width / rangeLength;
          const left = (marker.start - rangeStart) * xPixelsPerMs;

          // Optionally compute a url.
          let url = null;
          const { data } = marker;
          if (
            pages &&
            data &&
            data.type === 'tracing' &&
            data.category === 'Navigation'
          ) {
            const innerWindowID = data.innerWindowID;
            if (innerWindowID) {
              const page = pages.find(
                page => page.innerWindowID === innerWindowID
              );
              if (page) {
                url = (
                  <div className="timelineVerticalIndicatorsUrl">
                    {displayNiceUrl(page.url)}
                  </div>
                );
              }
            }
          }

          // Create the div with a tooltip.
          return (
            <DivWithTooltip
              key={markerIndex}
              data-testid="vertical-indicator-line"
              style={{ '--vertical-indicator-color': color, left }}
              className="timelineVerticalIndicatorsLine"
              tooltip={
                <>
                  <div>
                    <span
                      className="timelineVerticalIndicatorsSwatch"
                      style={{ backgroundColor: color }}
                    />{' '}
                    {marker.name}
                    <span className="timelineVerticalIndicatorsDim">
                      {' at '}
                    </span>
                    <span className="timelineVerticalIndicatorsTime">
                      {formatSeconds(marker.start - zeroAt)}
                    </span>{' '}
                  </div>
                  {url}
                </>
              }
            />
          );
        })}
      </div>
    );
  }
}

// The withSize type coercion is not happening correctly.
export const VerticalIndicators = withSize<Props>(VerticalIndicatorsImpl);
