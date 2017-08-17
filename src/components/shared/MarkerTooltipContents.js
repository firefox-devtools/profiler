/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import formatTimeLength from '../../utils/format-time-length';

import type { TracingMarker } from '../../types/profile-derived';
import type { MarkerPayload } from '../../types/markers';

function _markerDetail<T>(
  key: string,
  label: string,
  value: T,
  fn: T => string = String
): Array<React$Element<*> | string> {
  if (value) {
    return [
      <div className="tooltipLabel" key="{key}">
        {label}:
      </div>,
      fn(value),
    ];
  } else {
    return [];
  }
}

function getMarkerDetails(data: MarkerPayload): React$Element<*> | null {
  if (data) {
    switch (data.type) {
      case 'UserTiming': {
        return (
          <div className="tooltipDetails">
            {_markerDetail('name', 'Name', data.name)}
          </div>
        );
      }
      case 'DOMEvent': {
        return (
          <div className="tooltipDetails">
            {_markerDetail('type', 'Type', data.eventType)}
          </div>
        );
      }
      case 'GCMinor': {
        if (data.nursery) {
          return (
            <div className="tooltipDetails">
              {_markerDetail('gcreason', 'Reason', data.nursery.reason)}
            </div>
          );
        } else {
          return null;
        }
      }
      case 'GCMajor': {
        let zones_collected_total;
        if (data.timings.zones_collected && data.timings.total_zones) {
          zones_collected_total =
            data.timings.zones_collected + ' / ' + data.timings.total_zones;
        }
        return (
          <div className="tooltipDetails">
            {_markerDetail('gcreason', 'Reason', data.timings.reason)}
            {data.timings.nonincremental_reason !== 'None' &&
              _markerDetail(
                'gcnonincrementalreason',
                'Non-incremental reason',
                data.timings.nonincremental_reason
              )}
            {_markerDetail(
              'gcmaxpause',
              'Max Pause',
              data.timings.max_pause,
              x => x + 'ms'
            )}
            {_markerDetail('gcnumminors', 'Minor GCs', data.timings.minor_gcs)}
            {_markerDetail('gcnumslices', 'Slices', data.timings.slices)}
            {_markerDetail('gcnumzones', 'Zones', zones_collected_total)}
          </div>
        );
      }
      case 'GCSlice': {
        return (
          <div className="tooltipDetails">
            {_markerDetail('gcreason', 'Reason', data.timings.reason)}
            {_markerDetail('gcbudget', 'Budget', data.timings.budget)}
            {_markerDetail(
              'gcstate',
              'States',
              data.timings.initial_state + ' \u2013 ' + data.timings.final_state
            )}
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
  threadName?: string,
};

export default class MarkerTooltipContents extends PureComponent {
  props: Props;

  render() {
    const { marker, className, threadName } = this.props;
    const details = getMarkerDetails(marker.data);

    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className={classNames({ tooltipHeader: details })}>
          <div className="tooltipOneLine">
            <div className="tooltipTiming">
              {formatTimeLength(marker.dur)}ms
            </div>
            <div className="tooltipTitle">
              {marker.title || marker.name}
            </div>
          </div>
          {threadName
            ? <div className="tooltipDetails">
                <div className="tooltipLabel">Thread:</div>
                {threadName}
              </div>
            : null}
        </div>
        {details}
      </div>
    );
  }
}
