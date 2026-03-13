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
import { formatTimestamp } from 'firefox-profiler/utils/format-numbers';
import { changeMarkersSearchString } from '../../actions/profile-view';
import {
  formatFunctionNameWithLibrary,
  truncateFunctionName,
} from '../function-list';
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
} from 'firefox-profiler/types';
import type {
  MarkerStackResult,
  MarkerInfoResult,
  StackTraceData,
  ThreadMarkersResult,
  MarkerGroupData,
  DurationStats,
  RateStats,
  MarkerFilterOptions,
} from '../types';

/**
 * Aggregated statistics for a group of markers.
 */
interface MarkerTypeStats {
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
 * Format a duration in milliseconds to a human-readable string.
 * Exported for testing.
 */
export function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(2)}μs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
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

  const { minDuration, maxDuration, category, hasStack, limit } = filterOptions;

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

  // Apply limit if specified (after all filters)
  if (limit !== undefined && filteredIndexes.length > limit) {
    filteredIndexes = filteredIndexes.slice(0, limit);
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
  const hasEnd = items.some((item) => item.marker.end !== null);

  // Get top markers - sort by duration if interval markers, otherwise take first N
  const sortedItems = hasEnd
    ? [...items].sort(
        (a, b) =>
          b.marker.end! - b.marker.start - (a.marker.end! - a.marker.start)
      )
    : items.slice(0, maxCount);

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
  categories: CategoryList
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
  return String(fieldValue);
}

/**
 * Analyze field variance for a group of markers to determine if sub-grouping would be useful.
 * Returns the best field for grouping based on a scoring heuristic, or null if none found.
 *
 * Scoring heuristic:
 * - Prefers fields with a moderate number of unique values (3-20 ideal)
 * - Avoids fields with too many unique values (likely IDs or timestamps)
 * - Avoids fields with too few unique values (not enough variety)
 * - Prefers fields that appear in most markers (>80%)
 * - Excludes fields that look like IDs (end with "ID" or "Id")
 * - Prefers fields with semantic names (type, event, phase, status, etc.)
 */
function analyzeFieldVariance(
  markers: Marker[]
): { field: string; variance: number } | null {
  if (markers.length === 0) {
    return null;
  }

  // Get the marker schema for the first marker to find available fields
  const firstMarkerType = markers[0].data?.type;
  if (!firstMarkerType) {
    return null;
  }

  // Analyze each field to find the one with best score
  const fieldScores: Array<{
    field: string;
    score: number;
    uniqueCount: number;
  }> = [];

  // Get all field keys from the first marker's data
  const sampleData = markers[0].data;
  if (!sampleData) {
    return null;
  }

  const fieldKeys = Object.keys(sampleData).filter((key) => {
    // Exclude metadata fields
    if (key === 'type' || key === 'cause') {
      return false;
    }
    // Exclude fields that look like IDs (end with "ID" or "Id")
    if (key.endsWith('ID') || key.endsWith('Id')) {
      return false;
    }
    return true;
  });

  for (const fieldKey of fieldKeys) {
    const uniqueValues = new Set<string>();
    let validCount = 0;

    for (const marker of markers) {
      const value = (marker.data as any)?.[fieldKey];
      if (value !== undefined && value !== null) {
        uniqueValues.add(String(value));
        validCount++;
      }
    }

    const uniqueCount = uniqueValues.size;

    // Skip fields that don't appear frequently enough
    if (validCount < markers.length * 0.8) {
      continue;
    }

    // Skip fields with too few unique values (< 3)
    if (uniqueCount < 3) {
      continue;
    }

    // Calculate score based on how good this field is for grouping
    // Prefer fields with 3-20 unique values (ideal range)
    let score = 0;
    if (uniqueCount >= 3 && uniqueCount <= 20) {
      // Ideal range: score 100
      score = 100;
    } else if (uniqueCount > 20 && uniqueCount <= 50) {
      // Acceptable range: score decreases with more unique values
      score = 100 - (uniqueCount - 20) * 2;
    } else if (uniqueCount > 50) {
      // Too many unique values (likely IDs): very low score
      score = 10;
    }

    // Boost score for fields that appear in all markers
    if (validCount === markers.length) {
      score += 10;
    }

    // Boost score for semantically meaningful field names
    const semanticFields = [
      'eventType',
      'phase',
      'status',
      'operation',
      'category',
    ];
    if (semanticFields.includes(fieldKey)) {
      score += 20;
    }

    fieldScores.push({ field: fieldKey, score, uniqueCount });
  }

  // Return the field with highest score
  if (fieldScores.length === 0) {
    return null;
  }

  fieldScores.sort((a, b) => b.score - a.score);
  return { field: fieldScores[0].field, variance: fieldScores[0].score / 100 };
}

/**
 * Format marker groups hierarchically and append to the lines array.
 */
function formatMarkerGroups(
  lines: string[],
  groups: MarkerGroup[],
  indentLevel: number,
  maxGroups: number = 15
): void {
  const indent = '  '.repeat(indentLevel);
  const topGroups = groups.slice(0, maxGroups);

  for (const group of topGroups) {
    let line = `${indent}${group.groupName.padEnd(25)} ${group.count.toString().padStart(5)} markers`;

    if (group.durationStats) {
      const { min, avg, max } = group.durationStats;
      line += `  (interval: min=${formatDuration(min)}, avg=${formatDuration(avg)}, max=${formatDuration(max)})`;
    } else if (group.isInterval) {
      line += '  (interval)';
    } else {
      line += '  (instant)';
    }

    lines.push(line);

    // Recursively format sub-groups
    if (group.subGroups && group.subGroups.length > 0) {
      formatMarkerGroups(lines, group.subGroups, indentLevel + 1, 10);
    }
  }

  if (groups.length > maxGroups) {
    lines.push(`${indent}... (${groups.length - maxGroups} more groups)`);
  }
}

/**
 * Group markers by a sequence of grouping keys (multi-level grouping).
 * Returns a hierarchical structure of groups.
 */
function groupMarkers(
  markerGroup: Array<{ marker: Marker; index: MarkerIndex }>,
  groupingKeys: GroupingKey[],
  categories: CategoryList,
  threadIndexes: Set<number>,
  markerMap: MarkerMap,
  getMarkerLabel: (markerIndex: MarkerIndex) => string,
  depth: number = 0
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
    const groupValue = getGroupingValue(item.marker, currentKey, categories);
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
      getMarkerLabel
    );

    // Recursively group by remaining keys (limit depth to 3)
    const subGroups =
      remainingKeys.length > 0 && depth < 2
        ? groupMarkers(
            items,
            remainingKeys,
            categories,
            threadIndexes,
            markerMap,
            getMarkerLabel,
            depth + 1
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
 * Aggregate markers by type and compute statistics.
 * Optionally applies auto-grouping or custom grouping.
 */
function aggregateMarkersByType(
  markers: Marker[],
  markerIndexes: MarkerIndex[],
  threadIndexes: Set<number>,
  markerMap: MarkerMap,
  getMarkerLabel: (markerIndex: MarkerIndex) => string,
  categories: CategoryList,
  autoGroup: boolean = false
): MarkerTypeStats[] {
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

  const stats: MarkerTypeStats[] = [];

  for (const [markerName, markerGroup] of groups.entries()) {
    const markerList = markerGroup.map((g) => g.marker);
    const hasEnd = markerList.some((m) => m.end !== null);
    const durationStats = hasEnd ? computeDurationStats(markerList) : undefined;
    const rateStats = computeRateStats(markerList);

    // Get top 5 markers by duration (or just first 5 for instant markers)
    const topMarkers = createTopMarkersArray(
      markerGroup,
      threadIndexes,
      markerMap,
      getMarkerLabel
    );

    // Apply auto-grouping if enabled
    let subGroups: MarkerGroup[] | undefined;
    let subGroupKey: string | undefined;
    if (autoGroup && markerList.length > 5) {
      const fieldInfo = analyzeFieldVariance(markerList);
      if (fieldInfo) {
        // Sub-group by the field with highest variance
        subGroups = groupMarkers(
          markerGroup,
          [{ field: fieldInfo.field }],
          categories,
          threadIndexes,
          markerMap,
          getMarkerLabel,
          1
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
 * Aggregate markers by category.
 */
function aggregateMarkersByCategory(
  markers: Marker[],
  markerIndexes: MarkerIndex[],
  categories: CategoryList
): Array<{ categoryName: string; count: number; percentage: number }> {
  const groups = new Map<string, number>();

  for (const markerIndex of markerIndexes) {
    const marker = markers[markerIndex];
    const categoryName = categories[marker.category]?.name ?? 'Unknown';

    groups.set(categoryName, (groups.get(categoryName) ?? 0) + 1);
  }

  const total = markerIndexes.length;
  const stats = Array.from(groups.entries())
    .map(([categoryName, count]) => ({
      categoryName,
      count,
      percentage: (count / total) * 100,
    }))
    .sort((a, b) => b.count - a.count);

  return stats;
}

/**
 * Format the marker listing for a thread.
 */
export function formatThreadMarkers(
  store: Store,
  threadMap: ThreadMap,
  markerMap: MarkerMap,
  threadHandle?: string,
  filterOptions: MarkerFilterOptions = {}
): string {
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

    const lines: string[] = [];

    // Generate thread handle for display
    const displayThreadHandle =
      threadHandle ?? threadMap.handleForThreadIndexes(threadIndexes);

    // Check if filters are active
    const { minDuration, maxDuration, category, hasStack, limit } =
      filterOptions;
    const hasFilters =
      !!searchString ||
      minDuration !== undefined ||
      maxDuration !== undefined ||
      category !== undefined ||
      hasStack ||
      limit !== undefined;
    const filterSuffix =
      hasFilters && filteredIndexes.length !== originalCount
        ? ` (filtered from ${originalCount})`
        : '';

    lines.push(
      `Markers in thread ${displayThreadHandle} (${friendlyThreadName}) — ${filteredIndexes.length} markers${filterSuffix}\n`
    );

    if (filteredIndexes.length === 0) {
      if (hasFilters) {
        lines.push('No markers match the specified filters.');
      } else {
        lines.push('No markers in this thread.');
      }
      return lines.join('\n');
    }

    const { groupBy, autoGroup } = filterOptions;

    // Handle custom grouping if groupBy is specified
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
        threadIndexes,
        markerMap,
        getMarkerLabel,
        0
      );

      // Format and display hierarchical groups
      formatMarkerGroups(lines, groups, 0);
    } else {
      // Default aggregation by type (with optional auto-grouping)
      const typeStats = aggregateMarkersByType(
        fullMarkerList,
        filteredIndexes,
        threadIndexes,
        markerMap,
        getMarkerLabel,
        categories,
        autoGroup || false
      );

      // Show top 15 marker names
      lines.push('By Name (top 15):');
      const topTypes = typeStats.slice(0, 15);
      for (const stats of topTypes) {
        let line = `  ${stats.markerName.padEnd(25)} ${stats.count.toString().padStart(5)} markers`;

        if (stats.durationStats) {
          const { min, avg, max } = stats.durationStats;
          line += `  (interval: min=${formatDuration(min)}, avg=${formatDuration(avg)}, max=${formatDuration(max)})`;
        } else {
          line += '  (instant)';
        }

        lines.push(line);

        // Show top markers with handles (for easy inspection)
        if (!stats.subGroups && stats.topMarkers.length > 0) {
          const handleList = stats.topMarkers
            .slice(0, 3)
            .map((m) => {
              const handleOnly = m.handle;
              if (m.duration !== undefined) {
                return `${handleOnly} (${formatDuration(m.duration)})`;
              }
              return handleOnly;
            })
            .join(', ');
          lines.push(`    Examples: ${handleList}`);
        }

        // Show sub-groups if present (from auto-grouping)
        if (stats.subGroups && stats.subGroups.length > 0) {
          if (stats.subGroupKey) {
            lines.push(`    Grouped by ${stats.subGroupKey}:`);
          }
          formatMarkerGroups(lines, stats.subGroups, 2);
        }
      }

      if (typeStats.length > 15) {
        lines.push(`  ... (${typeStats.length - 15} more types)`);
      }

      lines.push('');

      // Aggregate by category (using filtered indexes)
      const categoryStats = aggregateMarkersByCategory(
        fullMarkerList,
        filteredIndexes,
        categories
      );

      lines.push('By Category:');
      for (const stats of categoryStats) {
        lines.push(
          `  ${stats.categoryName.padEnd(25)} ${stats.count.toString().padStart(5)} markers (${stats.percentage.toFixed(1)}%)`
        );
      }

      lines.push('');

      // Frequency analysis for top types
      lines.push('Frequency Analysis:');
      const topRateTypes = typeStats
        .filter((s) => s.rateStats && s.rateStats.markersPerSecond > 0)
        .slice(0, 5);

      for (const stats of topRateTypes) {
        if (!stats.rateStats) continue;
        const { markersPerSecond, minGap, avgGap, maxGap } = stats.rateStats;
        lines.push(
          `  ${stats.markerName}: ${markersPerSecond.toFixed(1)} markers/sec (interval: min=${formatDuration(minGap)}, avg=${formatDuration(avgGap)}, max=${formatDuration(maxGap)})`
        );
      }

      lines.push('');
    }

    lines.push(
      'Use --search <term>, --category <name>, --min-duration <ms>, --max-duration <ms>, --has-stack, --limit <N>, --group-by <keys>, or --auto-group to filter/group markers, or m-<N> handles to inspect individual markers.'
    );

    return lines.join('\n');
  } finally {
    // Always clear the search string to avoid affecting other queries
    if (searchString) {
      store.dispatch(changeMarkersSearchString(''));
    }
  }
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

    const { groupBy, autoGroup } = filterOptions;

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
        threadIndexes,
        markerMap,
        getMarkerLabel,
        0
      );

      // Add markerIndex to topMarkers in groups
      customGroups = addMarkerIndexToGroups(groups);
    }

    // Aggregate by type (with optional auto-grouping)
    const typeStats = aggregateMarkersByType(
      fullMarkerList,
      filteredIndexes,
      threadIndexes,
      markerMap,
      getMarkerLabel,
      categories,
      autoGroup || false
    );

    // Convert typeStats to include markerIndex
    const byType = typeStats.map((stats) => ({
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
      categoryIndex: categories.findIndex(
        (cat) => cat?.name === stats.categoryName
      ),
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
 * Format a marker's cause stack trace.
 * Returns an array of formatted stack frame strings.
 */
function formatMarkerStack(
  stackIndex: IndexIntoStackTable | null,
  thread: Thread,
  libs: Lib[],
  maxFrames: number = 20
): string[] {
  if (stackIndex === null) {
    return ['(no stack trace)'];
  }

  const { stackTable, frameTable } = thread;
  const frames: string[] = [];

  // Walk up the stack table to collect all frames
  let currentStackIndex: IndexIntoStackTable | null = stackIndex;
  while (currentStackIndex !== null) {
    const frameIndex = stackTable.frame[currentStackIndex];
    const funcIndex = frameTable.func[frameIndex];
    const funcName = formatFunctionNameWithLibrary(funcIndex, thread, libs);
    frames.push(funcName);
    currentStackIndex = stackTable.prefix[currentStackIndex];
  }

  const lines: string[] = [];
  const totalFrames = frames.length;

  if (totalFrames === 0) {
    return ['(empty stack)'];
  }

  // Show up to maxFrames, with ellipsis if there are more
  const framesToShow = Math.min(totalFrames, maxFrames);
  for (let i = 0; i < framesToShow; i++) {
    const displayName = truncateFunctionName(frames[i], 100);
    lines.push(`  [${i + 1}] ${displayName}`);
  }

  if (totalFrames > maxFrames) {
    lines.push(`  ... (${totalFrames - maxFrames} more frames)`);
  }

  return lines;
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

  // Walk up the stack table to collect all frames
  let currentStackIndex: IndexIntoStackTable | null = stackIndex;
  while (currentStackIndex !== null) {
    const frameIndex = stackTable.frame[currentStackIndex];
    const funcIndex = frameTable.func[frameIndex];

    // Get function name
    const funcName = stringTable.getString(funcTable.name[funcIndex]);

    // Get library name if available
    const resourceIndex = funcTable.resource[funcIndex];
    let library: string | undefined;
    let nameWithLibrary = funcName;

    if (resourceIndex !== -1) {
      const libIndex = resourceTable.lib[resourceIndex];
      if (libIndex !== null && libs) {
        const lib = libs[libIndex];
        library = lib.name;
        nameWithLibrary = `${library}!${funcName}`;
      } else {
        const resourceName = stringTable.getString(
          resourceTable.name[resourceIndex]
        );
        if (resourceName && resourceName !== funcName) {
          nameWithLibrary = `${resourceName}!${funcName}`;
        }
      }
    }

    frames.push({
      name: funcName,
      nameWithLibrary,
      library,
    });

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

/**
 * Format a marker's full stack trace.
 * Shows all frames without limit.
 */
export function formatMarkerStackFull(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  markerHandle: string
): string {
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

  const lines: string[] = [];
  const threadHandleDisplay = threadMap.handleForThreadIndexes(threadIndexes);

  lines.push(`Stack trace for marker ${markerHandle}: ${marker.name}\n`);
  lines.push(`Thread: ${threadHandleDisplay} (${friendlyThreadName})`);

  // Check if marker has a stack trace
  if (!marker.data || !('cause' in marker.data) || !marker.data.cause) {
    lines.push('\n(This marker has no stack trace)');
    return lines.join('\n');
  }

  const cause = marker.data.cause;
  const profile = getProfile(state);
  const thread = threadSelectors.getFilteredThread(state);
  const libs = profile.libs;

  if (cause.time !== undefined) {
    const causeTimeStr = formatTimestamp(cause.time);
    lines.push(`Captured at: ${causeTimeStr}\n`);
  }

  const stackLines = formatMarkerStack(cause.stack, thread, libs, Infinity);
  lines.push(...stackLines);

  return lines.join('\n');
}

/**
 * Format detailed information about a specific marker.
 */
export function formatMarkerInfo(
  store: Store,
  markerMap: MarkerMap,
  threadMap: ThreadMap,
  markerHandle: string
): string {
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

  const lines: string[] = [];
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

  lines.push(
    `Marker ${markerHandle}: ${marker.name}${tooltipLabel ? ` - ${tooltipLabel}` : ''}\n`
  );

  // Basic info
  lines.push(`Type: ${marker.data?.type ?? 'None'}`);
  lines.push(`Category: ${categories[marker.category]?.name ?? 'Unknown'}`);

  const startStr = formatTimestamp(marker.start);
  if (marker.end !== null) {
    const endStr = formatTimestamp(marker.end);
    const duration = marker.end - marker.start;
    lines.push(`Time: ${startStr} - ${endStr} (${formatDuration(duration)})`);
  } else {
    lines.push(`Time: ${startStr} (instant)`);
  }

  lines.push(`Thread: ${threadHandleDisplay} (${friendlyThreadName})`);

  // Marker data fields
  if (marker.data) {
    const schema = markerSchemaByName[marker.data.type];
    if (schema && schema.fields.length > 0) {
      lines.push('\nFields:');
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
          lines.push(`  ${field.label || field.key}: ${formattedValue}`);
        }
      }
    }

    // Show description if available
    if (schema?.description) {
      lines.push(`\nDescription:`);
      lines.push(`  ${schema.description}`);
    }
  }

  // Show stack trace if available
  if (marker.data && 'cause' in marker.data && marker.data.cause) {
    const cause = marker.data.cause;
    const profile = getProfile(state);
    const thread = threadSelectors.getFilteredThread(state);
    const libs = profile.libs;

    lines.push('\nStack trace:');
    if (cause.time !== undefined) {
      const causeTimeStr = formatTimestamp(cause.time);
      lines.push(`  Captured at: ${causeTimeStr}`);
    }

    const stackLines = formatMarkerStack(cause.stack, thread, libs, 20);
    lines.push(...stackLines);

    if (stackLines.length > 21) {
      lines.push(
        `\nUse 'pq marker stack ${markerHandle}' for the full stack trace.`
      );
    }
  }

  return lines.join('\n');
}
