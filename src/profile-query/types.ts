/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared types for profile querying.
 * These types are used by both profile-query (the library) and profile-query-cli.
 */

// ===== Utility types =====

export type TopMarker = {
  handle: string;
  label: string;
  start: number;
  duration?: number;
  hasStack?: boolean;
};

export type FunctionDisplayInfo = {
  name: string;
  nameWithLibrary: string;
  library?: string;
};

// ===== Filter Options =====

export type MarkerFilterOptions = {
  searchString?: string;
  minDuration?: number; // Minimum duration in milliseconds
  maxDuration?: number; // Maximum duration in milliseconds
  category?: string; // Filter by category name
  hasStack?: boolean; // Only show markers with stack traces
  limit?: number; // Limit the number of markers in aggregation (not output lines)
  groupBy?: string; // Grouping strategy (e.g., "type,name" or "type,field:eventType")
  autoGroup?: boolean; // Automatically determine grouping based on field variance
};

export type FunctionFilterOptions = {
  searchString?: string; // Substring search in function names
  minSelf?: number; // Minimum self time percentage (0-100)
  limit?: number; // Limit the number of functions in output
};

// ===== Session Context =====
// Context information included in all command results for persistent display

export type SessionContext = {
  selectedThreadHandle: string | null; // Combined handle like "t-0" or "t-0,t-1,t-2"
  selectedThreads: Array<{
    threadIndex: number;
    name: string;
  }>;
  currentViewRange: {
    start: number;
    startName: string;
    end: number;
    endName: string;
  } | null; // null if viewing full profile
  rootRange: {
    start: number;
    end: number;
  };
};

/**
 * Wrapper type that adds session context to any result type.
 */
export type WithContext<T> = T & { context: SessionContext };

// ===== Status Command =====

export type StatusResult = {
  type: 'status';
  selectedThreadHandle: string | null; // Combined handle like "t-0" or "t-0,t-1,t-2"
  selectedThreads: Array<{
    threadIndex: number;
    name: string;
  }>;
  viewRanges: Array<{
    start: number;
    startName: string;
    end: number;
    endName: string;
  }>;
  rootRange: {
    start: number;
    end: number;
  };
};

// ===== Function Commands =====

export type FunctionExpandResult = {
  type: 'function-expand';
  functionHandle: string;
  funcIndex: number;
  threadHandle: string;
  name: string;
  fullName: string;
  library?: string;
};

export type FunctionInfoResult = {
  type: 'function-info';
  functionHandle: string;
  funcIndex: number;
  threadHandle: string;
  threadName: string;
  name: string;
  fullName: string;
  isJS: boolean;
  relevantForJS: boolean;
  resource?: {
    name: string;
    index: number;
  };
  library?: {
    name: string;
    path: string;
    debugName?: string;
    debugPath?: string;
    breakpadId?: string;
  };
};

// ===== View Range Commands =====

export type ViewRangeResult = {
  type: 'view-range';
  action: 'push' | 'pop';
  range: {
    start: number;
    startName: string;
    end: number;
    endName: string;
  };
  message: string;
  // Enhanced information for better UX (optional, only present for 'push' action)
  duration?: number; // Duration in milliseconds
  zoomDepth?: number; // Current zoom stack depth
  markerInfo?: {
    // Present if zoomed to a marker
    markerHandle: string;
    markerName: string;
    threadHandle: string;
    threadName: string;
  };
};

// ===== Thread Commands =====

export type ThreadInfoResult = {
  type: 'thread-info';
  threadHandle: string;
  name: string;
  friendlyName: string;
  createdAt: number;
  createdAtName: string;
  endedAt: number | null;
  endedAtName: string | null;
  sampleCount: number;
  markerCount: number;
  cpuActivity: Array<{
    startTime: number;
    startTimeName: string;
    startTimeStr: string;
    endTime: number;
    endTimeName: string;
    endTimeStr: string;
    cpuMs: number;
    depthLevel: number;
  }> | null;
};

export type TopFunctionInfo = FunctionDisplayInfo & {
  functionHandle: string;
  functionIndex: number;
  totalSamples: number;
  totalPercentage: number;
  selfSamples: number;
  selfPercentage: number;
};

export type ThreadSamplesResult = {
  type: 'thread-samples';
  threadHandle: string;
  friendlyThreadName: string;
  topFunctionsByTotal: TopFunctionInfo[];
  topFunctionsBySelf: TopFunctionInfo[];
  heaviestStack: {
    selfSamples: number;
    frameCount: number;
    frames: Array<
      FunctionDisplayInfo & {
        totalSamples: number;
        totalPercentage: number;
        selfSamples: number;
        selfPercentage: number;
      }
    >;
  };
};

export type ThreadSamplesTopDownResult = {
  type: 'thread-samples-top-down';
  threadHandle: string;
  friendlyThreadName: string;
  regularCallTree: CallTreeNode;
};

export type ThreadSamplesBottomUpResult = {
  type: 'thread-samples-bottom-up';
  threadHandle: string;
  friendlyThreadName: string;
  invertedCallTree: CallTreeNode | null;
};

/**
 * Scoring strategy for selecting which call tree nodes to include.
 * The score determines node priority, with the constraint that child score ≤ parent score.
 */
export type CallTreeScoringStrategy =
  | 'exponential-0.95' // totalPercentage * (0.95 ^ depth) - slow decay
  | 'exponential-0.9' // totalPercentage * (0.9 ^ depth) - medium decay
  | 'exponential-0.8' // totalPercentage * (0.8 ^ depth) - fast decay
  | 'harmonic-0.1' // totalPercentage / (1 + 0.1 * depth) - very slow
  | 'harmonic-0.5' // totalPercentage / (1 + 0.5 * depth) - medium
  | 'harmonic-1.0' // totalPercentage / (1 + depth) - standard harmonic
  | 'percentage-only'; // totalPercentage - no depth penalty

export type CallTreeNode = FunctionDisplayInfo & {
  callNodeIndex?: number; // Optional for root node
  functionHandle?: string; // Optional for root node
  functionIndex?: number; // Optional for root node
  totalSamples: number;
  totalPercentage: number;
  selfSamples: number;
  selfPercentage: number;
  /** Original depth in tree before collapsing single-child chains */
  originalDepth: number;
  children: CallTreeNode[];
  /** Information about truncated children, if any were omitted */
  childrenTruncated?: {
    count: number;
    combinedSamples: number;
    combinedPercentage: number;
    maxSamples: number;
    maxPercentage: number;
    depth: number; // Depth where children were truncated
  };
};

export type ThreadMarkersResult = {
  type: 'thread-markers';
  threadHandle: string;
  friendlyThreadName: string;
  totalMarkerCount: number;
  filteredMarkerCount: number;
  filters?: {
    searchString?: string;
    minDuration?: number;
    maxDuration?: number;
    category?: string;
    hasStack?: boolean;
    limit?: number;
  };
  byType: Array<{
    markerName: string;
    count: number;
    isInterval: boolean;
    durationStats?: DurationStats;
    rateStats?: RateStats;
    topMarkers: TopMarker[];
    subGroups?: MarkerGroupData[];
    subGroupKey?: string;
  }>;
  byCategory: Array<{
    categoryName: string;
    categoryIndex: number;
    count: number;
    percentage: number;
  }>;
  customGroups?: MarkerGroupData[];
};

export type DurationStats = {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
};

export type RateStats = {
  markersPerSecond: number;
  minGap: number;
  avgGap: number;
  maxGap: number;
};

export type MarkerGroupData = {
  groupName: string;
  count: number;
  isInterval: boolean;
  durationStats?: DurationStats;
  rateStats?: RateStats;
  topMarkers: TopMarker[];
  subGroups?: MarkerGroupData[];
};

export type ThreadFunctionsResult = {
  type: 'thread-functions';
  threadHandle: string;
  friendlyThreadName: string;
  totalFunctionCount: number;
  filteredFunctionCount: number;
  filters?: {
    searchString?: string;
    minSelf?: number;
    limit?: number;
  };
  functions: Array<
    {
      functionHandle: string;
      selfSamples: number;
      selfPercentage: number;
      totalSamples: number;
      totalPercentage: number;
      // Optional full profile percentages (present when zoomed)
      fullSelfPercentage?: number;
      fullTotalPercentage?: number;
    } & FunctionDisplayInfo
  >;
};

// ===== Marker Commands =====

export type MarkerInfoResult = {
  type: 'marker-info';
  threadHandle: string;
  friendlyThreadName: string;
  markerHandle: string;
  markerIndex: number;
  name: string;
  tooltipLabel?: string;
  markerType?: string;
  category: {
    index: number;
    name: string;
  };
  start: number;
  end: number | null;
  duration?: number;
  fields?: Array<{
    key: string;
    label: string;
    value: any;
    formattedValue: string;
  }>;
  schema?: {
    description?: string;
  };
  stack?: StackTraceData;
};

export type MarkerStackResult = {
  type: 'marker-stack';
  threadHandle: string;
  friendlyThreadName: string;
  markerHandle: string;
  markerIndex: number;
  markerName: string;
  stack: StackTraceData | null;
};

export type StackTraceData = {
  capturedAt?: number;
  frames: FunctionDisplayInfo[];
  truncated: boolean;
};

// ===== Profile Commands =====

export type ProfileInfoResult = {
  type: 'profile-info';
  name: string;
  platform: string;
  threadCount: number;
  processCount: number;
  processes: Array<{
    processIndex: number;
    pid: string;
    name: string;
    cpuMs: number;
    startTime?: number;
    startTimeName?: string;
    endTime?: number | null;
    endTimeName?: string | null;
    threads: Array<{
      threadIndex: number;
      threadHandle: string;
      name: string;
      cpuMs: number;
    }>;
    remainingThreads?: {
      count: number;
      combinedCpuMs: number;
      maxCpuMs: number;
    };
  }>;
  remainingProcesses?: {
    count: number;
    combinedCpuMs: number;
    maxCpuMs: number;
  };
  cpuActivity: Array<{
    startTime: number;
    startTimeName: string;
    startTimeStr: string;
    endTime: number;
    endTimeName: string;
    endTimeStr: string;
    cpuMs: number;
    depthLevel: number;
  }> | null;
};
