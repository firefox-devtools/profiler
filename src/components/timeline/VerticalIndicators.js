/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import * as React from 'react';
import DivWithTooltip from '../shared/DivWithTooltip';
import { withSize } from '../shared/WithSize';
import { displayNiceUrl } from '../../utils';
import { formatSeconds } from '../../utils/format-numbers';

import type { SizeProps } from '../shared/WithSize';
import type { PageList } from '../../types/profile';
import type { IndexedMarker } from '../../types/profile-derived';
import type { Milliseconds } from '../../types/units';

import './VerticalIndicators.css';

type OwnProps = {|
  +verticalMarkers: IndexedMarker[],
  +pages: PageList | null,
  +rangeStart: Milliseconds,
  +rangeEnd: Milliseconds,
  +zeroAt: Milliseconds,
|};

type Props = {|
  ...OwnProps,
  ...SizeProps,
|};

/**
 * This component draws vertical indicators from navigation related markers for a track
 * in the timeline.
 */
const VerticalIndicatorsImpl = ({
  verticalMarkers,
  pages,
  rangeStart,
  rangeEnd,
  zeroAt,
  width,
}: Props) => {
  return (
    <div
      data-testid="vertical-indicators"
      className="timelineVerticalIndicators"
    >
      {verticalMarkers.map(marker => {
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
          const docshellId = data.docShellId;
          const historyId = data.docshellHistoryId;
          if (docshellId) {
            const page = pages.find(
              page =>
                page.docshellId === docshellId && page.historyId === historyId
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
            key={marker.markerRef}
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
};

// The withSize type coercion is not happening correctly.
export const VerticalIndicators = (withSize(
  VerticalIndicatorsImpl
): React.ComponentType<OwnProps>);
