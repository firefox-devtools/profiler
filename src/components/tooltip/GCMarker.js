/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import * as React from 'react';
import {
  formatPercent,
  formatBytes,
  formatSI,
  formatMicroseconds,
  formatMilliseconds,
  formatValueTotal,
} from 'firefox-profiler/utils/format-numbers';

import { TooltipDetail, type TooltipDetailComponent } from './TooltipDetails';

import type {
  Microseconds,
  PhaseTimes,
  GCMinorMarkerPayload,
  GCMajorMarkerPayload,
  GCSliceMarkerPayload,
} from 'firefox-profiler/types';

export function getGCMinorDetails(
  data: GCMinorMarkerPayload
): TooltipDetailComponent[] {
  const details = [];
  if (data.nursery) {
    const nursery = data.nursery;
    switch (nursery.status) {
      case 'complete': {
        // Don't bother adding up the eviction time without the
        // CollectToObjFP phase since that's the main phase.  If it's
        // missing then there's something wrong with the profile and
        // we'd only get bogus data.  All these times are in
        // Milliseconds
        const evictTimeMS = nursery.phase_times.CollectToObjFP
          ? _sumMaybeEntries(nursery.phase_times, [
              'TraceValues',
              'TraceCells',
              'TraceSlots',
              'TraceWholeCells',
              'TraceGenericEntries',
              'MarkRuntime',
              'MarkDebugger',
              'CollectToObjFP',
              'CollectToStrFP',
            ])
          : undefined;
        details.push(
          <TooltipDetail label="Reason" key="GCMinor-Reason">
            {nursery.reason}
          </TooltipDetail>,
          <TooltipDetail label="Bytes tenured" key="GCMinor-Bytes tenured">
            {formatValueTotal(
              nursery.bytes_tenured,
              nursery.bytes_used,
              formatBytes
            )}
          </TooltipDetail>
        );
        if (nursery.cells_tenured && nursery.cells_allocated_nursery) {
          details.push(
            <TooltipDetail label="Cells tenured" key="GCMinor-Cells tenured">
              {formatValueTotal(
                nursery.cells_tenured,
                nursery.cells_allocated_nursery,
                formatSI
              )}
            </TooltipDetail>
          );
        }
        if (nursery.cur_capacity) {
          details.push(
            <TooltipDetail label="Bytes used" key="GCMinor-Bytes used">
              {formatValueTotal(
                nursery.bytes_used,
                nursery.cur_capacity,
                formatBytes
              )}
            </TooltipDetail>
          );
        }
        if (nursery.new_capacity) {
          details.push(
            <TooltipDetail
              label="New nursery size"
              key="GCMinor-New nursery size"
            >
              {formatBytes(nursery.new_capacity)}
            </TooltipDetail>
          );
        }
        if (nursery.lazy_capacity) {
          details.push(
            <TooltipDetail
              label="Lazy-allocated size"
              key="GCMinor-Lazy-allocated size"
            >
              {formatBytes(nursery.lazy_capacity)}
            </TooltipDetail>
          );
        }
        if (
          nursery.cells_allocated_nursery &&
          nursery.cells_allocated_tenured
        ) {
          details.push(
            <TooltipDetail
              label="Nursery allocations since last minor GC"
              key="GCMinor-Nursery allocations since last minor GC"
            >
              {formatValueTotal(
                nursery.cells_allocated_nursery,
                nursery.cells_allocated_nursery +
                  nursery.cells_allocated_tenured,
                formatSI
              )}
            </TooltipDetail>
          );
        }
        if (evictTimeMS) {
          details.push(
            <TooltipDetail
              label="Tenuring allocation rate"
              key="GCMinor-bytes_tenured"
            >
              {formatBytes(
                // evictTimeMS is in milliseconds.
                nursery.bytes_tenured / (evictTimeMS / 1000000)
              ) + '/s'}
            </TooltipDetail>
          );
          if (nursery.cells_tenured) {
            details.push(
              <TooltipDetail
                label="Tenuring allocation rate"
                key="GCMinor-cells_tenured"
              >
                {formatSI(nursery.cells_tenured / (evictTimeMS / 10000000)) +
                  '/s'}
              </TooltipDetail>
            );
          }
          if (nursery.strings_tenured && nursery.strings_deduplicated) {
            details.push(
              <TooltipDetail
                label="Strings deduplicated when tenuring"
                key="GCMinor-strings_deduped"
              >
                {formatValueTotal(
                  nursery.strings_deduplicated,
                  nursery.strings_deduplicated + nursery.strings_tenured,
                  formatSI
                )}
              </TooltipDetail>
            );
          }
        }
        if (nursery.chunk_alloc_us) {
          details.push(
            <TooltipDetail
              label="Time spent allocating chunks in mutator"
              key="GCMinor-Time spent allocating chunks in mutator"
            >
              {formatMicroseconds(nursery.chunk_alloc_us)}
            </TooltipDetail>
          );
        }
        details.push(
          ..._makePhaseTimesArray(nursery.phase_times)
            /*
             * Nursery collection should usually be very quick.  1ms
             * is good and beyond 5ms and we could cause some
             * animation to drop frames.  250us is about where
             * things start to get interesting for a phase of a
             * nursery collection.
             */
            .filter((pt) => pt.time > 250) // 250us
            .map(_markerDetailPhase)
        );
        break;
      }
      case 'nursery disabled':
        details.push(
          <TooltipDetail label="Status" key="GCMinor-Status">
            Nursery disabled
          </TooltipDetail>
        );
        break;
      case 'nursery empty':
        details.push(
          <TooltipDetail label="Status" key="GCMinor-nursery empty">
            Nursery empty
          </TooltipDetail>
        );
        break;
      default:
      // Do nothing.
    }
  }
  return details;
}

export function getGCMajorDetails(
  data: GCMajorMarkerPayload
): TooltipDetailComponent[] {
  const details = [];
  const timings = data.timings;
  switch (timings.status) {
    case 'aborted':
      details.push(
        <TooltipDetail label="Status" key="GMajor-Status">
          Aborted (OOM)
        </TooltipDetail>
      );
      break;
    case 'completed': {
      let nonIncrementalReason = null;
      if (
        timings.nonincremental_reason &&
        timings.nonincremental_reason !== 'None'
      ) {
        nonIncrementalReason = (
          <TooltipDetail
            label="Non-incremental reason"
            key="GMajor-Non-incremental reason"
          >
            {timings.nonincremental_reason}
          </TooltipDetail>
        );
      }
      const phase_times = _filterInterestingPhaseTimes(timings.phase_times, 6);
      let gcsize;
      const post_heap_size = timings.post_heap_size;
      if (post_heap_size !== undefined) {
        gcsize = (
          <TooltipDetail
            label="GC heap size (pre - post)"
            key="GMajor-GC heap size (pre - post)"
          >
            {formatBytes(timings.allocated_bytes) +
              ' - ' +
              formatBytes(post_heap_size)}
          </TooltipDetail>
        );
      } else {
        gcsize = (
          <TooltipDetail
            label="GC heap size (pre)"
            key="GMajor-GC heap size (pre)"
          >
            {formatBytes(timings.allocated_bytes)}
          </TooltipDetail>
        );
      }
      details.push(
        nonIncrementalReason,
        <TooltipDetail label="Reason" key="GCMajor-reason">
          {timings.reason}
        </TooltipDetail>,
        <TooltipDetail label="Total slice times" key="GMajor-Total slice times">
          {formatMilliseconds(
            timings.total_time,
            /* significantDigits */ 3,
            /* maxFractionalDigits */ 2
          )}
        </TooltipDetail>,
        <TooltipDetail label="Max Pause" key="GMajor-Make Pause">
          {formatMilliseconds(
            timings.max_pause,
            /* significantDigits */ 3,
            /* maxFractionalDigits */ 2
          )}
        </TooltipDetail>,
        gcsize
      );
      const pre_malloc_heap_size = timings.pre_malloc_heap_size;
      const post_malloc_heap_size = timings.post_malloc_heap_size;
      if (
        pre_malloc_heap_size !== undefined &&
        post_malloc_heap_size !== undefined
      ) {
        details.push(
          <TooltipDetail
            label="Malloc heap size (pre - post)"
            key="GMajor-Malloc heap size (pre - post)"
          >
            {formatBytes(pre_malloc_heap_size) +
              ' - ' +
              formatBytes(post_malloc_heap_size)}
          </TooltipDetail>
        );
      }
      details.push(
        <TooltipDetail label="MMU 20ms" key="GMajor-MMU 20ms">
          {formatPercent(timings.mmu_20ms)}
        </TooltipDetail>,
        <TooltipDetail label="MMU 50ms" key="GMajor-MMU 50s">
          {formatPercent(timings.mmu_50ms)}
        </TooltipDetail>,
        <TooltipDetail label="Minor GCs" key="GMajor-Minor GCs">
          {timings.minor_gcs}
        </TooltipDetail>,
        <TooltipDetail label="Slices" key="GMajor-Slices">
          {timings.slices}
        </TooltipDetail>,
        <TooltipDetail label="Zones" key="GMajor-Zones">
          {formatValueTotal(
            timings.zones_collected,
            timings.total_zones,
            String
          )}
        </TooltipDetail>,
        <TooltipDetail label="Compartments" key="GMajor-Compartments">
          {timings.total_compartments}
        </TooltipDetail>,
        ...phase_times.map(_markerDetailPhase)
      );
      break;
    }
    default:
    // Do nothing.
  }
  return details;
}

export function getGCSliceDetails(
  data: GCSliceMarkerPayload
): TooltipDetailComponent[] {
  const details = [];
  const timings = data.timings;
  let triggers = null;
  if (timings.trigger_amount && timings.trigger_threshold) {
    triggers = (
      <TooltipDetail label="Trigger (amt/trig)" key="GSlice-Trigger (amt/trig)">
        {formatValueTotal(
          timings.trigger_amount,
          timings.trigger_threshold,
          formatBytes,
          false /* includePercent */
        )}
      </TooltipDetail>
    );
  }
  const phase_times = _filterInterestingPhaseTimes(timings.phase_times, 6);
  details.push(
    <TooltipDetail label="Reason" key="GSlice-Reason">
      {timings.reason}
    </TooltipDetail>,
    <TooltipDetail label="Budget" key="GSlice-Budget">
      {timings.budget}
    </TooltipDetail>,
    <TooltipDetail label="States (pre - post)" key="GSlice-States (pre - post)">
      {timings.initial_state + ' – ' + timings.final_state}
    </TooltipDetail>,
    triggers,
    <TooltipDetail label="Page faults" key="GSlice-Page faults">
      {timings.page_faults}
    </TooltipDetail>,
    ...phase_times.map(_markerDetailPhase)
  );
  return details;
}

type PhaseTimeTuple = {| name: string, time: Microseconds |};

function _markerDetailPhase(p: PhaseTimeTuple) {
  return (
    <TooltipDetail key={'GC Phase - ' + p.name} label={'Phase ' + p.name}>
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
 * Construct a tree of phase timings, in order to display the most expensive
 * leaf phases.
 *
 * A leaf phase is a phase with no sub-phases. The phase tree is constructed
 * from the phaseTimes array, which contains hierarchical path names of each
 * phase together with its total elapsed time. We construct synthetic leaf
 * phases for the self-time of each interior node, containing the elapsed time
 * that is not part of a sub-phase.
 *
 * If the following are phases:
 * marking.mark_roots
 * marking.mark_heap
 * marking.mark_heap.objects
 * sweeping.sweep
 *
 * Then marking.mark_roots, marking.mark_heap.objects, sweeping.sweep are the
 * only original leaves. We will add in "marking.mark_roots (self-time)" and
 * "marking.mark_heap (self-time)". We select from these leaves since they will
 * give the person looking at the profile the best clue about which
 * (sub-)phases are taking the longest.
 *
 * For example, it isn't useful to say "marking.mark_heap took 200ms" but it is
 * useful to say "marking.mark_heap.objects took 180ms" (if objects has no
 * sub-phases). However, if marking.mark_heap took 200ms total yet all of its
 * sub-phases add up to only 20ms, then we would want to say "marking.mark_heap
 * (self-time) is 180ms".
 */

type PhaseTreeNode = {|
  value: PhaseTimeTuple,
  leaf: boolean,
  branches: Map<string, PhaseTreeNode>,
|};

function _treeInsert(
  tree: Map<string, PhaseTreeNode>,
  path: Array<string>,
  phase: PhaseTimeTuple
): void {
  const component = path.shift();
  if (component === undefined) {
    // This path is not a leaf, it can be ignored.
    return;
  }

  const uninitializedPhaseTime = { name: '(temp)', time: 0 };

  let node = tree.get(component);
  if (!node) {
    // Make a new node and grow the tree in this direction.
    const value = { ...uninitializedPhaseTime };
    node = { branches: new Map(), leaf: false, value };
    tree.set(component, node);
  }

  if (path.length > 0) {
    // There are more path components.  This node should be a branch if it
    // isn't one already.
    node.leaf = false;
    _treeInsert(node.branches, path, phase);
  } else {
    // Make the new node leaf node.
    if (node.value.name !== uninitializedPhaseTime.name) {
      console.error(
        `Duplicate phase ${phase.name} in _treeInsert in MarkerTooltipContents.js`
      );
      return;
    }
    node.value = phase;
    node.leaf = true;
  }
}

function _treeGetLeaves(
  tree: Map<string, PhaseTreeNode>
): Array<PhaseTimeTuple> {
  const leaves = [];
  for (const { branches, leaf, value } of tree.values()) {
    if (leaf) {
      leaves.push(value);
    } else {
      leaves.push(..._treeGetLeaves(branches));
    }
  }
  return leaves;
}

function _forEachTreeNode(
  tree: Map<string, PhaseTreeNode>,
  visit: (node: PhaseTreeNode) => void
): void {
  for (const node of tree.values()) {
    visit(node);
    _forEachTreeNode(node.branches, visit);
  }
}

function _filterInterestingPhaseTimes(
  rawPhases: PhaseTimes<Microseconds>,
  numSelect: number
): Array<PhaseTimeTuple> {
  const phaseTimes = _makePhaseTimesArray(rawPhases);
  const selfTimeSuffix = ' (self-time)';

  /*
   * Build the tree.
   */
  const tree = new Map();
  for (const phase of phaseTimes) {
    const components = phase.name.split('.');
    _treeInsert(tree, components, phase);
  }

  /*
   * For every non-leaf phase, add in a (self-time) leaf with the time not
   * accounted for by its children.
   */
  _forEachTreeNode(
    tree,
    ({ leaf, branches, value: { time: totalTime, name } }) => {
      if (!leaf) {
        let remaining = totalTime;
        for (const { value } of branches.values()) {
          remaining -= value.time;
        }
        const value = { name: name + selfTimeSuffix, time: remaining };
        branches.set(name, { branches: new Map(), leaf: true, value });
      }
    }
  );

  /* Select the 'numSelect' most costly leaf phases. */
  const sortedPhaseTimes = _treeGetLeaves(tree)
    .sort((a, b) => b.time - a.time)
    .slice(0, numSelect)
    .filter((pt) => pt.time > 0);

  /*
   * Sort by the ordering of the original list, which is in an execution order
   * that we'd like to preserve.
   */
  const order = {};
  let i = 0;
  for (const { name } of phaseTimes) {
    order[name] = i++;
    order[name + selfTimeSuffix] = i++;
  }

  return sortedPhaseTimes.sort((a, b) => order[a.name] - order[b.name]);
}

function _sumMaybeEntries(
  entries: PhaseTimes<Microseconds>,
  selectEntries: Array<string>
): Microseconds {
  return selectEntries
    .map((name) => (entries[name] ? entries[name] : 0))
    .reduce((a, x) => a + x, 0);
}
