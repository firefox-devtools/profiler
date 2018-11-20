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
  formatSI,
  formatMicroseconds,
  formatMilliseconds,
  formatValueTotal,
} from '../../utils/format-numbers';
import explicitConnect from '../../utils/connect';
import { selectorsForThread } from '../../reducers/profile-view';
import { getImplementationFilter } from '../../reducers/url-state';

import Backtrace from './Backtrace';

import { bailoutTypeInformation } from '../../profile-logic/marker-info';
import type { Microseconds } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';
import type { NotVoidOrNull } from '../../types/utils';
import type { ImplementationFilter } from '../../types/actions';
import type { Thread, ThreadIndex } from '../../types/profile';
import type {
  DOMEventMarkerPayload,
  FrameConstructionMarkerPayload,
  PaintProfilerMarkerTracing,
  PhaseTimes,
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
    <div className="tooltipLabel" key={key}>
      {label}:
    </div>,
    fn(value),
  ];
}

function _markerDetailNullable<T: NotVoidOrNull>(
  key: string,
  label: string,
  value: T | void | null,
  fn: T => string = String
): React.Node {
  if (value === undefined || value === null || fn(value).length === 0) {
    return null;
  }
  return _markerDetail(key, label, value, fn);
}

function _markerDetailBytesNullable(
  key: string,
  label: string,
  value: ?number
): React.Node {
  if (typeof value !== 'number') {
    return null;
  }
  return _markerDetail(key, label, formatBytes(value));
}

function _markerDetailDeltaTimeNullable(
  key: string,
  label: string,
  value1?: number,
  value2?: number
): React.Node {
  if (
    value1 === undefined ||
    value2 === undefined ||
    value1 === null ||
    value2 === null
  ) {
    return null;
  }
  const valueResult = value1 - value2;
  return _markerDetail(key, label, formatMilliseconds(valueResult));
}

type PhaseTimeTuple = {| name: string, time: Microseconds |};

function _markerDetailPhase(p: PhaseTimeTuple): React.Node {
  return _markerDetail(
    'gcphase' + p.name,
    'Phase ' + p.name,
    p.time,
    t => formatNumber(t / 1000) + 'ms'
  );
}

function _makePhaseTimesArray(
  phases: PhaseTimes<Microseconds>
): Array<PhaseTimeTuple> {
  const array = [];
  for (const phase in phases) {
    /*
     * The "Total" entry is the total of all phases, it's not needed because
     * the total time is displayed on the marker tooltip (and available in
     * the marker data) directly.
     */
    if (phase !== 'Total') {
      array.push({ name: phase, time: phases[phase] });
    }
  }
  return array;
}

function _makePriorityHumanReadable(
  key: string,
  label: string,
  priority: number
): React.Node {
  if (typeof priority !== 'number') {
    return null;
  }

  let prioLabel: string = '';

  // https://searchfox.org/mozilla-central/source/xpcom/threads/nsISupportsPriority.idl#24-28
  if (priority < -10) {
    prioLabel = 'Highest';
  } else if (priority >= -10 && priority < 0) {
    prioLabel = 'High';
  } else if (priority === 0) {
    prioLabel = 'Normal';
  } else if (priority <= 10 && priority > 0) {
    prioLabel = 'Low';
  } else if (priority > 10) {
    prioLabel = 'Lowest';
  }

  if (!prioLabel) {
    return null;
  }

  prioLabel = prioLabel + '(' + priority + ')';
  return _markerDetail(key, label, prioLabel);
}

function _dataStatusReplace(str: string): string {
  switch (str) {
    case 'STATUS_START': {
      return 'Start of request';
    }
    case 'STATUS_READ': {
      return 'Reading request';
    }
    case 'STATUS_STOP': {
      return 'End of request';
    }
    case 'STATUS_REDIRECT': {
      return 'Redirecting request';
    }
    default: {
      return 'other';
    }
  }
}

/*
 * Return true if the phase 'phaseName' is a leaf phase among the whole
 * array of phases.
 *
 * A leaf phase is a phase with no sub-phases.
 *
 * If the following are phases:
 * marking.mark_roots
 * marking.mark_heap
 * marking.mark_heap.a
 * sweeping.sweep
 *
 * Then marking.mark_roots, marking.mark_heap.a, sweeping.sweep are the only
 * leaves.  We select these since they will give the person looking at the
 * profile the best clue about which (sub-)phases are taking the longest.
 * For example, it isn't useful to say "sweeping took 200ms" but it is
 * useful to say "sweeping.compacting took 20ms" (if compacting has no
 * sub-phases.
 *
 * We find leaf phases by constructing a tree of phase times and then
 * reading its leaves.
 */

type PhaseTreeNode = {|
  value?: PhaseTimeTuple,
  branches: Map<string, PhaseTreeNode>,
|};

function _treeInsert(
  tree: Map<string, PhaseTreeNode>,
  path: Array<string>,
  phase: PhaseTimeTuple
) {
  const component = path.shift();
  if (component === undefined) {
    // This path is not a leaf, it can be ignored.
    return;
  }

  let node = tree.get(component);
  if (!node) {
    // Make a new node and grow the tree in this direction.
    node = { branches: new Map() };

    tree.set(component, node);
  }

  if (path.length > 0) {
    // There are more path components.  This node should be a branch if it
    // isn't one already.
    if (node.value) {
      // We delete the value to change this node from a leaf to a branch.
      delete node.value;
    }
    _treeInsert(node.branches, path, phase);
  } else {
    // Make the new node leaf node.
    if (node.value) {
      console.error(
        'Duplicate phases in _treeInsert in MarkerTooltipContents.js'
      );
      return;
    }
    node.value = phase;
  }
}

function _treeGetLeaves(
  tree: Map<string, PhaseTreeNode>
): Array<PhaseTimeTuple> {
  const leaves = [];
  for (const node of tree.values()) {
    if (node.value) {
      leaves.push(node.value);
    } else {
      leaves.push(..._treeGetLeaves(node.branches));
    }
  }
  return leaves;
}

function _filterInterestingPhaseTimes(
  rawPhases: PhaseTimes<Microseconds>,
  numSelect: number
): Array<PhaseTimeTuple> {
  let phaseTimes = _makePhaseTimesArray(rawPhases);

  /*
   * Select only the leaf phases.
   */
  const tree = new Map();
  for (const phase of phaseTimes) {
    const components = phase.name.split('.');
    _treeInsert(tree, components, phase);
  }
  phaseTimes = _treeGetLeaves(tree);

  /*
   * Of those N leaf phases, select the M most interesting phases by
   * determining the threshold we want to stop including phases at.
   *
   * Calculate the threshold by sorting the list of times in asscending
   * order, then slicing off all the low items and looking at the first
   * item.
   */
  const sortedPhaseTimes = phaseTimes
    .map(pt => pt.time)
    // Descending order
    .sort((a, b) => b - a);
  const threshold = sortedPhaseTimes[numSelect];

  /*
   * And then filtering the original list, which is in execution order which
   * we'd like to preserve, using the threshold.
   */
  return phaseTimes.filter(pt => pt.time > threshold);
}

function _sumMaybeEntries(
  entries: PhaseTimes<Microseconds>,
  selectEntries: Array<string>
): Microseconds {
  return selectEntries
    .map(name => (entries[name] ? entries[name] : 0))
    .reduce((a, x) => a + x, 0);
}

function _markerBacktrace(
  marker: TracingMarker,
  data:
    | StyleMarkerPayload
    | PaintProfilerMarkerTracing
    | DOMEventMarkerPayload
    | FrameConstructionMarkerPayload,
  thread: Thread,
  implementationFilter: ImplementationFilter
): React.Node {
  switch (data.category) {
    case 'DOMEvent': {
      const latency =
        data.timeStamp === undefined
          ? null
          : formatMilliseconds(marker.start - data.timeStamp);
      return (
        <div className="tooltipDetails">
          {_markerDetail('type', 'Type', data.eventType)}
          {latency === null
            ? null
            : _markerDetail('latency', 'Latency', latency)}
        </div>
      );
    }
    case 'Frame Construction':
      return (
        <div className="tooltipDetails">
          {_markerDetail('category', 'Category', data.category)}
        </div>
      );
    default:
      break;
  }
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
      case 'GCMinor': {
        if (data.nursery) {
          const nursery = data.nursery;
          switch (nursery.status) {
            case 'complete': {
              // Don't bother adding up the eviction time without the
              // CollectToFP phase since that's the main phase.  If it's
              // missing then there's something wrong with the profile and
              // we'd only get bogus data.  All these times are in
              // Milliseconds
              const evictTimeMS = nursery.phase_times.CollectToFP
                ? _sumMaybeEntries(nursery.phase_times, [
                    'TraceValues',
                    'TraceCells',
                    'TraceSlots',
                    'TraceWholeCells',
                    'TraceGenericEntries',
                    'MarkRuntime',
                    'MarkDebugger',
                    'CollectToFP',
                  ])
                : undefined;
              return (
                <div className="tooltipDetails">
                  {_markerDetail('gcreason', 'Reason', nursery.reason)}
                  {_markerDetail(
                    'gcpromotion',
                    'Bytes evicted',
                    formatValueTotal(
                      nursery.bytes_tenured,
                      nursery.bytes_used,
                      formatBytes
                    )
                  )}
                  {nursery.cells_tenured && nursery.cells_allocated_nursery
                    ? _markerDetail(
                        'gcpromotioncells',
                        'Cells evicted',
                        formatValueTotal(
                          nursery.cells_tenured,
                          nursery.cells_allocated_nursery,
                          formatSI
                        )
                      )
                    : null}
                  {nursery.cur_capacity
                    ? _markerDetail(
                        'gcnurseryusage',
                        'Bytes used',
                        formatValueTotal(
                          nursery.bytes_used,
                          nursery.cur_capacity,
                          formatBytes
                        )
                      )
                    : null}
                  {nursery.new_capacity
                    ? _markerDetail(
                        'gcnewnurserysize',
                        'New nursery size',
                        nursery.new_capacity,
                        formatBytes
                      )
                    : null}
                  {nursery.lazy_capacity
                    ? _markerDetail(
                        'gclazynurserysize',
                        'Lazy-allocated size',
                        nursery.lazy_capacity,
                        formatBytes
                      )
                    : null}
                  {nursery.cells_allocated_nursery &&
                  nursery.cells_allocated_tenured
                    ? _markerDetail(
                        'gcnursaryallocations',
                        'Nursery allocations since last minor GC',
                        formatValueTotal(
                          nursery.cells_allocated_nursery,
                          nursery.cells_allocated_nursery +
                            nursery.cells_allocated_tenured,
                          formatSI
                        )
                      )
                    : null}
                  {evictTimeMS
                    ? _markerDetail(
                        'gctenurerate',
                        'Tenuring allocation rate',
                        // evictTimeMS is in milliseconds.
                        nursery.bytes_tenured / (evictTimeMS / 1000000),
                        x => formatBytes(x) + '/s'
                      )
                    : null}
                  {evictTimeMS && nursery.cells_tenured
                    ? _markerDetail(
                        'gctenurereatecells',
                        'Tenuring allocation rate',
                        nursery.cells_tenured / (evictTimeMS / 10000000),
                        x => formatSI(x) + '/s'
                      )
                    : null}
                  {nursery.chunk_alloc_us
                    ? _markerDetail(
                        'gctimeinchunkalloc',
                        'Time spent allocating chunks in mutator',
                        nursery.chunk_alloc_us,
                        formatMicroseconds
                      )
                    : null}
                  {nursery.groups_pretenured
                    ? _markerDetail(
                        'gcpretenured',
                        'Number of groups to pretenure',
                        nursery.groups_pretenured,
                        x => formatNumber(x, 2, 0)
                      )
                    : null}
                  {_makePhaseTimesArray(nursery.phase_times)
                    /*
                     * Nursery collection should usually be very quick.  1ms
                     * is good and beyond 5ms and we could cause some
                     * animation to drop frames.  250us is about where
                     * things start to get interesting for a phase of a
                     * nursery collection.
                     */
                    .filter(pt => pt.time > 250) // 250us
                    .map(_markerDetailPhase)}
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
            const phase_times = _filterInterestingPhaseTimes(
              timings.phase_times,
              6
            );
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
                {phase_times.map(_markerDetailPhase)}
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
        const phase_times = _filterInterestingPhaseTimes(
          timings.phase_times,
          6
        );
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
            {timings.page_faults
              ? _markerDetail('gcfaults', 'Page faults', timings.page_faults)
              : null}
            {phase_times.map(_markerDetailPhase)}
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
            {_markerDetailNullable('url', 'URL', data.url)}
            {_markerDetail('line', 'Line', data.line)}
          </div>
        );
      }
      case 'Network': {
        if (
          data.status !== 'STATUS_STOP' &&
          data.status !== 'STATUS_REDIRECT'
        ) {
          return (
            <div className="tooltipDetails">
              {_markerDetail(
                'status',
                'Status',
                _dataStatusReplace(data.status)
              )}
              {_markerDetailNullable('url', 'URL', data.URI)}
              {_makePriorityHumanReadable('pri', 'Priority', data.pri)}
              {_markerDetailBytesNullable(
                'count',
                'Requested bytes',
                data.count
              )}
            </div>
          );
        }
        return (
          <div className="tooltipDetails">
            {_markerDetail('status', 'Status', _dataStatusReplace(data.status))}
            {_markerDetailNullable('url', 'URL', data.URI)}
            {_markerDetailNullable(
              'redirect_url',
              'Redirect URL',
              data.RedirectURI
            )}
            {_makePriorityHumanReadable('pri', 'Priority', data.pri)}
            {_markerDetailBytesNullable('count', 'Requested bytes', data.count)}
            {_markerDetailDeltaTimeNullable(
              'domainLookup',
              'Domain lookup in total',
              data.domainLookupEnd,
              data.domainLookupStart
            )}
            {_markerDetailDeltaTimeNullable(
              'connect',
              'Connection in total',
              data.connectEnd,
              data.connectStart
            )}
            {_markerDetailDeltaTimeNullable(
              'tcpConnect',
              'TCP connection in total',
              data.tcpConnectEnd,
              data.connectStart
            )}
            {_markerDetailDeltaTimeNullable(
              'secureConnectionStart',
              'Start of secure connection at',
              data.secureConnectionStart,
              data.tcpConnectEnd
            )}
            {_markerDetailDeltaTimeNullable(
              'requestStart',
              'Start of request at',
              data.requestStart,
              data.connectStart
            )}
            {_markerDetailDeltaTimeNullable(
              'response',
              'Response time',
              data.responseEnd,
              data.responseStart
            )}
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
