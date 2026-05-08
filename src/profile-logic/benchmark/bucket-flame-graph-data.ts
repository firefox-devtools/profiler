/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure helpers that compute everything needed to render a SelfWing-style
 * flame graph (focusSelf with 'js' implementation filter) for one
 * (Profile, funcIndex) pair, without going through the Redux store.
 *
 * Used by the benchmark-comparison page to expand a bucket row and show two
 * flame graphs (base vs new). Each call here mirrors the chain of selectors
 * in selectors/per-thread/stack-sample.ts (the "self wing" cluster) and
 * selectors/per-thread/thread.tsx (`getThread`), but operates on a profile
 * that is not the one currently loaded in Redux state.
 */

import {
  computeStackTableFromRawStackTable,
  computeSamplesTableFromRawSamplesTable,
  reserveFunctionsForCollapsedResources,
  createThreadFromDerivedTables,
  getCallNodeInfo,
  getSampleIndexToCallNodeIndex,
} from '../profile-data';
import * as Transforms from '../transforms';
import * as CallTree from '../call-tree';
import * as FlameGraph from '../flame-graph';
import { computeReferenceCPUDeltaPerMs } from '../cpu';
import { getDefaultCategories } from '../data-structures';
import { StringTable } from '../../utils/string-table';
import { base64StringToBytes } from '../../utils/base64';

import type {
  Thread,
  Profile,
  IndexIntoFuncTable,
  IndexIntoCategoryList,
  CategoryList,
  StartEndRange,
  WeightType,
  SamplesLikeTable,
  SampleCategoriesAndSubcategories,
} from '../../types';
import type { CallNodeInfo } from '../call-node-info';
import type { FlameGraphTiming } from '../flame-graph';
import type { CallTree as CallTreeT } from '../call-tree';

export type BucketFlameGraphData = {
  thread: Thread;
  callNodeInfo: CallNodeInfo;
  callTree: CallTreeT;
  flameGraphTiming: FlameGraphTiming;
  maxStackDepthPlusOne: number;
  ctssSamples: SamplesLikeTable;
  ctssSampleCategoriesAndSubcategories: SampleCategoriesAndSubcategories;
  weightType: WeightType;
  categories: CategoryList;
  defaultCategory: IndexIntoCategoryList;
  timeRange: StartEndRange;
  interval: number;
  /** Total weight of all samples in the focused thread. Used by callers to
   * scale the flame-graph viewport so that 1 sample takes up the same pixel
   * width across multiple flame graphs. */
  rootTotalSummary: number;
};

/** Categories list with fallback to defaults (matches selectors/profile.ts). */
export function getCategoriesForProfile(profile: Profile): CategoryList {
  return profile.meta.categories ?? getDefaultCategories();
}

/** Default category index — the "Other" / grey category. */
export function getDefaultCategoryIndex(categories: CategoryList): IndexIntoCategoryList {
  return categories.findIndex((c) => c.color === 'grey');
}

/**
 * Build a derived `Thread` from `profile.threads[threadIndex]` without going
 * through Redux. Equivalent to the `getThread` selector in
 * selectors/per-thread/thread.tsx, minus the per-thread stuff that doesn't
 * apply when there's no thread merging.
 */
export function buildDerivedThread(
  profile: Profile,
  threadIndex: number,
  categories: CategoryList,
  defaultCategory: IndexIntoCategoryList
): Thread {
  const rawThread = profile.threads[threadIndex];
  const { shared, meta } = profile;
  const stringTable = StringTable.withBackingArray(
    shared.stringArray as string[]
  );
  const stackTable = computeStackTableFromRawStackTable(
    shared.stackTable,
    shared.frameTable,
    categories,
    defaultCategory
  );
  const { funcTable } = reserveFunctionsForCollapsedResources(
    shared.funcTable,
    shared.resourceTable
  );
  const referenceCPUDeltaPerMs = computeReferenceCPUDeltaPerMs(profile);
  const samples = computeSamplesTableFromRawSamplesTable(
    rawThread.samples,
    stackTable,
    meta.sampleUnits,
    referenceCPUDeltaPerMs,
    defaultCategory
  );
  const tracedValuesBuffer = rawThread.tracedValuesBuffer
    ? base64StringToBytes(rawThread.tracedValuesBuffer)
    : undefined;
  return createThreadFromDerivedTables(
    rawThread,
    samples,
    stackTable,
    shared.frameTable,
    funcTable,
    shared.nativeSymbols,
    shared.resourceTable,
    stringTable,
    shared.sources,
    tracedValuesBuffer
  );
}

/**
 * Compute everything needed to render one SelfWing-style flame graph for the
 * given function in the given thread. Mirrors the `_getSelfWing*` selectors.
 */
export function computeBucketFlameGraphData(
  profile: Profile,
  thread: Thread,
  funcIndex: IndexIntoFuncTable,
  categories: CategoryList,
  defaultCategory: IndexIntoCategoryList
): BucketFlameGraphData {
  // 1. focusSelf with 'js' implementation filter — this is what "self wing"
  // does in the call tree / function list. The 'js' filter matches the
  // benchmark's bucketing logic in computeJsOnlySampleBuckets, so the flame
  // graph reflects the same notion of "this bucket's time".
  const selfWingThread = Transforms.focusSelf(thread, funcIndex, 'js');

  // 2. Call-node info for the focused thread.
  const callNodeInfo = getCallNodeInfo(
    selfWingThread.stackTable,
    selfWingThread.frameTable,
    defaultCategory
  );

  // 3. CTSS samples (timing strategy → just thread.samples).
  const ctssSamples = CallTree.extractSamplesLikeTable(selfWingThread, 'timing');

  // 4. Map samples → call nodes.
  const sampleIndexToCallNodeIndex = getSampleIndexToCallNodeIndex(
    ctssSamples.stack,
    callNodeInfo.getStackIndexToNonInvertedCallNodeIndex()
  );

  // 5. Per-callnode self-time + scaling totals.
  const callNodeSelfAndSummary = CallTree.computeCallNodeSelfAndSummary(
    ctssSamples,
    sampleIndexToCallNodeIndex,
    callNodeInfo.getCallNodeTable().length
  );

  // 6. Full timings.
  const callTreeTimingsNonInverted = CallTree.computeCallTreeTimingsNonInverted(
    callNodeInfo,
    callNodeSelfAndSummary
  );
  const callTreeTimings: CallTree.CallTreeTimings = {
    type: 'NON_INVERTED',
    timings: callTreeTimingsNonInverted,
  };

  // 7. Flame graph layout.
  const flameGraphRows = FlameGraph.computeFlameGraphRows(
    callNodeInfo.getCallNodeTable(),
    selfWingThread.funcTable,
    selfWingThread.stringTable
  );
  const flameGraphTiming = FlameGraph.getFlameGraphTiming(
    flameGraphRows,
    callNodeInfo.getCallNodeTable(),
    callTreeTimingsNonInverted
  );

  // 8. CallTree object (used by FlameGraph for tooltips and double-click).
  const weightType: WeightType = ctssSamples.weightType ?? 'samples';
  const callTree = CallTree.getCallTree(
    selfWingThread,
    callNodeInfo,
    categories,
    ctssSamples,
    callTreeTimings,
    weightType
  );

  // 9. Per-sample categories.
  const ctssSampleCategoriesAndSubcategories =
    CallTree.computeUnfilteredCtssSampleCategoriesAndSubcategories(
      selfWingThread,
      ctssSamples,
      defaultCategory
    );

  // Time range from the original (un-focused) thread's samples. The flame
  // graph doesn't actually scrub by time, but ChartViewport requires a range.
  const interval = profile.meta.interval;
  const timeColumn = thread.samples.time;
  const sampleCount = thread.samples.length;
  const timeRange: StartEndRange =
    sampleCount > 0
      ? { start: timeColumn[0], end: timeColumn[sampleCount - 1] + interval }
      : { start: 0, end: interval };

  return {
    thread: selfWingThread,
    callNodeInfo,
    callTree,
    flameGraphTiming,
    maxStackDepthPlusOne: callNodeInfo.getCallNodeTable().maxDepth + 1,
    ctssSamples,
    ctssSampleCategoriesAndSubcategories,
    weightType,
    categories,
    defaultCategory,
    timeRange,
    interval,
    rootTotalSummary: callNodeSelfAndSummary.rootTotalSummary,
  };
}
