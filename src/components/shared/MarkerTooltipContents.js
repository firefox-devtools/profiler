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
  formatMicroseconds,
  formatMilliseconds,
  formatValueTotal,
} from '../../utils/format-numbers';
import explicitConnect from '../../utils/connect';
import { selectorsForThread } from '../../reducers/profile-view';
import { getImplementationFilter } from '../../reducers/url-state';

import Backtrace from './Backtrace';

import { bailoutTypeInformation } from '../../profile-logic/marker-info';
import type { TracingMarker } from '../../types/profile-derived';
import type { NotVoidOrNull } from '../../types/utils';
import type { ImplementationFilter } from '../../types/actions';
import type { Thread, ThreadIndex } from '../../types/profile';
import type {
  PaintProfilerMarkerTracing,
  StyleMarkerPayload,
} from '../../types/markers';
import type {
  ExplicitConnectOptions,
  ConnectedProps,
} from '../../utils/connect';

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

function _markerBacktrace(
  marker: TracingMarker,
  data: StyleMarkerPayload | PaintProfilerMarkerTracing,
  thread: Thread,
  implementationFilter: ImplementationFilter
): React.Node {
  if ('cause' in data && data.cause) {
    const { cause } = data;
    const causeAge = marker.start - cause.time;
    return (
      <div className="tooltipDetailsBackTrace" key="backtrace">
        <h2 className="tooltipBackTraceTitle">
          First invalidated {formatNumber(causeAge)}ms before the flush, at:
        </h2>
        <Backtrace
          cause={cause}
          thread={thread}
          implementationFilter={implementationFilter}
        />
      </div>
    );
  }
  return null;
}

function getMarkerDetails(
  marker: TracingMarker,
  thread: Thread,
  implementationFilter: ImplementationFilter
): React.Node {
  const data = marker.data;
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
        const latency =
          data.timeStamp === undefined
            ? null
            : formatMilliseconds(data.startTime - data.timeStamp);
        return (
          <div className="tooltipDetails">
            {_markerDetail('type', 'Type', data.eventType)}
            {latency === null
              ? null
              : _markerDetail('latency', 'Latency', latency)}
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
                  {nursery.cur_capacity === undefined
                    ? null
                    : _markerDetail(
                        'gcnurseryusage',
                        'Bytes used',
                        formatValueTotal(
                          nursery.bytes_used,
                          nursery.cur_capacity,
                          formatBytes
                        )
                      )}
                  {nursery.new_capacity === undefined
                    ? null
                    : _markerDetail(
                        'gcnewnurserysize',
                        'New nursery size',
                        nursery.new_capacity,
                        formatBytes
                      )}
                  {nursery.lazy_capacity === undefined
                    ? null
                    : _markerDetail(
                        'gclazynurserysize',
                        'Lazy-allocated size',
                        nursery.lazy_capacity,
                        formatBytes
                      )}
                  {nursery.chunk_alloc_us === undefined
                    ? null
                    : _markerDetail(
                        'gctimeinchunkalloc',
                        'Time spent allocating chunks in mutator',
                        nursery.chunk_alloc_us,
                        formatMicroseconds
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
            let nonIncrementalReason;
            if (
              timings.nonincremental_reason &&
              timings.nonincremental_reason !== 'None'
            ) {
              nonIncrementalReason = _markerDetail(
                'gcnonincrementalreason',
                'Non-incremental reason',
                timings.nonincremental_reason
              );
            }
            return (
              <div className="tooltipDetails">
                {_markerDetail('gcreason', 'Reason', timings.reason)}
                {nonIncrementalReason}
                {_markerDetail(
                  'gctime',
                  'Total slice times',
                  timings.total_time,
                  x =>
                    formatMilliseconds(
                      x,
                      /* significantDigits */ 3,
                      /* maxFractionalDigits */ 2
                    )
                )}
                {_markerDetail(
                  'gcmaxpause',
                  'Max Pause',
                  timings.max_pause,
                  x =>
                    formatMilliseconds(
                      x,
                      /* significantDigits */ 3,
                      /* maxFractionalDigits */ 2
                    )
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
            {timings.page_faults === undefined
              ? null
              : _markerDetail('gcfaults', 'Page faults', timings.page_faults)}
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
      case 'Styles': {
        return [
          <div className="tooltipDetails" key="details">
            {_markerDetail(
              'elementsTraversed',
              'Elements traversed',
              data.elementsTraversed
            )}
            {_markerDetail(
              'elementsStyled',
              'Elements styled',
              data.elementsStyled
            )}
            {_markerDetail(
              'elementsMatched',
              'Elements matched',
              data.elementsMatched
            )}
            {_markerDetail('stylesShared', 'Styles shared', data.stylesShared)}
            {_markerDetail('stylesReused', 'Styles reused', data.stylesReused)}
          </div>,
          _markerBacktrace(marker, data, thread, implementationFilter),
        ];
      }
      case 'tracing': {
        return _markerBacktrace(marker, data, thread, implementationFilter);
      }
      default:
    }
  }
  return null;
}

type OwnProps = {|
  +marker: TracingMarker,
  +threadIndex: ThreadIndex,
  +className?: string,
|};

type StateProps = {|
  +threadName?: string,
  +thread: Thread,
  +implementationFilter: ImplementationFilter,
|};

type Props = ConnectedProps<OwnProps, StateProps, {||}>;

class MarkerTooltipContents extends React.PureComponent<Props> {
  render() {
    const {
      marker,
      className,
      threadName,
      thread,
      implementationFilter,
    } = this.props;
    const details = getMarkerDetails(marker, thread, implementationFilter);

    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className={classNames({ tooltipHeader: details })}>
          <div className="tooltipOneLine">
            <div className="tooltipTiming">
              {/* tracing markers with no start have a negative start, while the
                ones with no end have an infinite duration */}
              {Number.isFinite(marker.dur) && marker.start >= 0
                ? formatNumber(marker.dur) + 'ms'
                : 'unknown duration'}
            </div>
            <div className="tooltipTitle">{marker.title || marker.name}</div>
          </div>
          {threadName ? (
            <div className="tooltipDetails">
              <div className="tooltipLabel">Thread:</div>
              {threadName}
            </div>
          ) : null}
        </div>
        {details}
      </div>
    );
  }
}

const options: ExplicitConnectOptions<OwnProps, StateProps, {||}> = {
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = selectorsForThread(threadIndex);
    const threadName = selectors.getFriendlyThreadName(state);
    const thread = selectors.getThread(state);
    const implementationFilter = getImplementationFilter(state);
    return {
      threadName,
      thread,
      implementationFilter,
    };
  },
  component: MarkerTooltipContents,
};

export default explicitConnect(options);
