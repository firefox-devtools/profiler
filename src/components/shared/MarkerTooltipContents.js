/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { formatNumber, formatPercent } from '../../utils/format-numbers';

import type { TracingMarker } from '../../types/profile-derived';
import type { MarkerPayload } from '../../types/markers';

function _markerDetail<T>(
  key: string,
  label: string,
  value: T,
  fn: T => string = String
): Array<React$Element<*> | string> {
  return [
    <div className="tooltipLabel" key="{key}">
      {label}:
    </div>,
    fn(value),
  ];
}

function _formatBytes(bytes: number): string {
  if (bytes < 4 * 1024) {
    return formatNumber(bytes) + 'B';
  } else if (bytes < 4 * 1024 * 1024) {
    return formatNumber(bytes / 1024) + 'KB';
  } else if (bytes < 4 * 1024 * 1024 * 1024) {
    return formatNumber(bytes / (1024 * 1024)) + 'MB';
  } else {
    return formatNumber(bytes / (1024 * 1024 * 1024)) + 'GB';
  }
}

function _formatValueTotal(
  a: number,
  b: number,
  formatNum: number => string,
  includePercent: boolean = true
) {
  const value_total = formatNum(a) + ' / ' + formatNum(b);
  let percent = '';
  if (includePercent) {
    percent = ' (' + formatPercent(a / b) + ')';
  }

  return value_total + percent;
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
        let latency = 0;
        if (data.timeStamp) {
          latency = `${formatNumber(data.startTime - data.timeStamp)}ms`;
        }
        return (
          <div className="tooltipDetails">
            {_markerDetail('type', 'Type', data.eventType)}
            {latency ? _markerDetail('latency', 'Latency', latency) : null}
          </div>
        );
      }
      case 'GCMinor': {
        if (data.nursery) {
          const nursery = data.nursery;
          switch (nursery.status) {
            case 'complete': {
              return (
                <div className="tooltipDetails">
                  {_markerDetail('gcreason', 'Reason', nursery.reason)}
                  {_markerDetail(
                    'gcpromotion',
                    'Bytes tenured',
                    _formatValueTotal(
                      nursery.bytes_tenured,
                      nursery.bytes_used,
                      _formatBytes
                    )
                  )}
                  {_markerDetail(
                    'gcnurseryusage',
                    'Bytes used',
                    _formatValueTotal(
                      nursery.bytes_used,
                      nursery.cur_capacity,
                      _formatBytes
                    )
                  )}
                  {_markerDetail(
                    'gcnewnurserysize',
                    'New nursery size',
                    nursery.new_capacity,
                    _formatBytes
                  )}
                </div>
              );
            }
            case 'nursery disabled':
              return (
                <div className="tooltipDetails">
                  {_markerDetail('gcstatus', 'Status', 'Nursery disabled')}
                </div>
              );
            case 'nursery empty':
              return (
                <div className="tooltipDetails">
                  {_markerDetail('gcstatus', 'Status', 'Nursery empty')}
                </div>
              );
            default:
              return null;
          }
        } else {
          return null;
        }
      }
      case 'GCMajor': {
        const timings = data.timings;
        switch (timings.status) {
          case 'aborted':
            return (
              <div className="tooltipDetails">
                {_markerDetail('status', 'Status', 'Aborted (OOM)')}
              </div>
            );
          case 'completed': {
            return (
              <div className="tooltipDetails">
                {_markerDetail('gcreason', 'Reason', timings.reason)}
                {timings.nonincremental_reason !== 'None' &&
                  _markerDetail(
                    'gcnonincrementalreason',
                    'Non-incremental reason',
                    timings.nonincremental_reason
                  )}
                {_markerDetail(
                  'gctime',
                  'Total slice times',
                  timings.total_time,
                  x => x + 'ms'
                )}
                {_markerDetail(
                  'gcmaxpause',
                  'Max Pause',
                  timings.max_pause,
                  x => x + 'ms'
                )}
                {_markerDetail(
                  'gcusage',
                  'Heap usage',
                  _formatBytes(timings.allocated)
                )}
                {_markerDetail(
                  'gcmmu20ms',
                  'MMU 20ms',
                  timings.mmu_20ms,
                  formatPercent
                )}
                {_markerDetail(
                  'gcmmu50ms',
                  'MMU 50ms',
                  timings.mmu_50ms,
                  formatPercent
                )}
                {_markerDetail('gcnumminors', 'Minor GCs', timings.minor_gcs)}
                {_markerDetail('gcnumslices', 'Slices', timings.slices)}
                {_markerDetail(
                  'gcnumzones',
                  'Zones',
                  _formatValueTotal(
                    timings.zones_collected,
                    timings.total_zones,
                    String
                  )
                )}
                {_markerDetail(
                  'gcnumcompartments',
                  'Compartments',
                  timings.total_compartments
                )}
              </div>
            );
          }
          default:
            return null;
        }
      }
      case 'GCSlice': {
        const timings = data.timings;
        let triggers;
        if (timings.trigger_amount && timings.trigger_threshold) {
          triggers = _markerDetail(
            'gctrigger',
            'Trigger (amt/trig)',
            _formatValueTotal(
              timings.trigger_amount,
              timings.trigger_threshold,
              _formatBytes,
              false
            )
          );
        }
        return (
          <div className="tooltipDetails">
            {_markerDetail('gcreason', 'Reason', timings.reason)}
            {_markerDetail('gcbudget', 'Budget', timings.budget)}
            {_markerDetail(
              'gcstate',
              'States',
              timings.initial_state + ' – ' + timings.final_state
            )}
            {triggers}
            {_markerDetail('gcfaults', 'Page faults', timings.page_faults)}
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
              {formatNumber(marker.dur)}ms
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
