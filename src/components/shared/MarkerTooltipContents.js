/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import classNames from 'classnames';
import {
  formatNumber,
  formatPercent,
  formatBytes,
  formatValueTotal,
} from '../../utils/format-numbers';
import { bailoutTypeInformation } from '../../profile-logic/marker-info';
import type { TracingMarker } from '../../types/profile-derived';
import type { MarkerPayload } from '../../types/markers';
import type { NotVoidOrNull } from '../../types/utils';

function _markerDetail<T: NotVoidOrNull>(
  key: string,
  label: string,
  value: T,
  fn: T => string = String
): React.Node {
  return [
    <div className="tooltipLabel" key="{key}">
      {label}:
    </div>,
    fn(value),
  ];
}

function getMarkerDetails(data: MarkerPayload): React.Element<any> | null {
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
                    formatValueTotal(
                      nursery.bytes_tenured,
                      nursery.bytes_used,
                      formatBytes
                    )
                  )}
                  {nursery.cur_capacity &&
                    _markerDetail(
                      'gcnurseryusage',
                      'Bytes used',
                      formatValueTotal(
                        nursery.bytes_used,
                        nursery.cur_capacity,
                        formatBytes
                      )
                    )}
                  {_markerDetail(
                    'gcnewnurserysize',
                    'New nursery size',
                    nursery.new_capacity,
                    formatBytes
                  )}
                  {nursery.lazy_capacity &&
                    _markerDetail(
                      'gclazynurserysize',
                      'Lazy-allocated size',
                      nursery.lazy_capacity,
                      formatBytes
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
                  timings.allocated_bytes,
                  formatBytes
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
                  formatValueTotal(
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
            formatValueTotal(
              timings.trigger_amount,
              timings.trigger_threshold,
              formatBytes,
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
      case 'Bailout': {
        return (
          <div className="tooltipDetails">
            {_markerDetail('bailoutType', 'Type', data.bailoutType)}
            {_markerDetail('where', 'Where', data.where)}
            {_markerDetail('script', 'Script', data.script)}
            {_markerDetail('functionLine', 'Function Line', data.functionLine)}
            {_markerDetail('bailoutLine', 'Bailout Line', data.bailoutLine)}
            <div className="tooltipLabel">Description:</div>
            <div style={{ maxWidth: '300px' }}>
              {bailoutTypeInformation['Bailout_' + data.bailoutType]}
            </div>
          </div>
        );
      }
      case 'Invalidation': {
        return (
          <div className="tooltipDetails">
            {_markerDetail('url', 'URL', data.url)}
            {_markerDetail('line', 'Line', data.line)}
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

export default class MarkerTooltipContents extends React.PureComponent<Props> {
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
