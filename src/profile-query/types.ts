/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared types for profile querying.
 * These types are used by both profile-query (the library) and profiler-cli.
 */

import type { Transform } from 'firefox-profiler/types';

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
  topN?: number; // Number of top markers to include per group in JSON output (default: 5)
  list?: boolean; // Return a flat chronological list of all individual markers
};

export type FlatMarkerItem = {
  handle: string;
  name: string;
  label: string; // Schema-derived table label (may equal name if no schema)
  start: number; // Absolute milliseconds
  duration?: number; // Milliseconds if interval marker
  hasStack: boolean;
  category: string;
};

export type FunctionFilterOptions = {
  searchString?: string; // Substring search in function names
  minSelf?: number; // Minimum self time percentage (0-100)
  limit?: number; // Limit the number of functions in output
};

// ===== Sample Filter Stack =====

/**
 * The specification for a single entry on the profiler-cli filter stack.
 * Each entry corresponds to one `profiler-cli filter push` invocation.
 */
export type SampleFilterSpec =
  // Phase 1: Redux transform-backed filters
  | { type: 'excludes-function'; funcIndexes: number[] }
  | { type: 'merge'; funcIndexes: number[] }
  | { type: 'root-at'; funcIndex: number }
  | { type: 'during-marker'; searchString: string }
  // Phase 2: Extended filter-samples transforms
  | { type: 'includes-function'; funcIndexes: number[] }
  | { type: 'includes-prefix'; funcIndexes: number[] }
  | { type: 'includes-suffix'; funcIndex: number }
  | { type: 'outside-marker'; searchString: string };

/**
 * One entry in the filter stack shown/managed by the CLI.
 *
 * One entry corresponds to one `filter push`. A push may dispatch multiple
 * Redux transforms (e.g. `--merge f-1,f-2` dispatches two merge-function
 * transforms); they are grouped into a single entry here so the CLI view
 * matches what the user typed. Transforms already present when the session
 * started (e.g. loaded from a profiler.firefox.com URL) each form their own
 * single-transform entry so they remain individually poppable.
 */
export type FilterEntry = {
  /** 1-based position in the filter list. */
  index: number;
  /** The raw Redux transforms backing this entry (1 or more). */
  transforms: Transform[];
  /** Human-readable description. */
  description: string;
};

export type FilterStackResult = {
  type: 'filter-stack';
  threadHandle: string;
  filters: FilterEntry[];
  action?: 'push' | 'pop' | 'clear';
  message?: string;
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
  /** Filter stacks for all threads that have active filters */
  filterStacks: Array<{
    threadsKey: string | number;
    threadHandle: string;
    filters: FilterEntry[];
  }>;
};

// ===== Function Commands =====

export type FunctionExpandResult = {
  type: 'function-expand';
  functionHandle: string;
  funcIndex: number;
  name: string;
  fullName: string;
  library?: string;
};

export type FunctionInfoResult = {
  type: 'function-info';
  functionHandle: string;
  funcIndex: number;
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

// ===== Function Annotate =====

export type AnnotateMode = 'src' | 'asm' | 'all';

export type AnnotatedSourceLine = {
  lineNumber: number;
  selfSamples: number;
  totalSamples: number;
  sourceText: string | null;
};

export type FunctionSourceAnnotation = {
  filename: string;
  totalFileLines: number | null;
  samplesWithFunction: number;
  samplesWithLineInfo: number;
  // Human-readable description of how lines were selected, e.g. "±2 lines context", "full function", "full file"
  contextMode: string;
  lines: AnnotatedSourceLine[];
};

export type AnnotatedInstruction = {
  address: number;
  selfSamples: number;
  totalSamples: number;
  decodedString: string;
};

export type FunctionAsmAnnotation = {
  compilationIndex: number;
  symbolName: string;
  symbolAddress: number;
  functionSize: number | null;
  nativeSymbolCount: number;
  fetchError: string | null;
  instructions: AnnotatedInstruction[];
};

export type SourceAnnotationResult = {
  annotation: FunctionSourceAnnotation | null;
  warnings: string[];
};

export type AsmAnnotationsResult = {
  annotations: FunctionAsmAnnotation[];
  warnings: string[];
};

export type FunctionAnnotateResult = {
  type: 'function-annotate';
  functionHandle: string;
  funcIndex: number;
  name: string;
  fullName: string;
  threadHandle: string;
  friendlyThreadName: string;
  totalSelfSamples: number;
  totalTotalSamples: number;
  mode: AnnotateMode;
  srcAnnotation: FunctionSourceAnnotation | null;
  asmAnnotations: FunctionAsmAnnotation[];
  warnings: string[];
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
  warning?: string; // Present if the range extends outside the profile duration
};

// ===== Thread Commands =====

export type ThreadSelectResult = {
  type: 'thread-select';
  threadHandle: string;
  threadNames: string[];
};

export type ThreadInfoResult = {
  type: 'thread-info';
  threadHandle: string;
  name: string;
  friendlyName: string;
  tid: number | string;
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
  activeOnly?: boolean;
  search?: string;
  activeFilters?: FilterEntry[];
  ephemeralFilters?: SampleFilterSpec[];
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
  activeOnly?: boolean;
  search?: string;
  activeFilters?: FilterEntry[];
  ephemeralFilters?: SampleFilterSpec[];
  regularCallTree: CallTreeNode;
};

export type ThreadSamplesBottomUpResult = {
  type: 'thread-samples-bottom-up';
  threadHandle: string;
  friendlyThreadName: string;
  activeOnly?: boolean;
  search?: string;
  activeFilters?: FilterEntry[];
  ephemeralFilters?: SampleFilterSpec[];
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

export type NetworkPhaseTimings = {
  dns?: number;
  tcp?: number;
  tls?: number;
  ttfb?: number;
  download?: number;
  mainThread?: number;
};

export type NetworkRequestEntry = {
  url: string;
  httpStatus?: number;
  httpVersion?: string;
  cacheStatus?: string;
  transferSizeKB?: number;
  startTime: number;
  duration: number;
  phases: NetworkPhaseTimings;
};

export type ThreadNetworkResult = {
  type: 'thread-network';
  threadHandle: string;
  friendlyThreadName: string;
  totalRequestCount: number;
  filteredRequestCount: number;
  filters?: {
    searchString?: string;
    minDuration?: number;
    maxDuration?: number;
    limit?: number;
  };
  summary: {
    cacheHit: number;
    cacheMiss: number;
    cacheUnknown: number;
    phaseTotals: NetworkPhaseTimings;
  };
  requests: NetworkRequestEntry[];
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
  flatMarkers?: FlatMarkerItem[];
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

export type ProfileLogsResult = {
  type: 'profile-logs';
  entries: string[];
  totalCount: number;
  filters?: {
    thread?: string;
    module?: string;
    level?: string;
    search?: string;
    limit?: number;
  };
};

export type ThreadFunctionsResult = {
  type: 'thread-functions';
  threadHandle: string;
  friendlyThreadName: string;
  activeOnly?: boolean;
  activeFilters?: FilterEntry[];
  ephemeralFilters?: SampleFilterSpec[];
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

// ===== Thread Page Load Command =====

export type NavigationMilestone = {
  name: string; // 'FCP', 'LCP', 'DCL', 'Load', 'TTI'
  timeMs: number; // relative to navStart
  markerHandle: string; // e.g. "m-3"
};

export type PageLoadResourceEntry = {
  filename: string; // last URL path segment, truncated to 50 chars
  url: string;
  durationMs: number;
  resourceType: string; // 'JS', 'CSS', 'Image', 'HTML', 'JSON', 'Font', 'Wasm', 'Other'
  markerHandle: string; // e.g. "m-5"
};

export type PageLoadCategoryEntry = {
  name: string;
  count: number;
  percentage: number;
};

export type JankFunction = {
  name: string;
  sampleCount: number;
};

export type JankPeriod = {
  startMs: number; // relative to navStart
  durationMs: number;
  markerHandle: string; // e.g. "m-7"
  startHandle: string; // timestamp handle for zoom, e.g. "ts-3"
  endHandle: string; // timestamp handle for zoom, e.g. "ts-4"
  topFunctions: JankFunction[];
  categories: PageLoadCategoryEntry[];
};

export type ThreadPageLoadResult = {
  type: 'thread-page-load';
  threadHandle: string;
  friendlyThreadName: string;
  url: string | null;
  navigationIndex: number; // 1-based
  navigationTotal: number;
  navStartMs: number; // absolute profile time of nav start
  milestones: NavigationMilestone[];
  // Resources
  resourceCount: number;
  resourceAvgMs: number | null;
  resourceMaxMs: number | null;
  resourcesByType: Array<{ type: string; count: number; percentage: number }>;
  topResources: PageLoadResourceEntry[]; // top 10 by duration
  // CPU categories
  totalSamples: number;
  categories: PageLoadCategoryEntry[];
  // Jank
  jankTotal: number;
  jankPeriods: JankPeriod[]; // limited by jankLimit
};

// ===== Profile Commands =====

export type ProfileInfoResult = {
  type: 'profile-info';
  name: string;
  platform: string;
  threadCount: number;
  processCount: number;
  showAll?: boolean;
  searchQuery?: string;
  processes: Array<{
    processIndex: number;
    pid: string;
    name: string;
    etld1?: string;
    cpuMs: number;
    startTime?: number;
    startTimeName?: string;
    endTime?: number | null;
    endTimeName?: string | null;
    threads: Array<{
      threadIndex: number;
      threadHandle: string;
      name: string;
      tid: number | string;
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
