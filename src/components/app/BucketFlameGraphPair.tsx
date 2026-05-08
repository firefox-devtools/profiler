/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useMemo, useState } from 'react';

import { FlameGraph } from 'firefox-profiler/components/flame-graph/FlameGraph';
import { computeBucketFlameGraphData } from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';

import type { BucketFlameGraphData } from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';
import type {
  Profile,
  Thread,
  CategoryList,
  IndexIntoCategoryList,
  IndexIntoFuncTable,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';

/** Per-profile prep data passed in from the viewer. The derived `thread` is
 * expensive to build, so it's computed once at the viewer level and reused
 * across every bucket the user expands. */
export type BucketProfileBundle = {
  profile: Profile;
  thread: Thread;
  categories: CategoryList;
  defaultCategory: IndexIntoCategoryList;
};

type SideProps = {
  label: string;
  data: BucketFlameGraphData | null;
  /** Stable React key (e.g. "base"/"new"); also used as the FlameGraph
   * `threadsKey` to scope its internal state per side. */
  sideKey: string;
  /** Width as a fraction (0..1) of the row, so the side with fewer samples is
   * narrower and 1 sample takes the same pixel width on both sides. */
  widthFraction: number;
};

function BucketFlameGraphSide({
  label,
  data,
  sideKey,
  widthFraction,
}: SideProps) {
  const [selectedCallNodeIndex, setSelectedCallNodeIndex] =
    useState<IndexIntoCallNodeTable | null>(null);

  const sampleCountText =
    data === null ? '' : ` — ${data.rootTotalSummary.toFixed(0)} samples`;

  return (
    <div
      className="bucketFlameGraphSide"
      style={{ width: `${widthFraction * 100}%` }}
    >
      <div className="bucketFlameGraphSide__label">
        {label}
        <span className="bucketFlameGraphSide__sampleCount">
          {sampleCountText}
        </span>
      </div>
      <div className="bucketFlameGraphSide__chart">
        {data === null ? (
          <div className="bucketFlameGraphSide__empty">
            No data for this bucket.
          </div>
        ) : (
          <FlameGraph
            thread={data.thread}
            weightType={data.weightType}
            innerWindowIDToPageMap={null}
            maxStackDepthPlusOne={data.maxStackDepthPlusOne}
            timeRange={data.timeRange}
            previewSelection={null}
            flameGraphTiming={data.flameGraphTiming}
            callTree={data.callTree}
            callNodeInfo={data.callNodeInfo}
            threadsKey={sideKey}
            selectedCallNodeIndex={selectedCallNodeIndex}
            rightClickedCallNodeIndex={null}
            scrollToSelectionGeneration={0}
            categories={data.categories}
            interval={data.interval}
            isInverted={false}
            callTreeSummaryStrategy="timing"
            ctssSamples={data.ctssSamples}
            ctssSampleCategoriesAndSubcategories={
              data.ctssSampleCategoriesAndSubcategories
            }
            tracedTiming={null}
            displayStackType={false}
            contextMenuId="BucketFlameGraphContextMenu"
            onSelectedCallNodeChange={setSelectedCallNodeIndex}
            onRightClickedCallNodeChange={noop}
            onCallNodeEnterOrDoubleClick={noop}
            onKeyboardTransformShortcut={noop}
          />
        )}
      </div>
    </div>
  );
}

function noop() {}

type Props = {
  baseBundle: BucketProfileBundle;
  newBundle: BucketProfileBundle;
  baseFunc: IndexIntoFuncTable | null;
  newFunc: IndexIntoFuncTable | null;
};

function computeForBundle(
  bundle: BucketProfileBundle,
  funcIndex: IndexIntoFuncTable | null
): BucketFlameGraphData | null {
  if (funcIndex === null) {
    return null;
  }
  return computeBucketFlameGraphData(
    bundle.profile,
    bundle.thread,
    funcIndex,
    bundle.categories,
    bundle.defaultCategory
  );
}

/** Two flame graphs stacked vertically (base on top, new below). Each side's
 * width is proportional to its sample-count total so 1 sample takes up the
 * same pixel width across both. */
export function BucketFlameGraphPair({
  baseBundle,
  newBundle,
  baseFunc,
  newFunc,
}: Props) {
  const baseData = useMemo(
    () => computeForBundle(baseBundle, baseFunc),
    [baseBundle, baseFunc]
  );
  const newData = useMemo(
    () => computeForBundle(newBundle, newFunc),
    [newBundle, newFunc]
  );

  const baseTotal = baseData?.rootTotalSummary ?? 0;
  const newTotal = newData?.rootTotalSummary ?? 0;
  const maxTotal = Math.max(baseTotal, newTotal, 1);

  return (
    <div className="bucketFlameGraphPair">
      <BucketFlameGraphSide
        label="Base"
        data={baseData}
        sideKey="base"
        widthFraction={baseTotal / maxTotal}
      />
      <BucketFlameGraphSide
        label="New"
        data={newData}
        sideKey="new"
        widthFraction={newTotal / maxTotal}
      />
    </div>
  );
}
