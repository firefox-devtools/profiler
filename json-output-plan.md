# JSON Output Support Plan for profile-query

## Overview

Support JSON output across all profile-query commands to enable piping output to `jq` and other JSON tools. The approach is to:

1. Have ProfileQuerier methods return structured data objects instead of formatted strings
2. Send these structured objects across IPC
3. In the CLI, either print JSON (with `--json` flag) or format as plain text

## Architecture Changes

### 1. Protocol Changes (`profile-query-cli/protocol.ts`)

Change the `ServerResponse` type from:

```typescript
export type ServerResponse =
  | { type: 'success'; result: string }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'ready' };
```

To:

```typescript
export type ServerResponse =
  | { type: 'success'; result: CommandResult }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'ready' };

// CommandResult is a union of all possible result types
export type CommandResult =
  | ProfileInfoResult
  | ThreadInfoResult
  | ThreadSamplesResult
  | ThreadMarkersResult
  | MarkerInfoResult
  | MarkerStackResult
  | FunctionExpandResult
  | FunctionInfoResult
  | ViewRangeResult
  | StatusResult;
```

### 2. CLI Changes (`profile-query-cli/index.ts`)

Add `--json` flag to CLI arguments:

```typescript
boolean: ['daemon', 'help', 'h', 'all', 'has-stack', 'auto-group', 'json'],
```

After receiving result from `sendCommand()`, check for `--json` flag:

```typescript
const result = await sendCommand(SESSION_DIR, { command: ... }, argv.session);

if (argv.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const formatted = formatCommandResult(result);
  console.log(formatted);
}
```

### 3. ProfileQuerier Changes (`profile-query/index.ts`)

Change method signatures from `Promise<string>` to `Promise<XxxResult>` where `XxxResult` is a structured type.

### 4. New Formatter Module

Create `profile-query-cli/formatters.ts` that contains all plain-text formatting logic moved from ProfileQuerier and formatter modules.

---

## Command-by-Command Plan

### 1. `profile info` → `profileInfo()`

**Current formatter:** `formatProfileInfo()` in `profile-query/formatters/profile-info.ts:19`

**JSON Structure:**

```typescript
interface ProfileInfoResult {
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
    endTime: number;
    endTimeName: string;
    cpuMs: number;
    depthLevel: number;
  }> | null;
}
```

**Refactoring:**

1. Extract data collection logic from `formatProfileInfo()` into new `collectProfileInfo()` function
2. Have `ProfileQuerier.profileInfo()` call `collectProfileInfo()` and return structured data
3. Move text formatting from `formatProfileInfo()` to `profile-query-cli/formatters.ts`

---

### 2. `thread info` → `threadInfo()`

**Current formatter:** `formatThreadInfo()` in `profile-query/formatters/thread-info.ts:33`

**JSON Structure:**

```typescript
interface ThreadInfoResult {
  type: 'thread-info';
  threadHandle: string;
  threadIndex: number;
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
    endTime: number;
    endTimeName: string;
    cpuMs: number;
    depthLevel: number;
  }> | null;
}
```

**Refactoring:**

1. Extract data collection from `formatThreadInfo()` into new `collectThreadInfo()` function
2. Have `ProfileQuerier.threadInfo()` return structured data
3. Move text formatting to CLI formatters

---

### 3. `thread samples` → `threadSamples()`

**Current formatter:** `formatThreadSamples()` in `profile-query/formatters/thread-info.ts:134`

**JSON Structure:**

```typescript
interface ThreadSamplesResult {
  type: 'thread-samples';
  threadHandle: string;
  threadIndex: number;
  friendlyThreadName: string;

  topFunctionsByTotal: Array<{
    functionHandle: string;
    functionIndex: number;
    name: string;
    nameWithLibrary: string;
    totalSamples: number;
    totalPercentage: number;
    library?: string;
  }>;

  topFunctionsBySelf: Array<{
    functionHandle: string;
    functionIndex: number;
    name: string;
    nameWithLibrary: string;
    selfSamples: number;
    selfPercentage: number;
    library?: string;
  }>;

  regularCallTree: CallTreeNode;
  invertedCallTree: CallTreeNode | null;

  heaviestStack: {
    selfSamples: number;
    frameCount: number;
    frames: Array<{
      funcIndex: number;
      name: string;
      nameWithLibrary: string;
    }>;
  };
}

interface CallTreeNode {
  funcIndex: number;
  name: string;
  nameWithLibrary: string;
  totalSamples: number;
  totalPercentage: number;
  selfSamples: number;
  selfPercentage: number;
  children: CallTreeNode[];
}
```

**Refactoring:**

1. Extract data from `formatThreadSamples()` - much of the data is already collected
2. Create helper to convert CallTree to JSON structure
3. Move formatting logic (truncation, indentation) to CLI
4. Note: `formatCallTree()` in `profile-query/formatters/call-tree.ts:15` will need data extraction variant

---

### 4. `thread markers` → `threadMarkers()`

**Current formatter:** `formatThreadMarkers()` in `profile-query/formatters/marker-info.ts:611`

**JSON Structure:**

```typescript
interface ThreadMarkersResult {
  type: 'thread-markers';
  threadHandle: string;
  threadIndex: number;
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
    typeName: string;
    count: number;
    isInterval: boolean;

    durationStats?: {
      min: number;
      max: number;
      avg: number;
      median: number;
      p95: number;
      p99: number;
    };

    rateStats?: {
      markersPerSecond: number;
      minGap: number;
      avgGap: number;
      maxGap: number;
    };

    topMarkers: Array<{
      handle: string;
      markerIndex: number;
      label: string;
      start: number;
      duration?: number;
    }>;

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
}

interface MarkerGroupData {
  groupName: string;
  count: number;
  isInterval: boolean;
  durationStats?: DurationStats;
  rateStats?: RateStats;
  topMarkers: Array<{
    handle: string;
    markerIndex: number;
    label: string;
    start: number;
    duration?: number;
  }>;
  subGroups?: MarkerGroupData[];
}
```

**Refactoring:**

1. Most aggregation logic in `formatThreadMarkers()` already produces structured data
2. Extract `MarkerTypeStats` and `MarkerGroup` interfaces to result types
3. Separate formatting lines from data aggregation
4. Move `formatMarkerGroups()` logic to CLI formatters

---

### 5. `marker info` → `markerInfo()`

**Current formatter:** `formatMarkerInfo()` in `profile-query/formatters/marker-info.ts:971`

**JSON Structure:**

```typescript
interface MarkerInfoResult {
  type: 'marker-info';
  markerHandle: string;
  markerIndex: number;
  threadHandle: string;
  threadIndex: number;
  friendlyThreadName: string;

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
}

interface StackTraceData {
  capturedAt?: number;
  frames: Array<{
    funcIndex: number;
    name: string;
    nameWithLibrary: string;
    library?: string;
  }>;
  truncated: boolean;
}
```

**Refactoring:**

1. Extract data collection from `formatMarkerInfo()`
2. Separate stack formatting (limited to 20 frames) from full stack data
3. Move text formatting to CLI

---

### 6. `marker stack` → `markerStack()`

**Current formatter:** `formatMarkerStackFull()` in `profile-query/formatters/marker-info.ts:922`

**JSON Structure:**

```typescript
interface MarkerStackResult {
  type: 'marker-stack';
  markerHandle: string;
  markerIndex: number;
  threadHandle: string;
  threadIndex: number;
  friendlyThreadName: string;
  markerName: string;

  stack: StackTraceData | null;
}
```

**Refactoring:**

1. Extract stack data from `formatMarkerStackFull()`
2. Reuse `StackTraceData` interface from marker info
3. Move formatting to CLI

---

### 7. `function expand` → `functionExpand()`

**Current formatting:** Inline in `ProfileQuerier.functionExpand()` at `profile-query/index.ts:267`

**JSON Structure:**

```typescript
interface FunctionExpandResult {
  type: 'function-expand';
  functionHandle: string;
  funcIndex: number;
  threadHandle: string;
  threadIndex: number;

  name: string;
  fullName: string;
  library?: string;
}
```

**Refactoring:**

1. Return structured data instead of formatted string
2. Move text formatting to CLI

---

### 8. `function info` → `functionInfo()`

**Current formatting:** Inline in `ProfileQuerier.functionInfo()` at `profile-query/index.ts:303`

**JSON Structure:**

```typescript
interface FunctionInfoResult {
  type: 'function-info';
  functionHandle: string;
  funcIndex: number;
  threadHandle: string;
  threadIndex: number;
  threadName: string;

  name: string;
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
}
```

**Refactoring:**

1. Return structured data instead of formatted string
2. Move text formatting to CLI

---

### 9. `view push` → `pushViewRange()`

**Current formatting:** Inline in `ProfileQuerier.pushViewRange()` at `profile-query/index.ts:121`

**JSON Structure:**

```typescript
interface ViewRangeResult {
  type: 'view-range';
  action: 'push' | 'pop';

  range: {
    start: number;
    startName: string;
    end: number;
    endName: string;
  };

  message: string;
}
```

**Refactoring:**

1. Return structured data with range info
2. Move text formatting to CLI

---

### 10. `view pop` → `popViewRange()`

**Current formatting:** Inline in `ProfileQuerier.popViewRange()` at `profile-query/index.ts:179`

**JSON Structure:**
Same as `ViewRangeResult` above.

**Refactoring:**

1. Return structured data
2. Move text formatting to CLI

---

### 11. `status` → `getStatus()`

**Current formatting:** Inline in `ProfileQuerier.getStatus()` at `profile-query/index.ts:226`

**JSON Structure:**

```typescript
interface StatusResult {
  type: 'status';

  selectedThread: {
    threadHandle: string;
    threadIndex: number;
    name: string;
  } | null;

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
}
```

**Refactoring:**

1. Return structured data
2. Move text formatting to CLI

---

## Implementation Strategy

### Phase 1: Infrastructure

1. Add result type definitions to `protocol.ts`
2. Add `--json` flag handling to CLI
3. Create `profile-query-cli/formatters.ts` module
4. Update daemon to handle new response types

### Phase 2: Simple Commands (good starting points)

1. `status` - simplest command
2. `function expand` - simple inline formatting
3. `function info` - simple inline formatting
4. `view push` / `view pop` - simple inline formatting

### Phase 3: Medium Complexity

1. `thread info` - single formatter, moderate data
2. `marker info` - moderate complexity
3. `marker stack` - can reuse marker info infrastructure

### Phase 4: Complex Commands

1. `profile info` - complex data structure with CPU activity
2. `thread samples` - involves call trees and multiple data sources
3. `thread markers` - most complex with grouping and aggregation

### Phase 5: Testing & Polish

1. Add tests for JSON output
2. Ensure backward compatibility
3. Update documentation

---

## Migration Notes

### Breaking Changes

None - this is purely additive. Without `--json` flag, behavior is unchanged.

### Backward Compatibility

The IPC protocol change needs version checking. Add a protocol version field:

```typescript
export interface SessionMetadata {
  // ... existing fields ...
  protocolVersion: number; // Add this
}
```

If client and daemon have mismatched protocol versions, show clear error message.

### Testing

1. Unit tests for each data collection function
2. Integration tests comparing JSON → formatted output with current text output
3. Golden file tests for JSON structure stability
