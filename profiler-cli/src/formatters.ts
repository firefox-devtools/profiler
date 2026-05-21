/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Text formatters for CommandResult types.
 * These functions convert structured JSON results into human-readable text output.
 */

import type {
  StatusResult,
  SessionContext,
  WithContext,
  FunctionExpandResult,
  FunctionInfoResult,
  FunctionAnnotateResult,
  ViewRangeResult,
  FilterStackResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadFunctionsResult,
  ThreadNetworkResult,
  ThreadPageLoadResult,
  NetworkPhaseTimings,
  MarkerGroupData,
  CallTreeNode,
  FilterEntry,
  SampleFilterSpec,
  ProfileLogsResult,
  ThreadSelectResult,
} from './protocol';
import { truncateFunctionName } from '../../src/profile-query/function-list';
import { describeSpec } from '../../src/profile-query/filter-stack';
import { formatTimestamp as formatDuration } from 'firefox-profiler/utils/format-numbers';

// Maximum display width for function names in call-tree and sample views.
const FUNC_NAME_WIDTH = 120;

/**
 * Format a SessionContext as a compact header line.
 * Shows current thread selection, zoom range, and full profile duration.
 */
export function formatContextHeader(
  context: SessionContext,
  activeFilters?: FilterEntry[],
  ephemeralFilters?: SampleFilterSpec[]
): string {
  // Thread info
  let threadInfo = 'No thread selected';
  if (context.selectedThreadHandle && context.selectedThreads.length > 0) {
    if (context.selectedThreads.length === 1) {
      const thread = context.selectedThreads[0];
      threadInfo = `${context.selectedThreadHandle} (${thread.name})`;
    } else {
      const names = context.selectedThreads
        .map((t: { name: string }) => t.name)
        .join(', ');
      threadInfo = `${context.selectedThreadHandle} (${names})`;
    }
  }

  // View range info
  const rootDuration = context.rootRange.end - context.rootRange.start;

  let viewInfo = 'Full profile';
  if (context.currentViewRange) {
    const range = context.currentViewRange;
    const rangeDuration = range.end - range.start;
    viewInfo = `${range.startName}→${range.endName} (${formatDuration(rangeDuration)})`;
  }

  const fullInfo = formatDuration(rootDuration);

  const totalFilterCount =
    (activeFilters?.length ?? 0) + (ephemeralFilters?.length ?? 0);
  const filterInfo =
    totalFilterCount > 0 ? ` | Filters: ${totalFilterCount}` : '';
  return `[Thread: ${threadInfo} | View: ${viewInfo} | Full: ${fullInfo}${filterInfo}]`;
}

/**
 * Format a StatusResult as plain text.
 */
export function formatStatusResult(result: StatusResult): string {
  let threadInfo = 'No thread selected';
  if (result.selectedThreadHandle && result.selectedThreads.length > 0) {
    if (result.selectedThreads.length === 1) {
      const thread = result.selectedThreads[0];
      threadInfo = `${result.selectedThreadHandle} (${thread.name})`;
    } else {
      const names = result.selectedThreads.map((t) => t.name).join(', ');
      threadInfo = `${result.selectedThreadHandle} (${names})`;
    }
  }

  let rangesInfo = 'Full profile';
  if (result.viewRanges.length > 0) {
    const rangeStrs = result.viewRanges.map((range) => {
      return `${range.startName} to ${range.endName}`;
    });
    rangesInfo = rangeStrs.join(' > ');
  }

  const filterLines: string[] = [];
  for (const stack of result.filterStacks) {
    if (stack.filters.length === 0) {
      continue;
    }
    filterLines.push(`  Filters for ${stack.threadHandle}:`);
    for (const f of stack.filters) {
      filterLines.push(`    ${f.index}. ${f.description}`);
    }
  }
  const filterSection =
    filterLines.length > 0
      ? '\n' + filterLines.join('\n')
      : '\n  Filters: none';

  return `\
Session Status:
  Selected thread: ${threadInfo}
  View range: ${rangesInfo}${filterSection}`;
}

/**
 * Format a FilterStackResult as plain text.
 */
export function formatFilterStackResult(result: FilterStackResult): string {
  const lines: string[] = [];
  if (result.message) {
    lines.push(result.message);
  }
  if (result.filters.length === 0) {
    lines.push(`No active filters for ${result.threadHandle}`);
  } else {
    lines.push(`Filters for ${result.threadHandle} (applied in order):`);
    for (const f of result.filters) {
      lines.push(`  ${f.index}. ${f.description}`);
    }
  }
  return lines.join('\n');
}

/**
 * Format a FunctionExpandResult as plain text.
 */
export function formatFunctionExpandResult(
  result: WithContext<FunctionExpandResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  return `${contextHeader}

Function ${result.functionHandle}:
${result.fullName}`;
}

/**
 * Format a FunctionInfoResult as plain text.
 */
export function formatFunctionInfoResult(
  result: WithContext<FunctionInfoResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Function ${result.functionHandle}:
  Full name: ${result.fullName}
  Short name: ${result.name}
  Is JS: ${result.isJS}
  Relevant for JS: ${result.relevantForJS}`;

  if (result.resource) {
    output += `\n  Resource: ${result.resource.name}`;
  }

  if (result.library) {
    output += `\n  Library: ${result.library.name}`;
    output += `\n  Library path: ${result.library.path}`;
    if (result.library.debugName) {
      output += `\n  Debug name: ${result.library.debugName}`;
    }
    if (result.library.debugPath) {
      output += `\n  Debug path: ${result.library.debugPath}`;
    }
    if (result.library.breakpadId) {
      output += `\n  Breakpad ID: ${result.library.breakpadId}`;
    }
  }

  return output;
}

/**
 * Format a ViewRangeResult as plain text.
 */
export function formatViewRangeResult(result: ViewRangeResult): string {
  // Start with the basic message
  let output = result.message;

  // For 'push' action, add enhanced information if available
  if (result.action === 'push' && result.duration !== undefined) {
    output += ` (duration: ${formatDuration(result.duration)})`;

    // If this is a marker zoom, show marker details
    if (result.markerInfo) {
      output += `\n  Zoomed to: Marker ${result.markerInfo.markerHandle} - ${result.markerInfo.markerName}`;
      output += `\n  Thread: ${result.markerInfo.threadHandle} (${result.markerInfo.threadName})`;
    }

    // Show zoom depth if available
    if (result.zoomDepth !== undefined) {
      output += `\n  Zoom depth: ${result.zoomDepth}${result.zoomDepth > 1 ? ' (use "profiler-cli zoom pop" to go back)' : ''}`;
    }
  }

  if (result.warning) {
    output += `\nWarning: ${result.warning}`;
  }

  return output;
}

/**
 * Format a ThreadInfoResult as plain text.
 */
export function formatThreadInfoResult(
  result: WithContext<ThreadInfoResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  const endedAtStr = result.endedAtName || 'still alive at end of recording';

  let output = `${contextHeader}

Name: ${result.friendlyName}
TID: ${result.tid}
Created at: ${result.createdAtName}
Ended at: ${endedAtStr}

This thread contains ${result.sampleCount} samples and ${result.markerCount} markers.

CPU activity over time:`;

  if (result.cpuActivity && result.cpuActivity.length > 0) {
    for (const activity of result.cpuActivity) {
      const indent = '  '.repeat(activity.depthLevel);
      const duration = activity.endTime - activity.startTime;
      const percentage =
        duration > 0 ? Math.round((activity.cpuMs / duration) * 100) : 0;
      output += `\n${indent}- ${percentage}% for ${activity.cpuMs.toFixed(1)}ms: [${activity.startTimeName} → ${activity.endTimeName}] (${activity.startTimeStr} - ${activity.endTimeStr})`;
    }
  } else {
    output += '\nNo significant activity.';
  }

  return output;
}

/**
 * Format a MarkerStackResult as plain text.
 */
export function formatMarkerStackResult(
  result: WithContext<MarkerStackResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Stack trace for marker ${result.markerHandle}: ${result.markerName}\n`;
  output += `Thread: ${result.threadHandle} (${result.friendlyThreadName})`;

  if (!result.stack || result.stack.frames.length === 0) {
    return output + '\n\n(This marker has no stack trace)';
  }

  if (result.stack.capturedAt !== undefined) {
    const rootStart = result.context.rootRange.start;
    output += `\nCaptured at: ${formatDuration(result.stack.capturedAt - rootStart)}\n`;
  }

  for (let i = 0; i < result.stack.frames.length; i++) {
    const frame = result.stack.frames[i];
    output += `\n  [${i + 1}] ${frame.nameWithLibrary}`;
  }

  if (result.stack.truncated) {
    output += '\n  ... (truncated)';
  }

  return output;
}

/**
 * Format a MarkerInfoResult as plain text.
 */
export function formatMarkerInfoResult(
  result: WithContext<MarkerInfoResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Marker ${result.markerHandle}: ${result.name}`;
  if (result.tooltipLabel) {
    output += ` - ${result.tooltipLabel}`;
  }
  output += '\n\n';

  // Basic info
  output += `Type: ${result.markerType ?? 'None'}\n`;
  output += `Category: ${result.category.name}\n`;

  // Time and duration (relative to profile root start)
  const rootStart = result.context.rootRange.start;
  const startStr = formatDuration(result.start - rootStart);
  if (result.end !== null) {
    const endStr = formatDuration(result.end - rootStart);
    const durationStr = formatDuration(result.duration!);
    output += `Time: ${startStr} - ${endStr} (${durationStr})\n`;
  } else {
    output += `Time: ${startStr} (instant)\n`;
  }

  output += `Thread: ${result.threadHandle} (${result.friendlyThreadName})\n`;

  // Marker data fields
  if (result.fields && result.fields.length > 0) {
    output += '\nFields:\n';
    for (const field of result.fields) {
      output += `  ${field.label}: ${field.formattedValue}\n`;
    }
  }

  // Schema description
  if (result.schema?.description) {
    output += '\nDescription:\n';
    output += `  ${result.schema.description}\n`;
  }

  // Stack trace (truncated to 20 frames)
  if (result.stack && result.stack.frames.length > 0) {
    output += '\nStack trace:\n';
    if (result.stack.capturedAt !== undefined) {
      output += `  Captured at: ${formatDuration(result.stack.capturedAt - rootStart)}\n`;
    }

    for (let i = 0; i < result.stack.frames.length; i++) {
      const frame = result.stack.frames[i];
      output += `  [${i + 1}] ${frame.nameWithLibrary}\n`;
    }

    if (result.stack.truncated) {
      output += `\nUse 'profiler-cli marker stack ${result.markerHandle}' for the full stack trace.\n`;
    }
  }

  return output;
}

/**
 * Format a ProfileInfoResult as plain text.
 */
export function formatProfileInfoResult(
  result: WithContext<ProfileInfoResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Name: ${result.name}\n`;
  output += `Platform: ${result.platform}\n\n`;
  output += `This profile contains ${result.threadCount} threads across ${result.processCount} processes.\n`;

  if (result.processes.length === 0) {
    output += '\n(CPU time information not available)';
    return output;
  }

  let processesHeading: string;
  if (result.searchQuery !== undefined) {
    processesHeading = `Processes and threads matching '${result.searchQuery}':`;
  } else if (result.showAll) {
    processesHeading = 'All processes and threads by CPU usage:';
  } else {
    processesHeading = 'Top processes and threads by CPU usage:';
  }
  output += `\n${processesHeading}\n`;

  for (const process of result.processes) {
    // Format process timing information
    let timingInfo = '';
    if (process.startTime !== undefined && process.startTimeName) {
      if (process.endTime !== null && process.endTimeName !== null) {
        timingInfo = ` [${process.startTimeName} → ${process.endTimeName}]`;
      } else {
        timingInfo = ` [${process.startTimeName} → end]`;
      }
    }

    const etld1Suffix = process.etld1 ? ` [${process.etld1}]` : '';
    output += `  p-${process.processIndex}: ${process.name}${etld1Suffix} [pid ${process.pid}]${timingInfo} - ${process.cpuMs.toFixed(3)}ms\n`;

    for (const thread of process.threads) {
      output += `    ${thread.threadHandle}: ${thread.name} [tid ${thread.tid}] - ${thread.cpuMs.toFixed(3)}ms\n`;
    }

    if (process.remainingThreads) {
      output += `    + ${process.remainingThreads.count} more threads with combined CPU time ${process.remainingThreads.combinedCpuMs.toFixed(3)}ms and max CPU time ${process.remainingThreads.maxCpuMs.toFixed(3)}ms (use --all to see all)\n`;
    }
  }

  if (result.remainingProcesses) {
    output += `  + ${result.remainingProcesses.count} more processes with combined CPU time ${result.remainingProcesses.combinedCpuMs.toFixed(3)}ms and max CPU time ${result.remainingProcesses.maxCpuMs.toFixed(3)}ms (use --all to see all)\n`;
  }

  output += '\nCPU activity over time:\n';

  if (result.cpuActivity && result.cpuActivity.length > 0) {
    for (const activity of result.cpuActivity) {
      const indent = '  '.repeat(activity.depthLevel);
      const duration = activity.endTime - activity.startTime;
      const percentage =
        duration > 0 ? Math.round((activity.cpuMs / duration) * 100) : 0;
      output += `${indent}- ${percentage}% for ${activity.cpuMs.toFixed(1)}ms: [${activity.startTimeName} → ${activity.endTimeName}] (${activity.startTimeStr} - ${activity.endTimeStr})\n`;
    }
  } else {
    output += 'No significant activity.\n';
  }

  return output;
}

/**
 * Helper function to format a call tree node recursively.
 *
 * This formatter uses a "stack fragment" approach for single-child chains:
 * - Root-level nodes always indent their children with tree symbols
 * - Single-child continuations are rendered without tree symbols (as stack fragments)
 * - Only nodes with multiple children use tree symbols to show branching
 */
function formatCallTreeNode(
  node: CallTreeNode,
  baseIndent: string,
  useTreeSymbol: boolean,
  isLastSibling: boolean,
  depth: number,
  lines: string[]
): void {
  const totalPct = node.totalPercentage.toFixed(1);
  const selfPct = node.selfPercentage.toFixed(1);
  const displayName = truncateFunctionName(
    node.nameWithLibrary,
    FUNC_NAME_WIDTH
  );

  // Build the line prefix
  let linePrefix: string;
  if (useTreeSymbol) {
    const symbol = isLastSibling ? '└─ ' : '├─ ';
    linePrefix = baseIndent + symbol;
  } else {
    linePrefix = baseIndent;
  }

  // Add function handle prefix if available
  const handlePrefix = node.functionHandle ? `${node.functionHandle}. ` : '';

  lines.push(
    `${linePrefix}${handlePrefix}${displayName} [total: ${totalPct}%, self: ${selfPct}%]`
  );

  // Handle children and truncation
  const hasChildren = node.children && node.children.length > 0;
  const hasTruncatedChildren = node.childrenTruncated;

  if (hasChildren || hasTruncatedChildren) {
    // Calculate the base indent for children
    let childBaseIndent: string;
    if (useTreeSymbol) {
      // We used a tree symbol, so children need appropriate spine continuation
      const spine = isLastSibling ? '   ' : '│  ';
      childBaseIndent = baseIndent + spine;
    } else {
      // We didn't use a tree symbol (stack fragment), children keep the same base indent
      childBaseIndent = baseIndent;
    }

    if (hasChildren) {
      const hasMultipleChildren =
        node.children.length > 1 || !!hasTruncatedChildren;

      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const isLast = i === node.children.length - 1 && !hasTruncatedChildren;

        // Children use tree symbols if:
        // - There are multiple children (branching), OR
        // - We're at root level (depth 0) - root children always get tree symbols
        const childUsesTreeSymbol = hasMultipleChildren || depth === 0;

        formatCallTreeNode(
          child,
          childBaseIndent,
          childUsesTreeSymbol,
          isLast,
          depth + 1,
          lines
        );
      }
    }

    // Show combined elision info if children were omitted or depth limit reached
    // Combine both types of elision into a single marker
    if (hasTruncatedChildren) {
      const truncPrefix = childBaseIndent + '└─ ';
      const truncInfo = node.childrenTruncated!;
      const combinedPct = truncInfo.combinedPercentage.toFixed(1);
      const maxPct = truncInfo.maxPercentage.toFixed(1);
      lines.push(
        `${truncPrefix}... (${truncInfo.count} more children: combined ${combinedPct}%, max ${maxPct}%)`
      );
    }
  }
}

/**
 * Helper function to format a call tree.
 */
function formatCallTree(
  tree: CallTreeNode,
  title: string,
  emptyMessage?: string
): string {
  const lines: string[] = [`${title} Call Tree:`];

  // The root node is virtual, so format its children
  if (tree.children && tree.children.length > 0) {
    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      const isLast = i === tree.children.length - 1;
      // Root-level nodes don't use tree symbols (they are the starting points)
      formatCallTreeNode(child, '', false, isLast, 0, lines);
    }
  } else if (emptyMessage) {
    lines.push(emptyMessage);
  }

  return lines.join('\n');
}

function formatSamplesPreamble(result: {
  context: SessionContext;
  activeFilters?: FilterEntry[];
  ephemeralFilters?: SampleFilterSpec[];
  activeOnly?: boolean;
  search?: string;
  friendlyThreadName: string;
}): string {
  const contextHeader = formatContextHeader(
    result.context,
    result.activeFilters,
    result.ephemeralFilters
  );
  const activeOnlyNote = result.activeOnly
    ? 'Note: active samples only (idle excluded) — use --include-idle to include idle samples.\n\n'
    : '';
  const searchNote = result.search ? `Search: "${result.search}"\n\n` : '';
  const filtersParts: string[] = [
    ...(result.activeFilters?.map((f) => `[${f.index}] ${f.description}`) ??
      []),
    ...(result.ephemeralFilters?.map((f) => `[~] ${describeSpec(f)}`) ?? []),
  ];
  const filtersNote =
    filtersParts.length > 0 ? `Filters: ${filtersParts.join(', ')}\n\n` : '';
  return `${contextHeader}\n\nThread: ${result.friendlyThreadName}\n\n${activeOnlyNote}${searchNote}${filtersNote}`;
}

/**
 * Format a ThreadSamplesResult as plain text.
 */
export function formatThreadSamplesResult(
  result: WithContext<ThreadSamplesResult>
): string {
  let output = formatSamplesPreamble(result);

  if (result.search && result.topFunctionsByTotal.length === 0) {
    output +=
      `No samples matched --search "${result.search}".\n` +
      'Tip: --search keeps samples with a matching frame anywhere in the stack.\n' +
      '     Use comma to require multiple terms (all must appear), e.g. --search "foo,bar".\n' +
      '     "|" is treated as a literal character, not OR.\n';
    return output;
  }

  // Top functions by total time
  output += 'Top Functions (by total time):\n';
  output +=
    '  (For a call tree starting from these functions, use: profiler-cli thread samples-top-down)\n\n';
  for (const func of result.topFunctionsByTotal) {
    const totalCount = Math.round(func.totalSamples);
    const totalPct = func.totalPercentage.toFixed(1);
    const displayName = truncateFunctionName(
      func.nameWithLibrary,
      FUNC_NAME_WIDTH
    );
    output += `  ${func.functionHandle}. ${displayName} - total: ${totalCount} (${totalPct}%)\n`;
  }

  output += '\n';

  // Top functions by self time
  output += 'Top Functions (by self time):\n';
  output +=
    '  (For a call tree showing what calls these functions, use: profiler-cli thread samples-bottom-up)\n\n';
  for (const func of result.topFunctionsBySelf) {
    const selfCount = Math.round(func.selfSamples);
    const selfPct = func.selfPercentage.toFixed(1);
    const displayName = truncateFunctionName(
      func.nameWithLibrary,
      FUNC_NAME_WIDTH
    );
    output += `  ${func.functionHandle}. ${displayName} - self: ${selfCount} (${selfPct}%)\n`;
  }

  output += '\n';

  // Heaviest stack
  const stack = result.heaviestStack;
  output += `Heaviest stack (${stack.selfSamples.toFixed(1)} samples, ${stack.frameCount} frames):\n`;

  if (stack.frames.length === 0) {
    output += '  (empty)\n';
  } else if (stack.frameCount <= 200) {
    // Show all frames
    for (let i = 0; i < stack.frames.length; i++) {
      const frame = stack.frames[i];
      const displayName = truncateFunctionName(
        frame.nameWithLibrary,
        FUNC_NAME_WIDTH
      );
      const totalCount = Math.round(frame.totalSamples);
      const totalPct = frame.totalPercentage.toFixed(1);
      const selfCount = Math.round(frame.selfSamples);
      const selfPct = frame.selfPercentage.toFixed(1);
      output += `  ${i + 1}. ${displayName} - total: ${totalCount} (${totalPct}%), self: ${selfCount} (${selfPct}%)\n`;
    }
  } else {
    // Show first 100
    for (let i = 0; i < 100; i++) {
      const frame = stack.frames[i];
      const displayName = truncateFunctionName(
        frame.nameWithLibrary,
        FUNC_NAME_WIDTH
      );
      const totalCount = Math.round(frame.totalSamples);
      const totalPct = frame.totalPercentage.toFixed(1);
      const selfCount = Math.round(frame.selfSamples);
      const selfPct = frame.selfPercentage.toFixed(1);
      output += `  ${i + 1}. ${displayName} - total: ${totalCount} (${totalPct}%), self: ${selfCount} (${selfPct}%)\n`;
    }

    // Show placeholder for skipped frames
    const skippedCount = stack.frameCount - 200;
    output += `  ... (${skippedCount} frames skipped)\n`;

    // Show last 100
    for (let i = stack.frameCount - 100; i < stack.frameCount; i++) {
      const frame = stack.frames[i];
      const displayName = truncateFunctionName(
        frame.nameWithLibrary,
        FUNC_NAME_WIDTH
      );
      const totalCount = Math.round(frame.totalSamples);
      const totalPct = frame.totalPercentage.toFixed(1);
      const selfCount = Math.round(frame.selfSamples);
      const selfPct = frame.selfPercentage.toFixed(1);
      output += `  ${i + 1}. ${displayName} - total: ${totalCount} (${totalPct}%), self: ${selfCount} (${selfPct}%)\n`;
    }
  }

  return output;
}

/**
 * Format a ThreadSamplesTopDownResult as plain text.
 */
export function formatThreadSamplesTopDownResult(
  result: WithContext<ThreadSamplesTopDownResult>
): string {
  let output = formatSamplesPreamble(result);

  // Top-down call tree
  const topDownEmpty = result.search
    ? `No samples matched --search "${result.search}".\n` +
      'Tip: use comma to require multiple terms (all must appear), e.g. --search "foo,bar".\n' +
      '     "|" is treated as a literal character, not OR.'
    : undefined;
  output += formatCallTree(result.regularCallTree, 'Top-Down', topDownEmpty);

  return output;
}

/**
 * Format a ThreadSamplesBottomUpResult as plain text.
 */
export function formatThreadSamplesBottomUpResult(
  result: WithContext<ThreadSamplesBottomUpResult>
): string {
  let output = formatSamplesPreamble(result);

  // Bottom-up call tree (inverted tree shows callers)
  if (result.invertedCallTree) {
    const bottomUpEmpty = result.search
      ? `No samples matched --search "${result.search}".\n` +
        'Tip: use comma to require multiple terms (all must appear), e.g. --search "foo,bar".\n' +
        '     "|" is treated as a literal character, not OR.'
      : undefined;
    output += formatCallTree(
      result.invertedCallTree,
      'Bottom-Up',
      bottomUpEmpty
    );
  } else {
    output += 'Bottom-Up Call Tree:\n  (unable to create bottom-up tree)';
  }

  return output;
}

/**
 * Format a ThreadMarkersResult as plain text.
 */
export function formatThreadMarkersResult(
  result: WithContext<ThreadMarkersResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  const lines: string[] = [contextHeader, ''];

  // Check if filters are active
  const hasFilters = result.filters !== undefined;
  const filterSuffix =
    hasFilters && result.filteredMarkerCount !== result.totalMarkerCount
      ? ` (filtered from ${result.totalMarkerCount})`
      : '';

  lines.push(
    `Markers in thread ${result.threadHandle} (${result.friendlyThreadName}) — ${result.filteredMarkerCount} markers${filterSuffix}`
  );
  lines.push('Legend: ✓ = has stack trace, ✗ = no stack trace\n');

  if (result.filteredMarkerCount === 0) {
    if (hasFilters) {
      lines.push('No markers match the specified filters.');
    } else {
      lines.push('No markers in this thread.');
    }
    return lines.join('\n');
  }

  // Flat list mode: one row per marker in chronological order
  if (result.flatMarkers) {
    const rootStart = result.context.rootRange.start;
    for (const m of result.flatMarkers) {
      const stackIndicator = m.hasStack ? '✓' : '✗';
      const startStr = `t=${formatDuration(m.start - rootStart)}`;
      const durationStr =
        m.duration !== undefined ? formatDuration(m.duration) : 'instant';
      const labelSuffix = m.label !== m.name ? `  ${m.label}` : '';
      lines.push(
        `  ${m.handle.padEnd(8)}  ${m.name.padEnd(30)}  ${startStr.padEnd(14)}  ${durationStr.padEnd(10)}  ${stackIndicator}${labelSuffix}`
      );
    }
    return lines.join('\n');
  }

  // Handle custom grouping if present
  if (result.customGroups && result.customGroups.length > 0) {
    formatMarkerGroupsForDisplay(lines, result.customGroups, 0);
  } else {
    // Default aggregation by marker name
    const W_STAT_NAME = 25;
    const W_STAT_COUNT = 5;
    lines.push('By Name (top 15):');
    const topTypes = result.byType.slice(0, 15);
    for (const stats of topTypes) {
      let line = `  ${stats.markerName.padEnd(W_STAT_NAME)} ${stats.count.toString().padStart(W_STAT_COUNT)} markers`;

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
            const stackIndicator = m.hasStack ? '✓' : '✗';
            const handleWithIndicator = `${m.handle} ${stackIndicator}`;
            if (m.duration !== undefined) {
              return `${handleWithIndicator} (${formatDuration(m.duration)})`;
            }
            return handleWithIndicator;
          })
          .join(', ');
        lines.push(`    Examples: ${handleList}`);
      }

      // Show sub-groups if present (from auto-grouping)
      if (stats.subGroups && stats.subGroups.length > 0) {
        if (stats.subGroupKey) {
          lines.push(`    Grouped by ${stats.subGroupKey}:`);
        }
        formatMarkerGroupsForDisplay(lines, stats.subGroups, 2);
      }
    }

    if (result.byType.length > 15) {
      lines.push(`  ... (${result.byType.length - 15} more marker names)`);
    }

    lines.push('');

    // Aggregate by category
    lines.push('By Category:');
    for (const stats of result.byCategory) {
      lines.push(
        `  ${stats.categoryName.padEnd(W_STAT_NAME)} ${stats.count.toString().padStart(W_STAT_COUNT)} markers (${stats.percentage.toFixed(1)}%)`
      );
    }

    lines.push('');

    // Frequency analysis for top markers
    lines.push('Frequency Analysis:');
    const topRateTypes = result.byType
      .filter((s) => s.rateStats && s.rateStats.markersPerSecond > 0)
      .slice(0, 5);

    for (const stats of topRateTypes) {
      if (!stats.rateStats) {
        continue;
      }
      const { markersPerSecond, minGap, avgGap, maxGap } = stats.rateStats;
      lines.push(
        `  ${stats.markerName}: ${markersPerSecond.toFixed(1)} markers/sec (interval: min=${formatDuration(minGap)}, avg=${formatDuration(avgGap)}, max=${formatDuration(maxGap)})`
      );
    }

    lines.push('');
  }

  lines.push(
    'Use --search <term>, --category <name>, --min-duration <ms>, --max-duration <ms>, --has-stack, --limit <N>, --group-by <keys>, --auto-group, or --top-n <N> to filter/group markers, or m-<N> handles to inspect individual markers or zoom into their time range (profiler-cli zoom push m-<N>).'
  );

  return lines.join('\n');
}

/**
 * Helper function to format marker groups hierarchically.
 */
function formatMarkerGroupsForDisplay(
  lines: string[],
  groups: MarkerGroupData[],
  baseIndent: number
): void {
  for (const group of groups) {
    const indent = '  '.repeat(baseIndent);
    let line = `${indent}${group.groupName}: ${group.count} markers`;

    if (group.durationStats) {
      const { avg, max } = group.durationStats;
      line += ` (avg=${formatDuration(avg)}, max=${formatDuration(max)})`;
    }

    lines.push(line);

    // Show top markers if no sub-groups
    if (!group.subGroups && group.topMarkers.length > 0) {
      const handleList = group.topMarkers
        .slice(0, 3)
        .map((m) => {
          const stackIndicator = m.hasStack ? '✓' : '✗';
          const handleWithIndicator = `${m.handle} ${stackIndicator}`;
          if (m.duration !== undefined) {
            return `${handleWithIndicator} (${formatDuration(m.duration)})`;
          }
          return handleWithIndicator;
        })
        .join(', ');
      lines.push(`${indent}  Examples: ${handleList}`);
    }

    // Recursively format sub-groups
    if (group.subGroups && group.subGroups.length > 0) {
      formatMarkerGroupsForDisplay(lines, group.subGroups, baseIndent + 1);
    }
  }
}

/**
 * Format a ThreadFunctionsResult as plain text.
 */
export function formatThreadFunctionsResult(
  result: WithContext<ThreadFunctionsResult>
): string {
  const contextHeader = formatContextHeader(
    result.context,
    result.activeFilters,
    result.ephemeralFilters
  );
  const lines: string[] = [contextHeader, ''];

  // Check if filters are active
  const hasFilters = result.filters !== undefined;
  const filterSuffix =
    hasFilters && result.filteredFunctionCount !== result.totalFunctionCount
      ? ` (filtered from ${result.totalFunctionCount})`
      : '';

  lines.push(
    `Functions in thread ${result.threadHandle} (${result.friendlyThreadName}) — ${result.filteredFunctionCount} functions${filterSuffix}\n`
  );

  if (result.activeOnly) {
    lines.push(
      'Note: active samples only (idle excluded) — use --include-idle to include idle samples.\n'
    );
  }

  if (result.filteredFunctionCount === 0) {
    if (hasFilters) {
      lines.push('No functions match the specified filters.');
      if (result.filters?.searchString) {
        lines.push(
          'Tip: --search matches as a substring of the full function name (including library prefix).'
        );
      }
    } else {
      lines.push('No functions in this thread.');
    }
    return lines.join('\n');
  }

  // Show active filters if any
  const filterParts: string[] = [];
  if (hasFilters && result.filters) {
    if (result.filters.searchString) {
      filterParts.push(`search: "${result.filters.searchString}"`);
    }
    if (result.filters.minSelf !== undefined) {
      filterParts.push(`min-self: ${result.filters.minSelf}%`);
    }
    if (result.filters.limit !== undefined) {
      filterParts.push(`limit: ${result.filters.limit}`);
    }
  }
  if (result.activeFilters) {
    for (const f of result.activeFilters) {
      filterParts.push(`[${f.index}] ${f.description}`);
    }
  }
  if (result.ephemeralFilters) {
    for (const f of result.ephemeralFilters) {
      filterParts.push(`[~] ${describeSpec(f)}`);
    }
  }
  if (filterParts.length > 0) {
    lines.push(`Filters: ${filterParts.join(', ')}\n`);
  }

  // List functions sorted by self time
  lines.push('Functions (by self time):');
  for (const func of result.functions) {
    const selfCount = Math.round(func.selfSamples);
    const totalCount = Math.round(func.totalSamples);
    const displayName = truncateFunctionName(
      func.nameWithLibrary,
      FUNC_NAME_WIDTH
    );

    // Format percentages: show dual percentages when zoomed
    let selfPctStr: string;
    let totalPctStr: string;
    if (
      func.fullSelfPercentage !== undefined &&
      func.fullTotalPercentage !== undefined
    ) {
      // Zoomed: show both view and full percentages
      selfPctStr = `${func.selfPercentage.toFixed(1)}% of view, ${func.fullSelfPercentage.toFixed(1)}% of full`;
      totalPctStr = `${func.totalPercentage.toFixed(1)}% of view, ${func.fullTotalPercentage.toFixed(1)}% of full`;
    } else {
      // Not zoomed: show single percentage
      selfPctStr = `${func.selfPercentage.toFixed(1)}%`;
      totalPctStr = `${func.totalPercentage.toFixed(1)}%`;
    }

    lines.push(
      `  ${func.functionHandle}. ${displayName} - self: ${selfCount} (${selfPctStr}), total: ${totalCount} (${totalPctStr})`
    );
  }

  if (result.filteredFunctionCount > result.functions.length) {
    const omittedCount = result.filteredFunctionCount - result.functions.length;
    lines.push(`\n  ... (${omittedCount} more functions omitted)`);
  }

  lines.push('');
  lines.push(
    'Use --search <term>, --min-self <percent>, or --limit <N> to filter functions, or f-<N> handles to inspect individual functions.'
  );

  return lines.join('\n');
}

function formatNetworkPhases(phases: NetworkPhaseTimings): string {
  const parts: string[] = [];
  if (phases.dns !== undefined) {
    parts.push(`DNS=${formatDuration(phases.dns)}`);
  }
  if (phases.tcp !== undefined) {
    parts.push(`TCP=${formatDuration(phases.tcp)}`);
  }
  if (phases.tls !== undefined) {
    parts.push(`TLS=${formatDuration(phases.tls)}`);
  }
  if (phases.ttfb !== undefined) {
    parts.push(`TTFB=${formatDuration(phases.ttfb)}`);
  }
  if (phases.download !== undefined) {
    parts.push(`DL=${formatDuration(phases.download)}`);
  }
  if (phases.mainThread !== undefined) {
    parts.push(`wait=${formatDuration(phases.mainThread)}`);
  }
  return parts.join('  ');
}

export function formatThreadNetworkResult(
  result: WithContext<ThreadNetworkResult>
): string {
  const lines: string[] = [formatContextHeader(result.context), ''];

  const filterSuffix =
    result.filters !== undefined &&
    result.filteredRequestCount !== result.totalRequestCount
      ? ` (filtered from ${result.totalRequestCount})`
      : '';

  const truncated = result.requests.length < result.filteredRequestCount;
  const countStr = truncated
    ? `${result.requests.length} of ${result.filteredRequestCount} requests`
    : `${result.filteredRequestCount} requests`;

  lines.push(
    `Network requests in thread ${result.threadHandle} (${result.friendlyThreadName}) — ${countStr}${filterSuffix}`
  );
  lines.push('');

  // Summary
  const s = result.summary;
  lines.push('Summary:');
  lines.push(
    `  Cache: ${s.cacheHit} hit, ${s.cacheMiss} miss, ${s.cacheUnknown} unknown`
  );

  const pt = s.phaseTotals;
  const hasPhaseTotals =
    pt.dns !== undefined ||
    pt.tcp !== undefined ||
    pt.tls !== undefined ||
    pt.ttfb !== undefined ||
    pt.download !== undefined ||
    pt.mainThread !== undefined;

  if (hasPhaseTotals) {
    lines.push('  Phase totals:');
    if (pt.dns !== undefined) {
      lines.push(`    DNS:              ${formatDuration(pt.dns)}`);
    }
    if (pt.tcp !== undefined) {
      lines.push(`    TCP connect:      ${formatDuration(pt.tcp)}`);
    }
    if (pt.tls !== undefined) {
      lines.push(`    TLS:              ${formatDuration(pt.tls)}`);
    }
    if (pt.ttfb !== undefined) {
      lines.push(`    TTFB:             ${formatDuration(pt.ttfb)}`);
    }
    if (pt.download !== undefined) {
      lines.push(`    Download:         ${formatDuration(pt.download)}`);
    }
    if (pt.mainThread !== undefined) {
      lines.push(`    Main thread wait: ${formatDuration(pt.mainThread)}`);
    }
  }

  lines.push('');

  if (result.requests.length === 0) {
    lines.push('No network requests match the specified filters.');
    return lines.join('\n');
  }

  for (const req of result.requests) {
    const url = req.url.length > 100 ? req.url.slice(0, 97) + '...' : req.url;
    const status =
      req.httpStatus !== undefined ? String(req.httpStatus) : '???';
    const version = req.httpVersion !== undefined ? `  ${req.httpVersion}` : '';
    const cache =
      req.cacheStatus !== undefined ? `  cache=${req.cacheStatus}` : '';
    const size =
      req.transferSizeKB !== undefined
        ? `  size=${req.transferSizeKB.toFixed(1)}KB`
        : '';

    lines.push(`  ${url}`);
    lines.push(
      `    ${status}${version}${cache}${size}  duration=${formatDuration(req.duration)}`
    );

    const phaseStr = formatNetworkPhases(req.phases);
    if (phaseStr) {
      lines.push(`    Phases: ${phaseStr}`);
    }

    lines.push('');
  }

  if (truncated) {
    lines.push(
      `Use --limit 0 to show all requests, or --limit <N> to set a different limit.`
    );
  } else {
    lines.push(
      'Use --search <term>, --min-duration <ms>, --max-duration <ms>, or --limit <N> to filter.'
    );
  }

  return lines.join('\n');
}

export function formatFunctionAnnotateResult(
  result: WithContext<FunctionAnnotateResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  const out: string[] = [];
  const RULER = '─'.repeat(80);

  out.push(contextHeader, '');
  out.push(`Function ${result.functionHandle}: ${result.name}`);
  out.push(`Thread: ${result.friendlyThreadName} (${result.threadHandle})`, '');
  out.push(
    `Self time: ${Math.round(result.totalSelfSamples)} samples, ` +
      `Total time: ${Math.round(result.totalTotalSamples)} samples`
  );
  out.push(`Mode: ${result.mode}`);

  for (const w of result.warnings) {
    out.push('', `Warning: ${w}`);
  }

  // Source annotation
  const src = result.srcAnnotation;
  if (src) {
    const fileSuffix =
      src.totalFileLines !== null ? ` (${src.totalFileLines} lines)` : '';
    out.push('', `Source file: ${src.filename}${fileSuffix}`);
    out.push(
      `  ${Math.round(src.samplesWithLineInfo)} of ${Math.round(src.samplesWithFunction)} ` +
        `samples have line number information`
    );
    out.push(`  Showing: ${src.contextMode}`, '');

    const W_LINE = 5;
    const W_SELF = 6;
    const W_TOTAL = 7;

    out.push(
      `${'Line'.padStart(W_LINE)}  ${'Self'.padStart(W_SELF)}  ${'Total'.padStart(W_TOTAL)}  Source`
    );
    out.push(RULER);

    const showGaps = src.contextMode !== 'full file';
    let prevLine: number | null = null;
    for (const line of src.lines) {
      if (showGaps && prevLine !== null && line.lineNumber > prevLine + 1) {
        out.push(' '.repeat(W_LINE + 2) + '...');
      }
      prevLine = line.lineNumber;

      const selfStr =
        line.selfSamples > 0
          ? String(Math.round(line.selfSamples)).padStart(W_SELF)
          : ' '.repeat(W_SELF);
      const totalStr =
        line.totalSamples > 0
          ? String(Math.round(line.totalSamples)).padStart(W_TOTAL)
          : ' '.repeat(W_TOTAL);
      const srcText = line.sourceText !== null ? `  ${line.sourceText}` : '';
      out.push(
        `${String(line.lineNumber).padStart(W_LINE)}  ${selfStr}  ${totalStr}${srcText}`
      );
    }
  }

  // Assembly annotations
  for (const asm of result.asmAnnotations) {
    out.push('', `Compilation ${asm.compilationIndex}:`);
    out.push(`  Name: ${asm.symbolName}`);
    out.push(`  Address: 0x${asm.symbolAddress.toString(16)}`);
    if (asm.functionSize !== null) {
      out.push(`  Function size: ${asm.functionSize} bytes`);
    }
    out.push(`  Native symbols: ${asm.nativeSymbolCount}`);

    if (asm.fetchError !== null) {
      out.push(`  (Assembly unavailable: ${asm.fetchError})`);
      continue;
    }

    out.push('');
    out.push(
      `  ${'Address'.padEnd(18)}${'Self'.padStart(6)}  ${'Total'.padStart(7)}  Instruction`
    );
    out.push('  ' + '─'.repeat(70));

    for (const instr of asm.instructions) {
      const addrStr = `0x${instr.address.toString(16)}`.padEnd(18);
      const selfStr =
        instr.selfSamples > 0
          ? String(Math.round(instr.selfSamples)).padStart(6)
          : ' '.repeat(6);
      const totalStr =
        instr.totalSamples > 0
          ? String(Math.round(instr.totalSamples)).padStart(7)
          : ' '.repeat(7);
      out.push(`  ${addrStr}${selfStr}  ${totalStr}  ${instr.decodedString}`);
    }
  }

  if (
    result.srcAnnotation &&
    result.srcAnnotation.contextMode !== 'full file'
  ) {
    out.push(
      '',
      `Tip: use --context file to show the full source file, or --context <N> for more context lines.`
    );
  }

  return out.join('\n');
}

export function formatProfileLogsResult(
  result: WithContext<ProfileLogsResult>
): string {
  const lines: string[] = [formatContextHeader(result.context), ''];

  const { filters } = result;
  const isFiltered =
    filters !== undefined &&
    (filters.thread !== undefined ||
      filters.module !== undefined ||
      filters.level !== undefined ||
      filters.search !== undefined ||
      filters.limit !== undefined);

  const shown = result.entries.length;
  const total = result.totalCount;

  if (total === 0) {
    lines.push(
      isFiltered
        ? 'No log entries match the specified filters.'
        : 'No Log markers found in this profile.'
    );
    return lines.join('\n');
  }

  if (isFiltered && shown < total) {
    lines.push(`Showing ${shown} of ${total} log entries (filtered/limited)`);
  } else if (isFiltered) {
    lines.push(`${total} log entries (filtered)`);
  } else {
    lines.push(`${total} log entries`);
  }
  lines.push('');

  for (const entry of result.entries) {
    lines.push(entry);
  }

  return lines.join('\n');
}

export function formatThreadPageLoadResult(
  result: WithContext<ThreadPageLoadResult>
): string {
  const lines: string[] = [formatContextHeader(result.context), ''];

  if (result.navigationTotal === 0) {
    lines.push(
      'No page load markers found in this thread.',
      'Try a different thread or check that the profile includes a web page load.'
    );
    return lines.join('\n');
  }

  const navLabel =
    result.navigationTotal > 1
      ? `  [Navigation ${result.navigationIndex} of ${result.navigationTotal}]`
      : '';

  lines.push(
    `Page Load Summary — ${result.friendlyThreadName} (${result.threadHandle})${navLabel}`
  );
  lines.push('');

  if (result.url) {
    lines.push(`  URL: ${result.url}`);
    lines.push('');
  }

  // ── Navigation Timing ──────────────────────────────────────────────────────

  lines.push('──── Navigation Timing ────');
  lines.push('');

  const milestones = result.milestones;

  if (milestones.length === 0) {
    lines.push('  No navigation timing data available.');
  } else {
    const TIMELINE_WIDTH = 60;
    // Axis max = largest non-TTFI milestone. TTFI is shown with ▶ if it
    // exceeds this, since it's post-load and can dwarf everything else.
    const nonTtfiMilestones = milestones.filter((m) => m.name !== 'TTFI');
    const axisMax =
      nonTtfiMilestones.length > 0
        ? Math.max(...nonTtfiMilestones.map((m) => m.timeMs))
        : milestones[milestones.length - 1].timeMs;

    // Label column: name (right-aligned) + space + handle (left-aligned)
    const maxLabelLen = Math.max(...milestones.map((m) => m.name.length));
    const labelWidth = Math.max(maxLabelLen, 3);
    const maxHandleLen = Math.max(
      ...milestones.map((m) => m.markerHandle.length)
    );
    // Total prefix width before the bar: labelWidth + 1 (space) + maxHandleLen + 2 (gap)
    const prefixWidth = labelWidth + 1 + maxHandleLen + 2;

    // Time header line
    const startLabel = '0ms';
    const endLabel = `${Math.round(axisMax)}ms`;
    const padding = TIMELINE_WIDTH - startLabel.length - endLabel.length;
    lines.push(
      `  ${' '.repeat(prefixWidth)}${startLabel}${' '.repeat(Math.max(0, padding))}${endLabel}`
    );

    // Axis line
    lines.push(`  ${' '.repeat(prefixWidth)}${'─'.repeat(TIMELINE_WIDTH)}`);

    // One row per milestone
    for (const m of milestones) {
      const label = m.name.padStart(labelWidth);
      const handle = m.markerHandle.padEnd(maxHandleLen);
      let bar: string;
      if (m.timeMs > axisMax) {
        bar = '─'.repeat(TIMELINE_WIDTH) + '▶';
      } else {
        const pos =
          axisMax > 0
            ? Math.round((m.timeMs / axisMax) * TIMELINE_WIDTH)
            : TIMELINE_WIDTH;
        // Clamp to TIMELINE_WIDTH - 1 so │ always fits within the axis width
        const drawPos = Math.min(pos, TIMELINE_WIDTH - 1);
        bar = '─'.repeat(Math.max(0, drawPos)) + '│';
      }
      lines.push(`  ${label} ${handle}  ${bar}  ${formatDuration(m.timeMs)}`);
    }
  }

  lines.push('');

  // ── Resources ─────────────────────────────────────────────────────────────

  lines.push(`──── Resources (${result.resourceCount} requests) ────`);
  lines.push('');

  if (result.resourceCount === 0) {
    lines.push('  No network requests recorded during page load.');
  } else {
    if (result.resourceAvgMs !== null) {
      lines.push(`  Avg duration:  ${formatDuration(result.resourceAvgMs)}`);
    }
    if (result.resourceMaxMs !== null) {
      lines.push(`  Max duration:  ${formatDuration(result.resourceMaxMs)}`);
    }
    lines.push('');

    if (result.resourcesByType.length > 0) {
      const W_RTYPE = 8;
      const W_RCOUNT = 4;
      const W_PCT = 5;
      lines.push('  By type:');
      for (const t of result.resourcesByType) {
        const countStr = String(t.count).padStart(W_RCOUNT);
        const pctStr = t.percentage.toFixed(1).padStart(W_PCT);
        lines.push(`    ${t.type.padEnd(W_RTYPE)}  ${countStr}  (${pctStr}%)`);
      }
      lines.push('');
    }

    if (result.topResources.length > 0) {
      const W_NUM = 3;
      const W_DUR = 7;
      const W_FILE = 50;
      lines.push('  Top 10 longest:');
      result.topResources.forEach((r, idx) => {
        const num = String(idx + 1).padStart(W_NUM);
        const dur = formatDuration(r.durationMs).padStart(W_DUR);
        const file = r.filename.padEnd(W_FILE);
        lines.push(
          `  ${num}.  ${dur}   ${file}  ${r.resourceType}  ${r.markerHandle}`
        );
      });
    }
  }

  lines.push('');

  // ── CPU Categories ─────────────────────────────────────────────────────────

  lines.push(`──── CPU Categories (${result.totalSamples} samples) ────`);
  lines.push('');

  if (result.categories.length === 0) {
    lines.push('  No sample data available during page load.');
  } else {
    const BAR_WIDTH = 28;
    const maxCount = result.categories[0].count;
    const maxNameLen = Math.max(...result.categories.map((c) => c.name.length));

    for (const cat of result.categories) {
      const barLen =
        maxCount > 0 ? Math.round((cat.count / maxCount) * BAR_WIDTH) : 0;
      const bar = '█'.repeat(barLen).padEnd(BAR_WIDTH);
      const name = cat.name.padEnd(maxNameLen);
      const countStr = String(cat.count).padStart(6);
      const pctStr = cat.percentage.toFixed(1).padStart(5);
      lines.push(`  ${name}  ${bar}  ${countStr}  ${pctStr}%`);
    }
  }

  lines.push('');

  // ── Jank ──────────────────────────────────────────────────────────────────

  lines.push(`──── Jank (${result.jankTotal} periods) ────`);
  lines.push('');

  if (result.jankTotal === 0) {
    lines.push('  No jank detected during page load.');
  } else {
    const shown = result.jankPeriods.length;
    result.jankPeriods.forEach((jank, idx) => {
      lines.push(
        `  Jank ${idx + 1} (${jank.markerHandle})   at ${formatDuration(jank.startMs)}   ${formatDuration(jank.durationMs)} duration   [${jank.startHandle} → ${jank.endHandle}]`
      );

      if (jank.topFunctions.length > 0) {
        lines.push('    Top functions:');
        for (const fn of jank.topFunctions) {
          const name = truncateFunctionName(fn.name, 60);
          lines.push(`      ${name.padEnd(60)}  ${fn.sampleCount} samples`);
        }
      }

      if (jank.categories.length > 0) {
        const catStr = jank.categories
          .map((c) => `${c.name}: ${c.count}`)
          .join('  ');
        lines.push(`    Categories: ${catStr}`);
      }

      lines.push('');
    });

    if (shown < result.jankTotal) {
      lines.push(
        `  Showing ${shown} of ${result.jankTotal} jank periods. Use --jank-limit <N> or --jank-limit 0 to show more.`
      );
    }
  }

  return lines.join('\n');
}

export function formatThreadSelectResult(
  result: WithContext<ThreadSelectResult>
): string {
  const count = result.threadNames.length;
  const names = result.threadNames.join(', ');
  if (count === 1) {
    return `Selected thread: ${result.threadHandle} (${names})`;
  }
  return `Selected ${count} threads: ${result.threadHandle} (${names})`;
}
