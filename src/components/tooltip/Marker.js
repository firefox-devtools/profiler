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
import { getThreadSelectors } from '../../selectors/per-thread';
import { getImplementationFilter } from '../../selectors/url-state';
import { getPageList, getZeroAt } from '../../selectors/profile';

import { TooltipNetworkMarker } from './NetworkMarker';
import { TooltipDetails, TooltipDetail } from './TooltipDetails';
import Backtrace from '../shared/Backtrace';

import { bailoutTypeInformation } from '../../profile-logic/marker-info';

import type { Milliseconds, Microseconds } from '../../types/units';
import type { Marker } from '../../types/profile-derived';
import type { ImplementationFilter } from '../../types/actions';
import type { Thread, ThreadIndex, PageList } from '../../types/profile';
import type { PhaseTimes } from '../../types/markers';
import type { ConnectedProps } from '../../utils/connect';

type PhaseTimeTuple = {| name: string, time: Microseconds |};

function _markerDetailPhase(p: PhaseTimeTuple): * {
  return (
    <TooltipDetail key={p.name} label={'Phase ' + p.name}>
      {formatMilliseconds(p.time / 1000)}
    </TooltipDetail>
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

const MaybeBacktrace = ({
  marker,
  thread,
  implementationFilter,
}: {|
  marker: Marker,
  thread: Thread,
  implementationFilter: ImplementationFilter,
|}): React.Node => {
  const { data, start } = marker;
  if (data && 'cause' in data && data.cause) {
    const { cause } = data;
    const causeAge = start - cause.time;
    return (
      <div className="tooltipDetailsBackTrace" key="backtrace">
        {data.type === 'Styles' || marker.name === 'Reflow' ? (
          <h2 className="tooltipBackTraceTitle">
            First invalidated {formatNumber(causeAge)}ms before the flush, at:
          </h2>
        ) : null}
        <Backtrace
          maxHeight="30em"
          stackIndex={cause.stack}
          thread={thread}
          implementationFilter={implementationFilter}
        />
      </div>
    );
  }
  return null;
};

function getMarkerDetails(
  marker: Marker,
  thread: Thread,
  implementationFilter: ImplementationFilter,
  zeroAt: Milliseconds
): React.Node {
  const data = marker.data;
  let tooltipDetails;

  if (data) {
    switch (data.type) {
      case 'FileIO': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Operation">{data.operation}</TooltipDetail>
            <TooltipDetail label="Source">{data.source}</TooltipDetail>
            <TooltipDetail label="Filename">{data.filename}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'UserTiming': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Name">{data.name}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'Text': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Name">{data.name}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'Log': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Module">{data.module}</TooltipDetail>
            <TooltipDetail label="Name">{data.name}</TooltipDetail>
          </TooltipDetails>
        );
        break;
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
              tooltipDetails = (
                <TooltipDetails>
                  <TooltipDetail label="Reason">{nursery.reason}</TooltipDetail>
                  <TooltipDetail label="Bytes evicted">
                    {formatValueTotal(
                      nursery.bytes_tenured,
                      nursery.bytes_used,
                      formatBytes
                    )}
                  </TooltipDetail>
                  {nursery.cells_tenured && nursery.cells_allocated_nursery ? (
                    <TooltipDetail label="Cells evicted">
                      {formatValueTotal(
                        nursery.cells_tenured,
                        nursery.cells_allocated_nursery,
                        formatSI
                      )}
                    </TooltipDetail>
                  ) : null}
                  {nursery.cur_capacity ? (
                    <TooltipDetail label="Bytes used">
                      {formatValueTotal(
                        nursery.bytes_used,
                        nursery.cur_capacity,
                        formatBytes
                      )}
                    </TooltipDetail>
                  ) : null}
                  {nursery.new_capacity ? (
                    <TooltipDetail label="New nursery size">
                      {formatBytes(nursery.new_capacity)}
                    </TooltipDetail>
                  ) : null}
                  {nursery.lazy_capacity ? (
                    <TooltipDetail label="Lazy-allocated size">
                      {formatBytes(nursery.lazy_capacity)}
                    </TooltipDetail>
                  ) : null}
                  {nursery.cells_allocated_nursery &&
                  nursery.cells_allocated_tenured ? (
                    <TooltipDetail label="Nursery allocations since last minor GC">
                      {formatValueTotal(
                        nursery.cells_allocated_nursery,
                        nursery.cells_allocated_nursery +
                          nursery.cells_allocated_tenured,
                        formatSI
                      )}
                    </TooltipDetail>
                  ) : null}
                  {evictTimeMS ? (
                    <TooltipDetail label="Tenuring allocation rate">
                      {formatBytes(
                        // evictTimeMS is in milliseconds.
                        nursery.bytes_tenured / (evictTimeMS / 1000000)
                      ) + '/s'}
                    </TooltipDetail>
                  ) : null}
                  {evictTimeMS && nursery.cells_tenured ? (
                    <TooltipDetail label="Tenuring allocation rate">
                      {formatSI(
                        nursery.cells_tenured / (evictTimeMS / 10000000)
                      ) + '/s'}
                    </TooltipDetail>
                  ) : null}
                  {nursery.chunk_alloc_us ? (
                    <TooltipDetail label="Time spent allocating chunks in mutator">
                      {formatMicroseconds(nursery.chunk_alloc_us)}
                    </TooltipDetail>
                  ) : null}
                  {nursery.groups_pretenured ? (
                    <TooltipDetail label="Number of groups to pretenure">
                      {formatNumber(nursery.groups_pretenured, 2, 0)}
                    </TooltipDetail>
                  ) : null}
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
                </TooltipDetails>
              );
              break;
            }
            case 'nursery disabled':
              tooltipDetails = (
                <TooltipDetails>
                  <TooltipDetail label="Status">Nursery disabled</TooltipDetail>
                </TooltipDetails>
              );
              break;
            case 'nursery empty':
              tooltipDetails = (
                <TooltipDetails>
                  <TooltipDetail label="Status">Nursery empty</TooltipDetail>
                </TooltipDetails>
              );
              break;
            default:
              return null;
          }
        } else {
          return null;
        }
        break;
      }
      case 'GCMajor': {
        const timings = data.timings;
        switch (timings.status) {
          case 'aborted':
            tooltipDetails = (
              <TooltipDetails>
                <TooltipDetail label="Status">Aborted (OOM)</TooltipDetail>
              </TooltipDetails>
            );
            break;
          case 'completed': {
            let nonIncrementalReason = null;
            if (
              timings.nonincremental_reason &&
              timings.nonincremental_reason !== 'None'
            ) {
              nonIncrementalReason = (
                <TooltipDetail label="Non-incremental reason">
                  {timings.nonincremental_reason}
                </TooltipDetail>
              );
            }
            const phase_times = _filterInterestingPhaseTimes(
              timings.phase_times,
              6
            );
            let gcsize;
            const post_heap_size = timings.post_heap_size;
            if (post_heap_size !== undefined) {
              gcsize = (
                <TooltipDetail label="Heap size (pre - post)">
                  {formatBytes(timings.allocated_bytes) +
                    ' - ' +
                    formatBytes(post_heap_size)}
                </TooltipDetail>
              );
            } else {
              gcsize = (
                <TooltipDetail label="Heap size (pre)">
                  {formatBytes(timings.allocated_bytes)}
                </TooltipDetail>
              );
            }
            tooltipDetails = (
              <TooltipDetails>
                <TooltipDetail label="Reason">{timings.reason}</TooltipDetail>
                {nonIncrementalReason}
                <TooltipDetail label="Total slice times">
                  {formatMilliseconds(
                    timings.total_time,
                    /* significantDigits */ 3,
                    /* maxFractionalDigits */ 2
                  )}
                </TooltipDetail>
                <TooltipDetail label="Max Pause">
                  {formatMilliseconds(
                    timings.max_pause,
                    /* significantDigits */ 3,
                    /* maxFractionalDigits */ 2
                  )}
                </TooltipDetail>
                {gcsize}
                <TooltipDetail label="MMU 20ms">
                  {formatPercent(timings.mmu_20ms)}
                </TooltipDetail>
                <TooltipDetail label="MMU 50ms">
                  {formatPercent(timings.mmu_50ms)}
                </TooltipDetail>
                <TooltipDetail label="Minor GCs">
                  {timings.minor_gcs}
                </TooltipDetail>
                <TooltipDetail label="Slices">{timings.slices}</TooltipDetail>
                <TooltipDetail label="Zones">
                  {formatValueTotal(
                    timings.zones_collected,
                    timings.total_zones,
                    String
                  )}
                </TooltipDetail>
                <TooltipDetail label="Compartments">
                  {timings.total_compartments}
                </TooltipDetail>
                {phase_times.map(_markerDetailPhase)}
              </TooltipDetails>
            );
            break;
          }
          default:
            return null;
        }
        break;
      }
      case 'GCSlice': {
        const timings = data.timings;
        let triggers = null;
        if (timings.trigger_amount && timings.trigger_threshold) {
          triggers = (
            <TooltipDetail label="Trigger (amt/trig)">
              {formatValueTotal(
                timings.trigger_amount,
                timings.trigger_threshold,
                formatBytes,
                false /* includePercent */
              )}
            </TooltipDetail>
          );
        }
        const phase_times = _filterInterestingPhaseTimes(
          timings.phase_times,
          6
        );
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Reason">{timings.reason}</TooltipDetail>
            <TooltipDetail label="Budget">{timings.budget}</TooltipDetail>
            <TooltipDetail label="States (pre - post)">
              {timings.initial_state + ' – ' + timings.final_state}
            </TooltipDetail>
            {triggers}
            <TooltipDetail label="Page faults">
              {timings.page_faults}
            </TooltipDetail>
            {phase_times.map(_markerDetailPhase)}
          </TooltipDetails>
        );
        break;
      }
      case 'Bailout': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Type">{data.bailoutType}</TooltipDetail>
            <TooltipDetail label="Where">{data.where}</TooltipDetail>
            <TooltipDetail label="Script">{data.script}</TooltipDetail>
            <TooltipDetail label="Function Line">
              {data.functionLine}
            </TooltipDetail>
            <TooltipDetail label="Bailout Line">
              {data.bailoutLine}
            </TooltipDetail>
            <TooltipDetail label="Description">
              <div style={{ maxWidth: '300px' }}>
                {bailoutTypeInformation['Bailout_' + data.bailoutType]}
              </div>
            </TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'PreferenceRead': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Name">{data.prefName}</TooltipDetail>
            <TooltipDetail label="Kind">{data.prefKind}</TooltipDetail>
            <TooltipDetail label="Type">{data.prefType}</TooltipDetail>
            <TooltipDetail label="Value">{data.prefValue}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'Invalidation': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="URL">{data.url}</TooltipDetail>
            <TooltipDetail label="Line">{data.line}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'Network': {
        tooltipDetails = (
          <TooltipNetworkMarker payload={data} zeroAt={zeroAt} />
        );
        break;
      }
      case 'Styles': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Elements traversed">
              {data.elementsTraversed}
            </TooltipDetail>
            <TooltipDetail label="Elements styled">
              {data.elementsStyled}
            </TooltipDetail>
            <TooltipDetail label="Elements matched">
              {data.elementsMatched}
            </TooltipDetail>
            <TooltipDetail label="Styles shared">
              {data.stylesShared}
            </TooltipDetail>
            <TooltipDetail label="Styles reused">
              {data.stylesReused}
            </TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'tracing': {
        switch (data.category) {
          case 'DOMEvent': {
            const latency =
              data.timeStamp === undefined
                ? null
                : formatMilliseconds(marker.start - data.timeStamp);
            tooltipDetails = (
              <TooltipDetails>
                <TooltipDetail label="Type">{data.eventType}</TooltipDetail>
                <TooltipDetail label="Latency">{latency}</TooltipDetail>
              </TooltipDetails>
            );
            break;
          }
          case 'Frame Construction':
            tooltipDetails = (
              <TooltipDetails>
                <TooltipDetail label="Category">{data.category}</TooltipDetail>
              </TooltipDetails>
            );
            break;
          default:
            break;
        }
        break;
      }
      case 'IPC': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Type">{data.messageType}</TooltipDetail>
            <TooltipDetail label="Sync">{data.sync.toString()}</TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      case 'MediaSample': {
        tooltipDetails = (
          <TooltipDetails>
            <TooltipDetail label="Sample start time">
              {formatMicroseconds(data.sampleStartTimeUs)}
            </TooltipDetail>
            <TooltipDetail label="Sample end time">
              {formatMicroseconds(data.sampleEndTimeUs)}
            </TooltipDetail>
          </TooltipDetails>
        );
        break;
      }
      default:
        return null;
    }
  }

  // If there are no details or backtrace to print, we should return null
  // instead of an empty Fragment.
  if (!tooltipDetails && (!data || !data.cause)) {
    return null;
  }

  return (
    <>
      {tooltipDetails}
      <MaybeBacktrace
        marker={marker}
        thread={thread}
        implementationFilter={implementationFilter}
      />
    </>
  );
}

type OwnProps = {|
  +marker: Marker,
  +threadIndex: ThreadIndex,
  +className?: string,
|};

type StateProps = {|
  +threadName?: string,
  +thread: Thread,
  +implementationFilter: ImplementationFilter,
  +pages: PageList | null,
  +zeroAt: Milliseconds,
|};

type Props = ConnectedProps<OwnProps, StateProps, {||}>;

class MarkerTooltipContents extends React.PureComponent<Props> {
  _getUrl = (marker: Marker): string | null => {
    const { pages } = this.props;

    if (!(pages && marker.data && marker.data.innerWindowID)) {
      return null;
    }

    const innerWindowID = marker.data.innerWindowID;
    const page = pages.find(page => page.innerWindowID === innerWindowID);
    return page ? page.url : null;
  };

  render() {
    const {
      marker,
      className,
      threadName,
      thread,
      implementationFilter,
      zeroAt,
    } = this.props;

    const url = this._getUrl(marker);
    const details = getMarkerDetails(
      marker,
      thread,
      implementationFilter,
      zeroAt
    );
    return (
      <div className={classNames('tooltipMarker', className)}>
        <div className={classNames({ tooltipHeader: details })}>
          <div className="tooltipOneLine">
            <div className="tooltipTiming">
              {/* we don't know the duration if the marker is incomplete */}
              {!marker.incomplete
                ? marker.dur
                  ? formatMilliseconds(marker.dur)
                  : '—'
                : 'unknown duration'}
            </div>
            <div className="tooltipTitle">{marker.title || marker.name}</div>
          </div>
          {threadName || url ? (
            <TooltipDetails>
              <TooltipDetail label="Thread">{threadName}</TooltipDetail>
              <TooltipDetail label="URL">{url}</TooltipDetail>
            </TooltipDetails>
          ) : null}
        </div>
        {details}
      </div>
    );
  }
}

export const TooltipMarker = explicitConnect<OwnProps, StateProps, {||}>({
  mapStateToProps: (state, props) => {
    const { threadIndex } = props;
    const selectors = getThreadSelectors(threadIndex);
    const threadName = selectors.getFriendlyThreadName(state);
    const thread = selectors.getThread(state);
    const implementationFilter = getImplementationFilter(state);
    const pages = getPageList(state);
    const zeroAt = getZeroAt(state);
    return {
      threadName,
      thread,
      implementationFilter,
      pages,
      zeroAt,
    };
  },
  component: MarkerTooltipContents,
});
