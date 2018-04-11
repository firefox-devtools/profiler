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
import type { Microseconds } from '../../types/units';
import type { TracingMarker } from '../../types/profile-derived';
import type { NotVoidOrNull } from '../../types/utils';
import type { ImplementationFilter } from '../../types/actions';
import type { Thread, ThreadIndex } from '../../types/profile';
import type {
  DOMEventMarkerPayload,
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
  if (value === undefined || value === null) {
    return null;
  }
  return _markerDetail(key, label, value, fn);
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
  return _markerDetail(key, label, value1 - value2);
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
  } else {
    const node = tree.get(component);
    if (node) {
      if (node.value) {
        // Is a leaf
        if (path.length > 0) {
          // There are more path components, we need to convert this node
          // into a branch and keep going.  We delete the value to change
          // this node from a leaf to a branch.
          delete node.value;
        } else {
          // Duplicate leaves.
          throw new Error('Duplicate phases');
        }
      }
      _treeInsert(node.branches, path, phase);
    } else {
      if (path.length === 0) {
        const leafNode = { value: phase, branches: new Map() };
        tree.set(component, leafNode);
      } else {
        const branchNode = { branches: new Map() };
        tree.set(component, branchNode);
        _treeInsert(branchNode.branches, path, phase);
      }
    }
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

function _markerBacktrace(
  marker: TracingMarker,
  data: StyleMarkerPayload | PaintProfilerMarkerTracing | DOMEventMarkerPayload,
  thread: Thread,
  implementationFilter: ImplementationFilter
): React.Node {
  if (data.category === 'DOMEvent') {
    const latency =
      data.timeStamp === undefined
        ? null
        : formatMilliseconds(marker.start - data.timeStamp);
    return (
      <div className="tooltipDetails">
        {_markerDetail('type', 'Type', data.eventType)}
        {latency === null ? null : _markerDetail('latency', 'Latency', latency)}
      </div>
    );
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
            {timings.page_faults === undefined
              ? null
              : _markerDetail('gcfaults', 'Page faults', timings.page_faults)}
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
            {_markerDetail('url', 'URL', data.url)}
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
              {_markerDetailNullable('url', 'URL', data.URI)}
              {_markerDetail('pri', 'pri', data.pri)}
              {_markerDetailNullable('count', 'count', data.count)}
              {_markerDetail('status', 'Status', data.status)}
            </div>
          );
        } else {
          return (
            <div className="tooltipDetails">
              {_markerDetail('status', 'Status', data.status)}
              {_markerDetailNullable('url', 'URL', data.URI)}
              {_markerDetailNullable(
                'redirect_url',
                'Redirect URL',
                data.RedirectURI
              )}
              {_markerDetail('pri', 'pri', data.pri)}
              {_markerDetailNullable('count', 'count', data.count)}
              {_markerDetailDeltaTimeNullable(
                'domainLookup',
                'domainLookup',
                data.domainLookupEnd,
                data.domainLookupStart
              )}
              {_markerDetailDeltaTimeNullable(
                'tcpConnect',
                'tcpConnect',
                data.tcpConnectEnd,
                data.connectStart
              )}
              {_markerDetailNullable(
                'secureConnectionStart',
                'secureConnectionStart',
                data.secureConnectionStart
              )}
              {_markerDetailDeltaTimeNullable(
                'connect',
                'connect',
                data.connectEnd,
                data.connectStart
              )}
              {_markerDetailDeltaTimeNullable(
                'requestStart',
                'requestStart @',
                data.requestStart,
                data.startTime
              )}
              {_markerDetailDeltaTimeNullable(
                'response',
                'response',
                data.responseEnd,
                data.responseStart
              )}
            </div>
          );
        }
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
