/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { useMemo, useState } from 'react';

import { FlameGraph } from 'firefox-profiler/components/flame-graph/FlameGraph';
import { computeBucketFlameGraphData } from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';
import { encodeUintArrayForUrlComponent } from 'firefox-profiler/utils/uintarray-encoding';

import type {
  BucketFlameGraphData,
  BucketProfileBundle,
} from 'firefox-profiler/profile-logic/benchmark/bucket-flame-graph-data';
import type {
  IndexIntoFuncTable,
  IndexIntoCallNodeTable,
} from 'firefox-profiler/types';

export type { BucketProfileBundle };

/**
 * Build a fresh-profiler URL that mimics the bucket flame graph:
 *   • marker-search filter "-async,-sync"     → restrict to measured samples
 *   • marker-search filter "<suiteName>"       → restrict to the subtest
 *     (omitted when `suiteName` is null, which is the overall/global case)
 *   • focus-self on `funcIndex` with the JS implementation filter
 *
 * `viewerUrl` is a profiler.firefox.com URL that already points at the profile
 * (e.g. `/from-url/<enc>/…` or `/public/<hash>/…`). We rewrite its tab segment
 * to `flame-graph` and replace the query string with our own.
 */
function buildDeepLinkUrl(
  viewerUrl: string,
  threadIndex: number,
  suiteName: string | null,
  funcIndex: IndexIntoFuncTable
): string | null {
  let url: URL;
  try {
    url = new URL(viewerUrl);
  } catch {
    return null;
  }
  const pathParts = url.pathname.split('/').filter((p) => p);
  // Expect [dataSource, hashOrEncodedUrl, ...maybeTab]. Anything shorter is
  // unfamiliar territory — bail rather than produce a bogus link.
  if (pathParts.length < 2) {
    return null;
  }
  const [dataSource, hashOrEncoded] = pathParts;
  const newPathname = `/${dataSource}/${hashOrEncoded}/flame-graph/`;

  const transforms = ['fs-m--async,-sync'];
  if (suiteName !== null) {
    transforms.push(`fs-m-${suiteName}`);
  }
  transforms.push(`ffs-js-${funcIndex}`);

  const params = new URLSearchParams();
  params.set('thread', encodeUintArrayForUrlComponent([threadIndex]));
  params.set('transforms', transforms.join('~'));

  url.pathname = newPathname;
  url.search = `?${params.toString()}`;
  url.hash = '';
  return url.toString();
}

type SideProps = {
  label: string;
  data: BucketFlameGraphData | null;
  /** Stable React key (e.g. "base"/"new"); also used as the FlameGraph
   * `threadsKey` to scope its internal state per side. */
  sideKey: string;
  /** Width as a fraction (0..1) of the row, so the side with fewer samples is
   * narrower and 1 sample takes the same pixel width on both sides. */
  widthFraction: number;
  /** URL of a fresh profiler tab that reproduces this flame graph, or null
   * when we can't construct one (e.g. viewer URL missing the expected shape,
   * or no representative func for this bucket on this side). */
  deepLinkUrl: string | null;
};

function BucketFlameGraphSide({
  label,
  data,
  sideKey,
  widthFraction,
  deepLinkUrl,
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
        <span className="bucketFlameGraphSide__labelText">
          {label}
          <span className="bucketFlameGraphSide__sampleCount">
            {sampleCountText}
          </span>
        </span>
        {deepLinkUrl !== null ? (
          <a
            className="bucketFlameGraphSide__openInNewTab"
            href={deepLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open this view in a new profiler tab"
          >
            Open ↗
          </a>
        ) : null}
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
            startsAtBottom={true}
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
  /** Viewer URLs of the two source profiles. Used to build "open in a new
   * profiler tab" links whose transforms mimic the bucket flame graph. */
  baseViewerUrl: string;
  newViewerUrl: string;
  /** Suite name whose iteration markers the flame graph is restricted to,
   * or null when this pair represents the overall (all-suites) view. */
  suiteName: string | null;
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
  baseViewerUrl,
  newViewerUrl,
  suiteName,
}: Props) {
  const baseData = useMemo(
    () => computeForBundle(baseBundle, baseFunc),
    [baseBundle, baseFunc]
  );
  const newData = useMemo(
    () => computeForBundle(newBundle, newFunc),
    [newBundle, newFunc]
  );

  const baseDeepLinkUrl =
    baseFunc !== null
      ? buildDeepLinkUrl(
          baseViewerUrl,
          baseBundle.benchmarkInfo.threadIndex,
          suiteName,
          baseFunc
        )
      : null;
  const newDeepLinkUrl =
    newFunc !== null
      ? buildDeepLinkUrl(
          newViewerUrl,
          newBundle.benchmarkInfo.threadIndex,
          suiteName,
          newFunc
        )
      : null;

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
        deepLinkUrl={baseDeepLinkUrl}
      />
      <BucketFlameGraphSide
        label="New"
        data={newData}
        sideKey="new"
        widthFraction={newTotal / maxTotal}
        deepLinkUrl={newDeepLinkUrl}
      />
    </div>
  );
}
