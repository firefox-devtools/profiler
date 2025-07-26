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
  ViewRangeResult,
  ThreadInfoResult,
  MarkerStackResult,
  MarkerInfoResult,
  ProfileInfoResult,
  ThreadSamplesResult,
  ThreadSamplesTopDownResult,
  ThreadSamplesBottomUpResult,
  ThreadMarkersResult,
  ThreadFunctionsResult,
  MarkerGroupData,
  CallTreeNode,
} from './protocol';
import { truncateFunctionName } from '../profile-query/function-list';

/**
 * Format a SessionContext as a compact header line.
 * Shows current thread selection, zoom range, and full profile duration.
 */
export function formatContextHeader(context: SessionContext): string {
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
  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms.toFixed(1)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  let viewInfo = 'Full profile';
  if (context.currentViewRange) {
    const range = context.currentViewRange;
    const rangeDuration = range.end - range.start;
    viewInfo = `${range.startName}→${range.endName} (${formatDuration(rangeDuration)})`;
  }

  const fullInfo = formatDuration(rootDuration);

  return `[Thread: ${threadInfo} | View: ${viewInfo} | Full: ${fullInfo}]`;
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

  return `\
Session Status:
  Selected thread: ${threadInfo}
  View range: ${rangesInfo}`;
}

/**
 * Format a FunctionExpandResult as plain text.
 */
export function formatFunctionExpandResult(
  result: WithContext<FunctionExpandResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  return `${contextHeader}

Function ${result.functionHandle} (thread ${result.threadHandle}):
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
  Thread: ${result.threadHandle} (${result.threadName})
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
      output += `\n  Zoom depth: ${result.zoomDepth}${result.zoomDepth > 1 ? ' (use "pq zoom pop" to go back)' : ''}`;
    }
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
Created at: ${result.createdAtName}
Ended at: ${endedAtStr}

This thread contains ${result.sampleCount} samples and ${result.markerCount} markers.

CPU activity over time:`;

  if (result.cpuActivity && result.cpuActivity.length > 0) {
    for (const activity of result.cpuActivity) {
      const indent = '  '.repeat(activity.depthLevel);
      const percentage = Math.round(
        (activity.cpuMs / (activity.endTime - activity.startTime)) * 100
      );
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
    output += `\nCaptured at: ${result.stack.capturedAt.toFixed(3)}ms\n`;
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

  // Time and duration
  const startStr = result.start.toFixed(3);
  if (result.end !== null) {
    const endStr = result.end.toFixed(3);
    const durationMs = result.duration!;
    let durationStr: string;
    if (durationMs < 1) {
      durationStr = `${(durationMs * 1000).toFixed(1)}µs`;
    } else if (durationMs < 1000) {
      durationStr = `${durationMs.toFixed(2)}ms`;
    } else {
      durationStr = `${(durationMs / 1000).toFixed(3)}s`;
    }
    output += `Time: ${startStr}ms - ${endStr}ms (${durationStr})\n`;
  } else {
    output += `Time: ${startStr}ms (instant)\n`;
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
      output += `  Captured at: ${result.stack.capturedAt.toFixed(3)}ms\n`;
    }

    for (let i = 0; i < result.stack.frames.length; i++) {
      const frame = result.stack.frames[i];
      output += `  [${i + 1}] ${frame.nameWithLibrary}\n`;
    }

    if (result.stack.truncated) {
      output += `\nUse 'pq marker stack ${result.markerHandle}' for the full stack trace.\n`;
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

  output += '\nTop processes and threads by CPU usage:\n';

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

    output += `  p-${process.processIndex}: ${process.name} [pid ${process.pid}]${timingInfo} - ${process.cpuMs.toFixed(3)}ms\n`;

    for (const thread of process.threads) {
      output += `    ${thread.threadHandle}: ${thread.name} - ${thread.cpuMs.toFixed(3)}ms\n`;
    }

    if (process.remainingThreads) {
      output += `    + ${process.remainingThreads.count} more threads with combined CPU time ${process.remainingThreads.combinedCpuMs.toFixed(3)}ms and max CPU time ${process.remainingThreads.maxCpuMs.toFixed(3)}ms\n`;
    }
  }

  if (result.remainingProcesses) {
    output += `  + ${result.remainingProcesses.count} more processes with combined CPU time ${result.remainingProcesses.combinedCpuMs.toFixed(3)}ms and max CPU time ${result.remainingProcesses.maxCpuMs.toFixed(3)}ms\n`;
  }

  output += '\nCPU activity over time:\n';

  if (result.cpuActivity && result.cpuActivity.length > 0) {
    for (const activity of result.cpuActivity) {
      const indent = '  '.repeat(activity.depthLevel);
      const percentage = Math.round(
        (activity.cpuMs / (activity.endTime - activity.startTime)) * 100
      );
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
  const displayName = truncateFunctionName(node.nameWithLibrary, 120);

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
function formatCallTree(tree: CallTreeNode, title: string): string {
  const lines: string[] = [`${title} Call Tree:`];

  // The root node is virtual, so format its children
  if (tree.children && tree.children.length > 0) {
    for (let i = 0; i < tree.children.length; i++) {
      const child = tree.children[i];
      const isLast = i === tree.children.length - 1;
      // Root-level nodes don't use tree symbols (they are the starting points)
      formatCallTreeNode(child, '', false, isLast, 0, lines);
    }
  }

  return lines.join('\n');
}

/**
 * Format a ThreadSamplesResult as plain text.
 */
export function formatThreadSamplesResult(
  result: WithContext<ThreadSamplesResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Thread: ${result.friendlyThreadName}\n\n`;

  // Top functions by total time
  output += 'Top Functions (by total time):\n';
  output +=
    '  (For a call tree starting from these functions, use: pq thread samples-top-down)\n\n';
  for (const func of result.topFunctionsByTotal) {
    const totalCount = Math.round(func.totalSamples);
    const totalPct = func.totalPercentage.toFixed(1);
    const displayName = truncateFunctionName(func.nameWithLibrary, 120);
    output += `  ${func.functionHandle}. ${displayName} - total: ${totalCount} (${totalPct}%)\n`;
  }

  output += '\n';

  // Top functions by self time
  output += 'Top Functions (by self time):\n';
  output +=
    '  (For a call tree showing what calls these functions, use: pq thread samples-bottom-up)\n\n';
  for (const func of result.topFunctionsBySelf) {
    const selfCount = Math.round(func.selfSamples);
    const selfPct = func.selfPercentage.toFixed(1);
    const displayName = truncateFunctionName(func.nameWithLibrary, 120);
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
      const displayName = truncateFunctionName(frame.nameWithLibrary, 120);
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
      const displayName = truncateFunctionName(frame.nameWithLibrary, 120);
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
      const displayName = truncateFunctionName(frame.nameWithLibrary, 120);
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
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Thread: ${result.friendlyThreadName}\n\n`;

  // Top-down call tree
  output += formatCallTree(result.regularCallTree, 'Top-Down');

  return output;
}

/**
 * Format a ThreadSamplesBottomUpResult as plain text.
 */
export function formatThreadSamplesBottomUpResult(
  result: WithContext<ThreadSamplesBottomUpResult>
): string {
  const contextHeader = formatContextHeader(result.context);
  let output = `${contextHeader}

Thread: ${result.friendlyThreadName}\n\n`;

  // Bottom-up call tree (inverted tree shows callers)
  if (result.invertedCallTree) {
    output += formatCallTree(result.invertedCallTree, 'Bottom-Up');
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

  // Handle custom grouping if present
  if (result.customGroups && result.customGroups.length > 0) {
    formatMarkerGroupsForDisplay(lines, result.customGroups, 0);
  } else {
    // Default aggregation by marker name
    lines.push('By Name (top 15):');
    const topTypes = result.byType.slice(0, 15);
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
        `  ${stats.categoryName.padEnd(25)} ${stats.count.toString().padStart(5)} markers (${stats.percentage.toFixed(1)}%)`
      );
    }

    lines.push('');

    // Frequency analysis for top markers
    lines.push('Frequency Analysis:');
    const topRateTypes = result.byType
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
 * Helper function to format duration in milliseconds.
 */
function formatDuration(ms: number): string {
  if (ms < 1) {
    return `${(ms * 1000).toFixed(0)}µs`;
  } else if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Format a ThreadFunctionsResult as plain text.
 */
export function formatThreadFunctionsResult(
  result: WithContext<ThreadFunctionsResult>
): string {
  const contextHeader = formatContextHeader(result.context);
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

  if (result.filteredFunctionCount === 0) {
    if (hasFilters) {
      lines.push('No functions match the specified filters.');
    } else {
      lines.push('No functions in this thread.');
    }
    return lines.join('\n');
  }

  // Show active filters if any
  if (hasFilters && result.filters) {
    const filterParts: string[] = [];
    if (result.filters.searchString) {
      filterParts.push(`search: "${result.filters.searchString}"`);
    }
    if (result.filters.minSelf !== undefined) {
      filterParts.push(`min-self: ${result.filters.minSelf}%`);
    }
    if (result.filters.limit !== undefined) {
      filterParts.push(`limit: ${result.filters.limit}`);
    }
    if (filterParts.length > 0) {
      lines.push(`Filters: ${filterParts.join(', ')}\n`);
    }
  }

  // List functions sorted by self time
  lines.push('Functions (by self time):');
  for (const func of result.functions) {
    const selfCount = Math.round(func.selfSamples);
    const totalCount = Math.round(func.totalSamples);
    const displayName = truncateFunctionName(func.nameWithLibrary, 120);

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
