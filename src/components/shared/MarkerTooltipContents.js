/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import formatTimeLength from '../../utils/format-time-length';

import type { TracingMarker } from '../../types/profile-derived';
import type { MarkerPayload } from '../../types/markers';

function getMarkerDetails(data: MarkerPayload): React$Element<*> | null {
  if (data) {
    switch (data.type) {
      case 'UserTiming': {
        return (
          <div className="tooltipDetails">
            <div className="tooltipLabel">Name:</div>
            {data.name}
          </div>
        );
      }
      case 'DOMEvent': {
        return (
          <div className="tooltipDetails">
            <div className="tooltipLabel">Type:</div>
            {data.eventType}
          </div>
        );
      }
      default:
    }
  }
  return null;
}

type Props = {
  marker: TracingMarker,
  className?: string,
};

export default class MarkerTooltipContents extends PureComponent {
  props: Props;

  render() {
    const { marker, className } = this.props;
    const details = getMarkerDetails(marker.data);

    return (
      <div className={classNames('tooltipMarker', className)}>
        <div
          className={classNames('tooltipOneLine', { tooltipHeader: details })}
        >
          <div className="tooltipTiming">
            {formatTimeLength(marker.dur)}ms
          </div>
          <div className="tooltipTitle">
            {marker.title || marker.name}
          </div>
        </div>
        {details}
      </div>
    );
  }
}
