/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import { getCategories } from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import { isNetworkMarker } from 'firefox-profiler/profile-logic/marker-data';
import type { Store } from '../../types/store';
import type { ThreadMap } from '../thread-map';
import type { TimestampManager } from '../timestamps';
import type { MarkerMap } from '../marker-map';
import type {
  ThreadPageLoadResult,
  PageLoadResourceEntry,
  PageLoadCategoryEntry,
  JankPeriod,
  JankFunction,
} from '../types';
import type { NetworkPayload } from 'firefox-profiler/types/markers';
import type { Thread, CategoryList } from 'firefox-profiler/types';

// ===== Navigation group helpers =====

// Internal milestone type that tracks the source marker index for handle assignment.
type NavGroupMilestone = {
  name: string;
  timeMs: number;
  markerIndex: number;
};

type NavGroup = {
  innerWindowID: number;
  navStart: number;
  loadEnd: number | null;
  url: string | null;
  milestones: NavGroupMilestone[];
};

function getInnerWindowID(data: unknown): number | undefined {
  if (data !== null && typeof data === 'object' && 'innerWindowID' in data) {
    const id = (data as { innerWindowID?: unknown }).innerWindowID;
    if (typeof id === 'number') {
      return id;
    }
  }
  return undefined;
}

// Marker name -> milestone label for the common single-condition markers
const MILESTONE_MARKER_NAMES: Record<string, string> = {
  FirstContentfulPaint: 'FCP',
  FirstContentfulComposite: 'FCC',
  LargestContentfulPaint: 'LCP',
  'TimeToFirstInteractive (TTFI)': 'TTFI',
};

function getOrCreateNavGroup(
  navGroups: Map<number, NavGroup>,
  innerWindowID: number,
  navStart: number
): NavGroup {
  let group = navGroups.get(innerWindowID);
  if (!group) {
    group = {
      innerWindowID,
      navStart,
      loadEnd: null,
      url: null,
      milestones: [],
    };
    navGroups.set(innerWindowID, group);
  }
  return group;
}

function addMilestone(
  group: NavGroup,
  name: string,
  markerEnd: number,
  markerIndex: number
): void {
  if (!group.milestones.some((m) => m.name === name)) {
    group.milestones.push({
      name,
      timeMs: markerEnd - group.navStart,
      markerIndex,
    });
  }
}

function classifyContentType(contentType: string | null | undefined): string {
  if (!contentType) {
    return 'Other';
  }
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if (ct.includes('javascript') || ct.includes('ecmascript')) {
    return 'JS';
  }
  if (ct === 'text/css') {
    return 'CSS';
  }
  if (ct.startsWith('image/')) {
    return 'Image';
  }
  if (ct === 'text/html' || ct === 'application/xhtml+xml') {
    return 'HTML';
  }
  if (ct === 'application/json' || ct === 'text/json') {
    return 'JSON';
  }
  if (
    ct.startsWith('font/') ||
    ct.startsWith('application/font') ||
    ct === 'application/x-font-woff'
  ) {
    return 'Font';
  }
  if (ct === 'application/wasm') {
    return 'Wasm';
  }
  return 'Other';
}

function filenameFromUrl(url: string): string {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    // Use raw url as fallback
  }
  const parts = pathname.split('/');
  const last = parts[parts.length - 1] || url;
  return last.length > 50 ? last.slice(0, 47) + '...' : last;
}

// ===== Leaf function name for a sample =====

function getLeafFunctionName(
  sampleIndex: number,
  thread: Thread
): string | null {
  const stackIndex = thread.samples.stack[sampleIndex];
  if (stackIndex === null || stackIndex === undefined) {
    return null;
  }
  const frameIndex = thread.stackTable.frame[stackIndex];
  const funcIndex = thread.frameTable.func[frameIndex];
  const nameIndex = thread.funcTable.name[funcIndex];
  return thread.stringTable.getString(nameIndex);
}

// ===== Category counting helpers =====

function countCategoriesInRange(
  thread: Thread,
  categories: CategoryList,
  startTime: number,
  endTime: number
): PageLoadCategoryEntry[] {
  const counts = new Map<string, number>();
  let total = 0;

  for (let i = 0; i < thread.samples.length; i++) {
    const t = thread.samples.time[i];
    if (t < startTime || t > endTime) {
      continue;
    }
    const catIndex = thread.samples.category[i];
    const catName =
      catIndex < categories.length ? categories[catIndex].name : 'Other';
    counts.set(catName, (counts.get(catName) ?? 0) + 1);
    total++;
  }

  if (total === 0) {
    return [];
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percentage: (count / total) * 100,
    }));
}

// ===== Main collector =====

export function collectThreadPageLoad(
  store: Store,
  threadMap: ThreadMap,
  timestampManager: TimestampManager,
  markerMap: MarkerMap,
  threadHandle?: string,
  options: { navigationIndex?: number; jankLimit?: number } = {}
): ThreadPageLoadResult {
  const rawJankLimit = options.jankLimit ?? 10;
  const jankLimit = rawJankLimit === 0 ? Infinity : rawJankLimit;

  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);

  const displayThreadHandle =
    threadHandle ?? threadMap.handleForThreadIndexes(threadIndexes);

  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const fullMarkerList = threadSelectors.getFullMarkerList(state);
  const allMarkerIndexes = threadSelectors.getFullMarkerListIndexes(state);
  const categories = getCategories(state);

  // Use the unfiltered thread (all samples, no transforms) for sample-level access.
  const rawThread: Thread = threadSelectors.getThread(state);

  // ===== Step 1: Build navigation groups from markers =====

  const navGroups = new Map<number, NavGroup>();

  for (const i of allMarkerIndexes) {
    const marker = fullMarkerList[i];
    const { name, data } = marker;

    if (marker.end === null) {
      continue;
    }

    if (name === 'DocumentLoad') {
      const innerWindowID = getInnerWindowID(data);
      if (innerWindowID === undefined) {
        continue;
      }
      const group = getOrCreateNavGroup(navGroups, innerWindowID, marker.start);
      group.loadEnd = marker.end;
      addMilestone(group, 'Load', marker.end, i);
      // Extract URL from payload text: "Document URL loaded after Xms..."
      if (data !== null && typeof data === 'object' && 'name' in data) {
        const textName = (data as { name?: unknown }).name;
        if (typeof textName === 'string') {
          const match = textName.match(/^Document (.+) loaded after/);
          if (match) {
            group.url = match[1];
          }
        }
      }
    } else if (
      name === 'DOMContentLoaded' &&
      data !== null &&
      typeof data === 'object' &&
      'category' in data &&
      (data as { category?: unknown }).category === 'Navigation'
    ) {
      const innerWindowID = getInnerWindowID(data);
      if (innerWindowID === undefined) {
        continue;
      }
      const group = getOrCreateNavGroup(navGroups, innerWindowID, marker.start);
      addMilestone(group, 'DCL', marker.end, i);
    } else {
      const milestoneName = MILESTONE_MARKER_NAMES[name];
      if (milestoneName === undefined) {
        continue;
      }
      const innerWindowID = getInnerWindowID(data);
      if (innerWindowID === undefined) {
        continue;
      }
      const group = getOrCreateNavGroup(navGroups, innerWindowID, marker.start);
      addMilestone(group, milestoneName, marker.end, i);
    }
  }

  const realGroups: NavGroup[] = Array.from(navGroups.values());

  realGroups.sort((a, b) => a.navStart - b.navStart);

  // Filter to groups that have at least a DocumentLoad (loadEnd != null)
  const completeGroups = realGroups.filter((g) => g.loadEnd !== null);

  if (completeGroups.length === 0) {
    return {
      type: 'thread-page-load',
      threadHandle: displayThreadHandle,
      friendlyThreadName,
      url: null,
      navigationIndex: 0,
      navigationTotal: 0,
      navStartMs: 0,
      milestones: [],
      resourceCount: 0,
      resourceAvgMs: null,
      resourceMaxMs: null,
      resourcesByType: [],
      topResources: [],
      totalSamples: 0,
      categories: [],
      jankTotal: 0,
      jankPeriods: [],
    };
  }

  // Select the requested navigation (1-based; default = last)
  const navTotal = completeGroups.length;
  const requestedIndex = options.navigationIndex ?? navTotal;
  const clampedIndex = Math.max(1, Math.min(requestedIndex, navTotal));
  const nav = completeGroups[clampedIndex - 1];

  const navStart = nav.navStart;
  const loadEnd = nav.loadEnd!;

  // Add TTFB milestone from the main document's network marker
  if (nav.url) {
    for (const i of allMarkerIndexes) {
      const m = fullMarkerList[i];
      if (!isNetworkMarker(m)) {
        continue;
      }
      const d = m.data as NetworkPayload;
      if (
        d.status === 'STATUS_STOP' &&
        d.URI === nav.url &&
        d.requestStart !== undefined &&
        d.responseStart !== undefined
      ) {
        nav.milestones.push({
          name: 'TTFB',
          timeMs: d.responseStart - navStart,
          markerIndex: i,
        });
        break;
      }
    }
  }

  // Sort milestones by timeMs
  nav.milestones.sort((a, b) => a.timeMs - b.timeMs);

  // Data window ends at the largest non-TTFI milestone. TTFI reflects
  // post-load JS work and would inflate the analysis sections.
  const nonTtfiMs = nav.milestones
    .filter((m) => m.name !== 'TTFI')
    .map((m) => m.timeMs);
  const dataWindowEndMs =
    nonTtfiMs.length > 0 ? Math.max(...nonTtfiMs) : loadEnd - navStart;
  const pageLoadEnd = navStart + dataWindowEndMs;

  // ===== Steps 2 & 4: Resources and Jank markers (single pass) =====

  const resources: PageLoadResourceEntry[] = [];
  const jankMarkerIndexes: number[] = [];

  for (const i of allMarkerIndexes) {
    const m = fullMarkerList[i];

    if (isNetworkMarker(m)) {
      const d = m.data as NetworkPayload;
      if (
        d.status === 'STATUS_STOP' &&
        d.startTime >= navStart &&
        d.startTime <= pageLoadEnd
      ) {
        resources.push({
          filename: filenameFromUrl(d.URI),
          url: d.URI,
          durationMs: d.endTime - d.startTime,
          resourceType: classifyContentType(d.contentType),
          markerHandle: markerMap.handleForMarker(threadIndexes, i),
        });
      }
    } else if (
      m.name === 'Jank' &&
      m.start >= navStart &&
      (m.end ?? m.start) <= pageLoadEnd
    ) {
      jankMarkerIndexes.push(i);
    }
  }

  resources.sort((a, b) => b.durationMs - a.durationMs);

  const resourceCount = resources.length;
  let resourceAvgMs: number | null = null;
  let resourceMaxMs: number | null = null;

  if (resourceCount > 0) {
    const total = resources.reduce((sum, r) => sum + r.durationMs, 0);
    resourceAvgMs = total / resourceCount;
    resourceMaxMs = resources[0].durationMs;
  }

  // Count by type
  const typeCounts = new Map<string, number>();
  for (const r of resources) {
    typeCounts.set(r.resourceType, (typeCounts.get(r.resourceType) ?? 0) + 1);
  }
  const resourcesByType = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({
      type,
      count,
      percentage: (count / resourceCount) * 100,
    }));

  const topResources = resources.slice(0, 10);

  // ===== Step 3: CPU Categories =====

  const cpuCategories = countCategoriesInRange(
    rawThread,
    categories,
    navStart,
    pageLoadEnd
  );

  const totalSamples = cpuCategories.reduce((s, c) => s + c.count, 0);

  // ===== Step 5: Jank periods =====

  const jankTotal = jankMarkerIndexes.length;
  const limitedJankIndexes = jankMarkerIndexes.slice(0, jankLimit);

  const jankPeriods: JankPeriod[] = limitedJankIndexes.map((i) => {
    const m = fullMarkerList[i];
    const jStart = m.start;
    const jEnd = m.end ?? m.start;

    // Single pass to collect both categories and leaf functions
    const categoryCounts = new Map<string, number>();
    const funcCounts = new Map<string, number>();
    let categoryTotal = 0;

    for (let s = 0; s < rawThread.samples.length; s++) {
      const t = rawThread.samples.time[s];
      if (t < jStart || t > jEnd) {
        continue;
      }
      const catIndex = rawThread.samples.category[s];
      const catName =
        catIndex < categories.length ? categories[catIndex].name : 'Other';
      categoryCounts.set(catName, (categoryCounts.get(catName) ?? 0) + 1);
      categoryTotal++;

      const name = getLeafFunctionName(s, rawThread);
      if (name !== null) {
        funcCounts.set(name, (funcCounts.get(name) ?? 0) + 1);
      }
    }

    const jankCategoryEntries: PageLoadCategoryEntry[] =
      categoryTotal === 0
        ? []
        : Array.from(categoryCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({
              name,
              count,
              percentage: (count / categoryTotal) * 100,
            }));

    const topFunctions: JankFunction[] = Array.from(funcCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, sampleCount]) => ({ name, sampleCount }));

    return {
      startMs: jStart - navStart,
      durationMs: jEnd - jStart,
      markerHandle: markerMap.handleForMarker(threadIndexes, i),
      startHandle: timestampManager.nameForTimestamp(jStart),
      endHandle: timestampManager.nameForTimestamp(jEnd),
      topFunctions,
      categories: jankCategoryEntries,
    };
  });

  return {
    type: 'thread-page-load',
    threadHandle: displayThreadHandle,
    friendlyThreadName,
    url: nav.url,
    navigationIndex: clampedIndex,
    navigationTotal: navTotal,
    navStartMs: navStart,
    milestones: nav.milestones.map((m) => ({
      name: m.name,
      timeMs: m.timeMs,
      markerHandle: markerMap.handleForMarker(threadIndexes, m.markerIndex),
    })),
    resourceCount,
    resourceAvgMs,
    resourceMaxMs,
    resourcesByType,
    topResources,
    totalSamples,
    categories: cpuCategories,
    jankTotal,
    jankPeriods,
  };
}
