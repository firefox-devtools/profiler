/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { getSelectedThreadIndexes } from 'firefox-profiler/selectors/url-state';
import {
  getProfile,
  getCategories,
  getMarkerSchemaByName,
  getStringTable,
} from 'firefox-profiler/selectors/profile';
import { getThreadSelectors } from 'firefox-profiler/selectors/per-thread';
import {
  formatFromMarkerSchema,
  getLabelGetter,
} from 'firefox-profiler/profile-logic/marker-schema';
import { changeMarkersSearchString } from '../../actions/profile-view';
import type { Store } from '../../types/store';
import type { ThreadMap } from '../thread-map';
import type { MarkerMap } from '../marker-map';
import type {
  Marker,
  MarkerIndex,
  CategoryList,
  Thread,
  Lib,
  IndexIntoStackTable,
  MarkerSchemaByName,
} from 'firefox-profiler/types';
import type { StringTable } from 'firefox-profiler/utils/string-table';
import type {
  MarkerStackResult,
  MarkerInfoResult,
  StackTraceData,
  ThreadMarkersResult,
  ThreadNetworkResult,
  NetworkRequestEntry,
  NetworkPhaseTimings,
  MarkerGroupData,
  DurationStats,
  RateStats,
  MarkerFilterOptions,
  FlatMarkerItem,
  ProfileLogsResult,
} from '../types';
import {
  isNetworkMarker,
  LOG_LEVEL_STRING_TO_LETTER,
  LOG_LETTER_TO_LEVEL,
  formatLogTimestamp,
  formatLogStatement,
} from 'firefox-profiler/profile-logic/marker-data';
import { formatFunctionNameWithLibrary } from '../function-list';
import type {
  NetworkPayload,
  LogMarkerPayload,
} from 'firefox-profiler/types/markers';

/**
 * Aggregated statistics for a group of markers.
 */
interface MarkerNameStats {
  markerName: string;
  count: number;
  isInterval: boolean;
  durationStats?: DurationStats;
  rateStats?: RateStats;
  topMarkers: Array<{
    handle: string;
    label: string;
    start: number;
    duration?: number;
    hasStack?: boolean;
  }>;
  subGroups?: MarkerGroup[]; // Sub-groups for multi-level grouping
  subGroupKey?: string; // The key used for sub-grouping (e.g., "eventType" for auto-grouped fields)
}

/**
 * A group of markers with a common grouping key value.
 */
interface MarkerGroup {
  groupName: string;
  count: number;
  isInterval: boolean;
  durationStats?: DurationStats;
  rateStats?: RateStats;
  topMarkers: Array<{
    handle: string;
    label: string;
    start: number;
    duration?: number;
    hasStack?: boolean;
  }>;
  subGroups?: MarkerGroup[]; // Recursive sub-grouping
}

/**
 * A grouping key specifies how to group markers.
 */
type GroupingKey =
  | 'type' // Group by marker type (data.type)
  | 'name' // Group by marker name
  | 'category' // Group by category name
  | { field: string }; // Group by a specific field value

/**
 * Compute duration statistics for a list of markers.
 * Only applies to interval markers (markers with an end time).
 * Exported for testing.
 */
export function computeDurationStats(
  markers: Marker[]
): DurationStats | undefined {
  const durations = markers
    .filter((m) => m.end !== null)
    .map((m) => m.end! - m.start)
    .sort((a, b) => a - b);

  if (durations.length === 0) {
    return undefined;
  }

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    median: durations[Math.floor(durations.length / 2)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)],
  };
}

/**
 * Compute rate statistics for a list of markers (gaps between markers).
 * Exported for testing.
 */
export function computeRateStats(markers: Marker[]): RateStats {
  if (markers.length < 2) {
    return {
      markersPerSecond: 0,
      minGap: 0,
      avgGap: 0,
      maxGap: 0,
    };
  }

  const sorted = [...markers].sort((a, b) => a.start - b.start);
  const gaps: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].start - sorted[i - 1].start);
  }

  const timeRange = sorted[sorted.length - 1].start - sorted[0].start;
  // timeRange is in milliseconds, convert to seconds for rate
  const markersPerSecond =
    timeRange > 0 ? (markers.length / timeRange) * 1000 : 0;

  return {
    markersPerSecond,
    minGap: Math.min(...gaps),
    avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    maxGap: Math.max(...gaps),
  };
}

/**
 * Apply all marker filters to a list of marker indexes.
 * Returns the filtered list of marker indexes.
 */
function applyMarkerFilters(
  markerIndexes: MarkerIndex[],
  markers: Marker[],
  categories: CategoryList,
  filterOptions: MarkerFilterOptions
): MarkerIndex[] {
  let filteredIndexes = markerIndexes;

  const { minDuration, maxDuration, category, hasStack } = filterOptions;

  // Apply duration filtering if specified
  if (minDuration !== undefined || maxDuration !== undefined) {
    filteredIndexes = filteredIndexes.filter((markerIndex) => {
      const marker = markers[markerIndex];

      // Skip instant markers (they have no duration)
      if (marker.end === null) {
        return false;
      }

      const duration = marker.end - marker.start;

      // Check min duration constraint
      if (minDuration !== undefined && duration < minDuration) {
        return false;
      }

      // Check max duration constraint
      if (maxDuration !== undefined && duration > maxDuration) {
        return false;
      }

      return true;
    });
  }

  // Apply category filtering if specified
  if (category !== undefined) {
    const categoryLower = category.toLowerCase();
    filteredIndexes = filteredIndexes.filter((markerIndex) => {
      const marker = markers[markerIndex];
      const categoryName = categories[marker.category]?.name ?? 'Unknown';
      return categoryName.toLowerCase().includes(categoryLower);
    });
  }

  // Apply hasStack filtering if specified
  if (hasStack) {
    filteredIndexes = filteredIndexes.filter((markerIndex) => {
      const marker = markers[markerIndex];
      return marker.data && 'cause' in marker.data && marker.data.cause;
    });
  }

  return filteredIndexes;
}

/**
 * Create a top markers array from a list of marker items.
 * Returns up to 5 top markers, sorted by duration if applicable.
 */
function createTopMarkersArray(
  items: Array<{ marker: Marker; index: MarkerIndex }>,
  threadIndexes: Set<number>,
  markerMap: MarkerMap,
  getMarkerLabel: (markerIndex: MarkerIndex) => string,
  maxCount: number = 5
): Array<{
  handle: string;
  label: string;
  start: number;
  duration?: number;
  hasStack?: boolean;
}> {
  // Partition into interval (sortable by duration) and instant markers, so
  // null `end` values never reach the comparator and produce NaN.
  const intervalItems = items.filter((item) => item.marker.end !== null);
  const instantItems = items.filter((item) => item.marker.end === null);
  intervalItems.sort(
    (a, b) => b.marker.end! - b.marker.start - (a.marker.end! - a.marker.start)
  );
  const sortedItems = [...intervalItems, ...instantItems];

  return sortedItems.slice(0, maxCount).map((item) => {
    const handle = markerMap.handleForMarker(threadIndexes, item.index);
    const label = getMarkerLabel(item.index);
    const duration =
      item.marker.end !== null
        ? item.marker.end - item.marker.start
        : undefined;
    const hasStack = Boolean(
      item.marker.data && 'cause' in item.marker.data && item.marker.data.cause
    );
    return {
      handle,
      label: label || item.marker.name,
      start: item.marker.start,
      duration,
      hasStack,
    };
  });
}

/**
 * Parse a groupBy string into an array of grouping keys.
 * Examples:
 *   "type" => ['type']
 *   "type,name" => ['type', 'name']
 *   "type,field:eventType" => ['type', {field: 'eventType'}]
 */
function parseGroupingKeys(groupBy: string): GroupingKey[] {
  return groupBy.split(',').map((key) => {
    const trimmed = key.trim();
    if (trimmed.startsWith('field:')) {
      return { field: trimmed.substring(6) };
    }
    return trimmed as 'type' | 'name' | 'category';
  });
}

/**
 * Get the grouping value for a marker based on a grouping key.
 */
function getGroupingValue(
  marker: Marker,
  key: GroupingKey,
  categories: CategoryList,
  markerSchemaByName: MarkerSchemaByName,
  stringTable: StringTable
): string {
  if (key === 'type') {
    return marker.data?.type ?? marker.name;
  } else if (key === 'name') {
    return marker.name;
  } else if (key === 'category') {
    return categories[marker.category]?.name ?? 'Unknown';
  }
  // Field-based grouping
  const fieldValue = (marker.data as any)?.[key.field];
  if (fieldValue === undefined || fieldValue === null) {
    return '(no value)';
  }
  // For fields whose format stores a string-table index (unique-string /
  // flow-id / terminating-flow-id), resolve to the interned string so groups
  // show "Error" / "click" / ... instead of integer indices.
  const schema = marker.data ? markerSchemaByName[marker.data.type] : undefined;
  const field = schema?.fields.find((f) => f.key === key.field);
  if (
    field &&
    (field.format === 'unique-string' ||
      field.format === 'flow-id' ||
      field.format === 'terminating-flow-id') &&
    typeof fieldValue === 'number'
  ) {
    return stringTable.getString(fieldValue, '(empty)');
  }
  return String(fieldValue);
}

/**
 * Analyze field variance for a group of markers to determine if sub-grouping
 * would be useful. Returns the best field for grouping based on a scoring
 * heuristic, or null if none found.
 *
 * Schema-driven: iterates the marker schema's declared fields rather than
 * probing the first marker's `Object.keys`, so fields absent from the first
 * marker still get considered. For fields whose format stores a string-table
 * index (`unique-string` / `flow-id` / `terminating-flow-id`), we resolve the
 * interned string before computing cardinality — otherwise we'd see variance
 * over integer indices.
 *
 * The schema's `format` tells us which fields are enum-like candidates. High-
 * cardinality formats (url, file-path, any time/byte/percent/decimal, list,
 * table) are skipped outright; ID-shaped key-name heuristics are unnecessary.
 *
 * Scoring:
 * - 3-20 unique values is the ideal range (score 100), decaying up to 50
 * - Skip fields that appear in < 80% of markers, or with < 3 unique values
 * - Small boost if the field is present on every marker
 */
function analyzeFieldVariance(
  markers: Marker[],
  markerSchemaByName: MarkerSchemaByName,
  stringTable: StringTable
): { field: string; variance: number } | null {
  if (markers.length === 0) {
    return null;
  }
  const schemaName = markers[0].data?.type;
  if (!schemaName) {
    return null;
  }
  const schema = markerSchemaByName[schemaName];
  if (!schema) {
    return null;
  }

  const fieldScores: Array<{
    field: string;
    score: number;
    uniqueCount: number;
  }> = [];

  for (const fieldSchema of schema.fields) {
    if (fieldSchema.hidden) {
      continue;
    }
    const fmt = fieldSchema.format;
    // Only enum-like formats are useful for auto-grouping. Everything else —
    // urls, file paths, any numeric quantity (bytes/time/percent/decimal),
    // flow-ids (unique-per-flow by construction), lists, tables — would
    // produce either a useless single-value grouping or an ID-like blowup.
    const isEnumLike =
      fmt === 'string' ||
      fmt === 'unique-string' ||
      fmt === 'integer' ||
      fmt === 'pid' ||
      fmt === 'tid';
    if (!isEnumLike) {
      continue;
    }
    const needsStringTable = fmt === 'unique-string';

    const uniqueValues = new Set<string>();
    let validCount = 0;

    for (const marker of markers) {
      const raw = (marker.data as any)?.[fieldSchema.key];
      if (raw === undefined || raw === null) {
        continue;
      }
      const resolved =
        needsStringTable && typeof raw === 'number'
          ? stringTable.getString(raw, '')
          : String(raw);
      uniqueValues.add(resolved);
      validCount++;
    }

    if (validCount < markers.length * 0.8) {
      continue;
    }
    const uniqueCount = uniqueValues.size;
    if (uniqueCount < 3) {
      continue;
    }

    let score = 0;
    if (uniqueCount <= 20) {
      score = 100;
    } else if (uniqueCount <= 50) {
      score = 100 - (uniqueCount - 20) * 2;
    } else {
      score = 10;
    }
    if (validCount === markers.length) {
      score += 10;
    }

    fieldScores.push({ field: fieldSchema.key, score, uniqueCount });
  }

  if (fieldScores.length === 0) {
    return null;
  }

  fieldScores.sort((a, b) => b.score - a.score);
  return { field: fieldScores[0].field, variance: fieldScores[0].score / 100 };
}

/**
 * Group markers by a sequence of grouping keys (multi-level grouping).
 * Returns a hierarchical structure of groups.
 */
function groupMarkers(
  markerGroup: Array<{ marker: Marker; index: MarkerIndex }>,
  groupingKeys: GroupingKey[],
  categories: CategoryList,
  markerSchemaByName: MarkerSchemaByName,
  stringTable: StringTable,
  threadIndexes: Set<number>,
  markerMap: MarkerMap,
  getMarkerLabel: (markerIndex: MarkerIndex) => string,
  depth: number = 0,
  maxTopMarkers: number = 5
): MarkerGroup[] {
  if (groupingKeys.length === 0 || markerGroup.length === 0) {
    return [];
  }

  const [currentKey, ...remainingKeys] = groupingKeys;
  const groups = new Map<
    string,
    Array<{ marker: Marker; index: MarkerIndex }>
  >();

  // Group by current key
  for (const item of markerGroup) {
    const groupValue = getGroupingValue(
      item.marker,
      currentKey,
      categories,
      markerSchemaByName,
      stringTable
    );
    if (!groups.has(groupValue)) {
      groups.set(groupValue, []);
    }
    groups.get(groupValue)!.push(item);
  }

  const result: MarkerGroup[] = [];
  for (const [groupName, items] of groups.entries()) {
    const markers = items.map((item) => item.marker);
    const hasEnd = markers.some((m) => m.end !== null);
    const durationStats = hasEnd ? computeDurationStats(markers) : undefined;
    const rateStats = computeRateStats(markers);

    // Get top markers
    const topMarkers = createTopMarkersArray(
      items,
      threadIndexes,
      markerMap,
      getMarkerLabel,
      maxTopMarkers
    );

    // Recursively group by remaining keys (limit depth to 3)
    const subGroups =
      remainingKeys.length > 0 && depth < 2
        ? groupMarkers(
            items,
            remainingKeys,
            categories,
            markerSchemaByName,
            stringTable,
            threadIndexes,
            markerMap,
            getMarkerLabel,
            depth + 1,
            maxTopMarkers
          )
        : undefined;

    result.push({
      groupName,
      count: markers.length,
      isInterval: hasEnd,
      durationStats,
      rateStats,
      topMarkers,
      subGroups,
    });
  }

  // Sort by count descending
  result.sort((a, b) => b.count - a.count);

  return result;
}

/**
 * Aggregate markers by `marker.name` (not by `marker.data.type` — these differ
 * when a marker with the same payload type is emitted under different names,
 * or when a marker has no payload at all). The output is surfaced as `byType`
 * in the JSON schema for historical reasons; callers wanting to group by the
 * schema type should use `--group-by type`.
 *
 * Optionally applies auto-grouping or custom grouping.
 */
function aggregateMarkersByName(
  markers: Marker[],
  markerIndexes: MarkerIndex[],
  threadIndexes: Set<number>,
  markerMap: MarkerMap,
  getMarkerLabel: (markerIndex: MarkerIndex) => string,
  categories: CategoryList,
  markerSchemaByName: MarkerSchemaByName,
  stringTable: StringTable,
  autoGroup: boolean = false,
  maxTopMarkers: number = 5
): MarkerNameStats[] {
  // Convert Set to number if needed
  const groups = new Map<
    string,
    Array<{ marker: Marker; index: MarkerIndex }>
  >();

  for (const markerIndex of markerIndexes) {
    const marker = markers[markerIndex];
    const markerName = marker.name;

    if (!groups.has(markerName)) {
      groups.set(markerName, []);
    }
    groups.get(markerName)!.push({ marker, index: markerIndex });
  }

  const stats: MarkerNameStats[] = [];

  for (const [markerName, markerGroup] of groups.entries()) {
    const markerList = markerGroup.map((g) => g.marker);
    const hasEnd = markerList.some((m) => m.end !== null);
    const durationStats = hasEnd ? computeDurationStats(markerList) : undefined;
    const rateStats = computeRateStats(markerList);

    // Get top N markers by duration (or just first N for instant markers)
    const topMarkers = createTopMarkersArray(
      markerGroup,
      threadIndexes,
      markerMap,
      getMarkerLabel,
      maxTopMarkers
    );

    // Apply auto-grouping if enabled
    let subGroups: MarkerGroup[] | undefined;
    let subGroupKey: string | undefined;
    if (autoGroup && markerList.length > 5) {
      const fieldInfo = analyzeFieldVariance(
        markerList,
        markerSchemaByName,
        stringTable
      );
      if (fieldInfo) {
        // Sub-group by the field with highest variance
        subGroups = groupMarkers(
          markerGroup,
          [{ field: fieldInfo.field }],
          categories,
          markerSchemaByName,
          stringTable,
          threadIndexes,
          markerMap,
          getMarkerLabel,
          1,
          maxTopMarkers
        );
        subGroupKey = fieldInfo.field;
      }
    }

    stats.push({
      markerName: markerName,
      count: markerList.length,
      isInterval: hasEnd,
      durationStats,
      rateStats,
      topMarkers,
      subGroups,
      subGroupKey,
    });
  }

  // Sort by count descending
  stats.sort((a, b) => b.count - a.count);

  return stats;
}

/**
 * Aggregate markers by category. Keyed on the raw category index so that two
 * categories sharing a name stay separate in the output, and so callers don't
 * need an O(n) findIndex lookup to recover the index by name.
 */
function aggregateMarkersByCategory(
  markers: Marker[],
  markerIndexes: MarkerIndex[],
  categories: CategoryList
): Array<{
  categoryIndex: number;
  categoryName: string;
  count: number;
  percentage: number;
}> {
  const counts = new Map<number, number>();

  for (const markerIndex of markerIndexes) {
    const marker = markers[markerIndex];
    counts.set(marker.category, (counts.get(marker.category) ?? 0) + 1);
  }

  const total = markerIndexes.length;
  return Array.from(counts.entries())
    .map(([categoryIndex, count]) => ({
      categoryIndex,
      categoryName: categories[categoryIndex]?.name ?? 'Unknown',
      count,
      percentage: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Collect thread markers data in structured format for JSON output.
 */
export function collectThreadMarkers(
  store: Store,
  threadMap: ThreadMap,
  markerMap: MarkerMap,
  threadHandle?: string,
  filterOptions: MarkerFilterOptions = {}
): ThreadMarkersResult {
  // Apply marker search filter if provided
  const searchString = filterOptions.searchString || '';
  if (searchString) {
    store.dispatch(changeMarkersSearchString(searchString));
  }

  try {
    // Get state after potentially dispatching the search action
    const state = store.getState();
    const threadIndexes =
      threadHandle !== undefined
        ? threadMap.threadIndexesForHandle(threadHandle)
        : getSelectedThreadIndexes(state);

    const threadSelectors = getThreadSelectors(threadIndexes);
    const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
    const fullMarkerList = threadSelectors.getFullMarkerList(state);
    const categories = getCategories(state);
    const markerSchemaByName = getMarkerSchemaByName(state);
    const stringTable = getStringTable(state);

    // Get marker indexes - use search-filtered if search is active, otherwise all markers
    const originalCount =
      threadSelectors.getFullMarkerListIndexes(state).length;
    let filteredIndexes = searchString
      ? threadSelectors.getSearchFilteredMarkerIndexes(state)
      : threadSelectors.getFullMarkerListIndexes(state);

    // Apply all marker filters
    filteredIndexes = applyMarkerFilters(
      filteredIndexes,
      fullMarkerList,
      categories,
      filterOptions
    );

    // Get label getter for markers
    const getMarkerLabel = getLabelGetter(
      (markerIndex: MarkerIndex) => fullMarkerList[markerIndex],
      getProfile(state).meta.markerSchema,
      markerSchemaByName,
      categories,
      stringTable,
      'tableLabel'
    );

    // Generate thread handle for display
    const displayThreadHandle =
      threadHandle ?? threadMap.handleForThreadIndexes(threadIndexes);

    const { groupBy, autoGroup, topN } = filterOptions;
    const maxTopMarkers = topN ?? 5;

    // Handle custom grouping if groupBy is specified
    let customGroups: MarkerGroupData[] | undefined;
    if (groupBy) {
      const groupingKeys = parseGroupingKeys(groupBy);
      const markerGroups: Array<{ marker: Marker; index: MarkerIndex }> = [];
      for (const markerIndex of filteredIndexes) {
        markerGroups.push({
          marker: fullMarkerList[markerIndex],
          index: markerIndex,
        });
      }

      const groups = groupMarkers(
        markerGroups,
        groupingKeys,
        categories,
        markerSchemaByName,
        stringTable,
        threadIndexes,
        markerMap,
        getMarkerLabel,
        0,
        maxTopMarkers
      );

      // Add markerIndex to topMarkers in groups
      customGroups = addMarkerIndexToGroups(groups);
    }

    // Aggregate by type (with optional auto-grouping)
    const nameStats = aggregateMarkersByName(
      fullMarkerList,
      filteredIndexes,
      threadIndexes,
      markerMap,
      getMarkerLabel,
      categories,
      markerSchemaByName,
      stringTable,
      autoGroup || false,
      maxTopMarkers
    );

    // Convert nameStats to include markerIndex
    const byType = nameStats.map((stats) => ({
      markerName: stats.markerName,
      count: stats.count,
      isInterval: stats.isInterval,
      durationStats: stats.durationStats,
      rateStats: stats.rateStats,
      topMarkers: stats.topMarkers.map((m) => ({
        handle: m.handle,
        label: m.label,
        start: m.start,
        duration: m.duration,
        hasStack: m.hasStack,
      })),
      subGroups: stats.subGroups
        ? addMarkerIndexToGroups(stats.subGroups)
        : undefined,
      subGroupKey: stats.subGroupKey,
    }));

    // Aggregate by category (using filtered indexes)
    const categoryStats = aggregateMarkersByCategory(
      fullMarkerList,
      filteredIndexes,
      categories
    );

    const byCategory = categoryStats.map((stats) => ({
      categoryName: stats.categoryName,
      categoryIndex: stats.categoryIndex,
      count: stats.count,
      percentage: stats.percentage,
    }));

    // Build filters object (only include if filters were applied)
    const { minDuration, maxDuration, category, hasStack, limit } =
      filterOptions;
    const filters =
      searchString ||
      minDuration !== undefined ||
      maxDuration !== undefined ||
      category !== undefined ||
      hasStack ||
      limit !== undefined
        ? {
            searchString: searchString || undefined,
            minDuration,
            maxDuration,
            category,
            hasStack,
            limit,
          }
        : undefined;

    let flatMarkers: FlatMarkerItem[] | undefined;
    if (filterOptions.list) {
      flatMarkers = [];
      const listIndexes =
        limit !== undefined ? filteredIndexes.slice(0, limit) : filteredIndexes;
      for (const markerIndex of listIndexes) {
        const marker = fullMarkerList[markerIndex];
        const handle = markerMap.handleForMarker(threadIndexes, markerIndex);
        const duration =
          marker.end !== null ? marker.end - marker.start : undefined;
        const hasStack = Boolean(
          marker.data && 'cause' in marker.data && marker.data.cause
        );
        const categoryName = categories[marker.category]?.name ?? 'Other';
        const label = getMarkerLabel(markerIndex);
        flatMarkers.push({
          handle,
          name: marker.name,
          label: label || marker.name,
          start: marker.start,
          duration,
          hasStack,
          category: categoryName,
        });
      }
    }

    return {
      type: 'thread-markers',
      threadHandle: displayThreadHandle,
      friendlyThreadName,
      totalMarkerCount: originalCount,
      filteredMarkerCount: filteredIndexes.length,
      filters,
      byType,
      byCategory,
      customGroups,
      flatMarkers,
    };
  } finally {
    // Always clear the search string to avoid affecting other queries
    if (searchString) {
      store.dispatch(changeMarkersSearchString(''));
    }
  }
}

/**
 * Helper to add markerIndex to topMarkers in MarkerGroup arrays.
 */
function addMarkerIndexToGroups(groups: MarkerGroup[]): MarkerGroupData[] {
  return groups.map((group) => ({
    groupName: group.groupName,
    count: group.count,
    isInterval: group.isInterval,
    durationStats: group.durationStats,
    rateStats: group.rateStats,
    topMarkers: group.topMarkers.map((m) => ({
      handle: m.handle,
      label: m.label,
      start: m.start,
      duration: m.duration,
      hasStack: m.hasStack,
    })),
    subGroups: group.subGroups
      ? addMarkerIndexToGroups(group.subGroups)
      : undefined,
  }));
}

/**
 * Collect stack trace data in structured format.
 */
function collectStackTrace(
  stackIndex: IndexIntoStackTable | null,
  thread: Thread,
  libs: Lib[],
  capturedAt?: number
): StackTraceData | null {
  if (stackIndex === null) {
    return null;
  }

  const { stackTable, frameTable, funcTable, stringTable, resourceTable } =
    thread;
  const frames: StackTraceData['frames'] = [];

  let currentStackIndex: IndexIntoStackTable | null = stackIndex;
  while (currentStackIndex !== null) {
    const frameIndex = stackTable.frame[currentStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const funcName = stringTable.getString(funcTable.name[funcIndex]);
    const nameWithLibrary = formatFunctionNameWithLibrary(
      funcIndex,
      thread,
      libs
    );

    let library: string | undefined;
    const resourceIndex = funcTable.resource[funcIndex];
    if (resourceIndex !== -1) {
      const libIndex = resourceTable.lib[resourceIndex];
      if (libIndex !== null && libs) {
        library = libs[libIndex].name;
      }
    }

    frames.push({ name: funcName, nameWithLibrary, library });

    currentStackIndex = stackTable.prefix[currentStackIndex];
  }

  return {
    frames,
    truncated: false,
    capturedAt,
  };
}

/**
 * Collect marker stack trace data in structured format.
 */
export function collectMarkerStack(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  markerHandle: string
): MarkerStackResult {
  const state = store.getState();
  const { threadIndexes, markerIndex } =
    markerMap.markerForHandle(markerHandle);

  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const fullMarkerList = threadSelectors.getFullMarkerList(state);
  const marker = fullMarkerList[markerIndex];

  if (!marker) {
    throw new Error(`Marker ${markerHandle} not found`);
  }

  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);
  const profile = getProfile(state);
  const thread = threadSelectors.getFilteredThread(state);
  const libs = profile.libs;

  // Check if marker has a stack trace
  let stack: StackTraceData | null = null;
  if (marker.data && 'cause' in marker.data && marker.data.cause) {
    const cause = marker.data.cause;
    stack = collectStackTrace(cause.stack, thread, libs, cause.time);
  }

  return {
    type: 'marker-stack',
    markerHandle,
    markerIndex,
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    markerName: marker.name,
    stack,
  };
}

/**
 * Collect detailed marker information in structured format.
 */
export function collectMarkerInfo(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  markerHandle: string
): MarkerInfoResult {
  const state = store.getState();
  const { threadIndexes, markerIndex } =
    markerMap.markerForHandle(markerHandle);

  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const fullMarkerList = threadSelectors.getFullMarkerList(state);
  const marker = fullMarkerList[markerIndex];

  if (!marker) {
    throw new Error(`Marker ${markerHandle} not found`);
  }

  const categories = getCategories(state);
  const markerSchemaByName = getMarkerSchemaByName(state);
  const stringTable = getStringTable(state);
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);

  // Get tooltip label
  const getTooltipLabel = getLabelGetter(
    (mi: MarkerIndex) => fullMarkerList[mi],
    getProfile(state).meta.markerSchema,
    markerSchemaByName,
    categories,
    stringTable,
    'tooltipLabel'
  );
  const tooltipLabel = getTooltipLabel(markerIndex);

  // Collect marker fields
  let fields: MarkerInfoResult['fields'];
  let schemaInfo: MarkerInfoResult['schema'];

  if (marker.data) {
    const schema = markerSchemaByName[marker.data.type];
    if (schema && schema.fields.length > 0) {
      fields = [];
      for (const field of schema.fields) {
        if (field.hidden) {
          continue;
        }

        const value = (marker.data as any)[field.key];
        if (value !== undefined && value !== null) {
          const formattedValue = formatFromMarkerSchema(
            marker.data.type,
            field.format,
            value,
            stringTable
          );
          fields.push({
            key: field.key,
            label: field.label || field.key,
            value,
            formattedValue,
          });
        }
      }
    }

    // Include schema description if available
    if (schema?.description) {
      schemaInfo = { description: schema.description };
    }
  }

  // Collect stack trace if available (truncated to 20 frames)
  let stack: StackTraceData | undefined;
  if (marker.data && 'cause' in marker.data && marker.data.cause) {
    const cause = marker.data.cause;
    const profile = getProfile(state);
    const thread = threadSelectors.getFilteredThread(state);
    const libs = profile.libs;

    const fullStack = collectStackTrace(cause.stack, thread, libs, cause.time);
    if (fullStack && fullStack.frames.length > 0) {
      // Truncate to 20 frames
      const truncated = fullStack.frames.length > 20;
      stack = {
        frames: fullStack.frames.slice(0, 20),
        truncated,
        capturedAt: fullStack.capturedAt,
      };
    }
  }

  return {
    type: 'marker-info',
    markerHandle,
    markerIndex,
    threadHandle: threadHandleDisplay,
    friendlyThreadName,
    name: marker.name,
    tooltipLabel: tooltipLabel || undefined,
    markerType: marker.data?.type,
    category: {
      index: marker.category,
      name: categories[marker.category]?.name ?? 'Unknown',
    },
    start: marker.start,
    end: marker.end,
    duration: marker.end !== null ? marker.end - marker.start : undefined,
    fields,
    schema: schemaInfo,
    stack,
  };
}

function buildNetworkPhases(data: NetworkPayload): NetworkPhaseTimings {
  const phases: NetworkPhaseTimings = {};
  if (
    data.domainLookupStart !== undefined &&
    data.domainLookupEnd !== undefined
  ) {
    phases.dns = data.domainLookupEnd - data.domainLookupStart;
  }
  if (data.connectStart !== undefined && data.tcpConnectEnd !== undefined) {
    phases.tcp = data.tcpConnectEnd - data.connectStart;
  }
  if (
    data.secureConnectionStart !== undefined &&
    data.secureConnectionStart > 0 &&
    data.connectEnd !== undefined
  ) {
    phases.tls = data.connectEnd - data.secureConnectionStart;
  }
  if (data.requestStart !== undefined && data.responseStart !== undefined) {
    phases.ttfb = data.responseStart - data.requestStart;
  }
  if (data.responseStart !== undefined && data.responseEnd !== undefined) {
    phases.download = data.responseEnd - data.responseStart;
  }
  if (data.responseEnd !== undefined) {
    phases.mainThread = data.endTime - data.responseEnd;
  }
  return phases;
}

export function collectThreadNetwork(
  store: Store,
  threadMap: ThreadMap,
  threadHandle?: string,
  filterOptions: {
    searchString?: string;
    minDuration?: number;
    maxDuration?: number;
    limit?: number;
  } = {}
): ThreadNetworkResult {
  const { searchString, minDuration, maxDuration, limit } = filterOptions;

  const state = store.getState();
  const threadIndexes =
    threadHandle !== undefined
      ? threadMap.threadIndexesForHandle(threadHandle)
      : getSelectedThreadIndexes(state);

  const threadSelectors = getThreadSelectors(threadIndexes);
  const friendlyThreadName = threadSelectors.getFriendlyThreadName(state);
  const fullMarkerList = threadSelectors.getFullMarkerList(state);
  const allMarkerIndexes = threadSelectors.getFullMarkerListIndexes(state);

  // Filter to completed (STOP) network markers only.
  // STOP markers are the merged markers that carry full timing data.
  const stopIndexes = allMarkerIndexes.filter((i) => {
    const m = fullMarkerList[i];
    if (!isNetworkMarker(m)) {
      return false;
    }
    const data = m.data as NetworkPayload;
    return data.status === 'STATUS_STOP';
  });
  const totalRequestCount = stopIndexes.length;

  // Apply filters
  let filteredIndexes = stopIndexes;

  if (searchString) {
    const lowerSearch = searchString.toLowerCase();
    filteredIndexes = filteredIndexes.filter((i) => {
      const data = fullMarkerList[i].data as NetworkPayload;
      return data.URI.toLowerCase().includes(lowerSearch);
    });
  }

  if (minDuration !== undefined || maxDuration !== undefined) {
    filteredIndexes = filteredIndexes.filter((i) => {
      const data = fullMarkerList[i].data as NetworkPayload;
      const duration = data.endTime - data.startTime;
      if (minDuration !== undefined && duration < minDuration) {
        return false;
      }
      if (maxDuration !== undefined && duration > maxDuration) {
        return false;
      }
      return true;
    });
  }

  const filteredRequestCount = filteredIndexes.length;

  // Accumulate summary stats across all filtered requests (before limit)
  const phaseTotals: NetworkPhaseTimings = {};
  let cacheHit = 0;
  let cacheMiss = 0;
  let cacheUnknown = 0;

  for (const i of filteredIndexes) {
    const data = fullMarkerList[i].data as NetworkPayload;
    const cache = data.cache;
    if (cache === 'Hit' || cache === 'MemoryHit' || cache === 'Prefetched') {
      cacheHit++;
    } else if (
      cache === 'Miss' ||
      cache === 'Unresolved' ||
      cache === 'DiskStorage' ||
      cache === 'Push'
    ) {
      cacheMiss++;
    } else {
      cacheUnknown++;
    }

    const phases = buildNetworkPhases(data);
    if (phases.dns !== undefined) {
      phaseTotals.dns = (phaseTotals.dns ?? 0) + phases.dns;
    }
    if (phases.tcp !== undefined) {
      phaseTotals.tcp = (phaseTotals.tcp ?? 0) + phases.tcp;
    }
    if (phases.tls !== undefined) {
      phaseTotals.tls = (phaseTotals.tls ?? 0) + phases.tls;
    }
    if (phases.ttfb !== undefined) {
      phaseTotals.ttfb = (phaseTotals.ttfb ?? 0) + phases.ttfb;
    }
    if (phases.download !== undefined) {
      phaseTotals.download = (phaseTotals.download ?? 0) + phases.download;
    }
    if (phases.mainThread !== undefined) {
      phaseTotals.mainThread =
        (phaseTotals.mainThread ?? 0) + phases.mainThread;
    }
  }

  // Apply limit after accumulating summary stats.
  // limit === 0 means "show all" (no limit).
  const limitedIndexes =
    limit !== undefined && limit > 0
      ? filteredIndexes.slice(0, limit)
      : filteredIndexes;

  // Build per-request entries
  const requests: NetworkRequestEntry[] = limitedIndexes.map((i) => {
    const data = fullMarkerList[i].data as NetworkPayload;
    const duration = data.endTime - data.startTime;

    return {
      url: data.URI,
      httpStatus: data.responseStatus,
      httpVersion: data.httpVersion,
      cacheStatus: data.cache,
      transferSizeKB: data.count !== undefined ? data.count / 1024 : undefined,
      startTime: data.startTime,
      duration,
      phases: buildNetworkPhases(data),
    };
  });

  const displayThreadHandle =
    threadHandle ?? threadMap.handleForThreadIndexes(threadIndexes);

  return {
    type: 'thread-network',
    threadHandle: displayThreadHandle,
    friendlyThreadName,
    totalRequestCount,
    filteredRequestCount,
    filters:
      searchString !== undefined ||
      minDuration !== undefined ||
      maxDuration !== undefined ||
      limit !== undefined
        ? { searchString, minDuration, maxDuration, limit }
        : undefined,
    summary: {
      cacheHit,
      cacheMiss,
      cacheUnknown,
      phaseTotals,
    },
    requests,
  };
}

export function collectProfileLogs(
  store: Store,
  threadMap: ThreadMap,
  filterOptions: {
    thread?: string;
    module?: string;
    level?: string;
    search?: string;
    limit?: number;
  } = {}
): ProfileLogsResult {
  const { module, level, search, limit } = filterOptions;
  const state = store.getState();
  const profile = getProfile(state);
  const profileStartTime = profile.meta.startTime;
  const stringArray = profile.shared.stringArray;

  // Resolve which thread indexes to include.
  const threadIndexes: Set<number> | null =
    filterOptions.thread !== undefined
      ? new Set(threadMap.threadIndexesForHandle(filterOptions.thread))
      : null;

  // Map level filter string to the numeric threshold.
  const LEVEL_NAMES: Record<string, number> = {
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
    verbose: 5,
  };
  const maxLevel =
    level !== undefined ? (LEVEL_NAMES[level.toLowerCase()] ?? 5) : 5;

  const lowerModule = module?.toLowerCase();
  const lowerSearch = search?.toLowerCase();

  const entries: string[] = [];

  for (
    let threadIndex = 0;
    threadIndex < profile.threads.length;
    threadIndex++
  ) {
    if (threadIndexes !== null && !threadIndexes.has(threadIndex)) {
      continue;
    }
    const thread = profile.threads[threadIndex];
    const { markers } = thread;
    const processName = thread.processName ?? 'Unknown Process';
    const pid = thread.pid;
    const threadName = thread.name;

    for (let i = 0; i < markers.length; i++) {
      const startTime = markers.startTime[i];
      if (startTime === null) {
        continue;
      }

      const data = markers.data[i];
      if (data?.type !== 'Log') {
        continue;
      }

      const logData = data as LogMarkerPayload;
      let moduleName: string;
      let message: string;
      let levelLetter: string;

      if ('message' in logData) {
        if (!logData.message) {
          continue;
        }
        moduleName = stringArray[markers.name[i]] ?? '';
        const levelStr = stringArray[logData.level] ?? '';
        levelLetter = LOG_LEVEL_STRING_TO_LETTER[levelStr] ?? 'D';
        message = logData.message.trim();
      } else {
        if (!logData.name) {
          continue;
        }
        // Legacy format: data.module is either "D/nsHttp" or just "nsHttp".
        const rawModule = logData.module;
        const slashIdx = rawModule.indexOf('/');
        if (slashIdx !== -1) {
          levelLetter = rawModule.slice(0, slashIdx);
          moduleName = rawModule.slice(slashIdx + 1);
        } else {
          levelLetter = 'D';
          moduleName = rawModule;
        }
        message = logData.name.trim();
      }

      if (
        lowerModule !== undefined &&
        !moduleName.toLowerCase().includes(lowerModule)
      ) {
        continue;
      }

      if ((LOG_LETTER_TO_LEVEL[levelLetter] ?? 5) > maxLevel) {
        continue;
      }

      if (
        lowerSearch !== undefined &&
        !message.toLowerCase().includes(lowerSearch)
      ) {
        continue;
      }

      const timestampStr = formatLogTimestamp(profileStartTime + startTime);
      const formatted = formatLogStatement(
        timestampStr,
        processName,
        pid,
        threadName,
        logData,
        moduleName,
        stringArray
      );
      if (formatted !== null) {
        entries.push(formatted);
      }
    }
  }

  // Lexicographic sort equals chronological order since the timestamp prefix
  // is ISO-like ("YYYY-MM-DD HH:MM:SS..."), matching extractGeckoLogs behavior.
  entries.sort();

  const totalCount = entries.length;
  const limitedEntries =
    limit !== undefined ? entries.slice(0, limit) : entries;

  return {
    type: 'profile-logs',
    entries: limitedEntries,
    totalCount,
    filters:
      filterOptions.thread !== undefined ||
      module !== undefined ||
      level !== undefined ||
      search !== undefined ||
      limit !== undefined
        ? { thread: filterOptions.thread, module, level, search, limit }
        : undefined,
  };
}
