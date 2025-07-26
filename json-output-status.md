# JSON Output Implementation Status

## Goal

Add JSON output support to all profile-query CLI commands to enable programmatic data processing with tools like `jq`. The implementation allows users to choose between human-readable text output (default) and structured JSON output (with `--json` flag).

## Architecture

The implementation uses a three-layer architecture:

1. **ProfileQuerier methods** return structured TypeScript objects (e.g., `StatusResult`, `ThreadInfoResult`) instead of formatted strings
2. **IPC layer** passes these structured objects through the daemon unchanged
3. **CLI layer** either outputs JSON directly or formats the structured data as plain text using dedicated formatters

### Key Files

- `src/profile-query-cli/protocol.ts` - All `CommandResult` type definitions
- `src/profile-query-cli/formatters.ts` - Plain text formatters for each result type
- `src/profile-query-cli/index.ts` - CLI with `--json` flag and `formatOutput()` dispatcher
- `src/profile-query/index.ts` - ProfileQuerier methods returning structured results
- `src/profile-query/formatters/*.ts` - Data collection helpers that extract structured data

## Current Status

### ✅ All Commands Complete (11 of 11)

All profile-query CLI commands now support both plain text and JSON output modes.

### ✅ Infrastructure (Complete)

All foundational work is complete:

- ✅ Added all `CommandResult` type definitions to `protocol.ts`
- ✅ Updated `ServerResponse` to support `string | CommandResult`
- ✅ Added `--json` flag to CLI with `formatOutput()` dispatcher
- ✅ Created `formatters.ts` module in CLI for plain text formatting
- ✅ Updated daemon `processCommand()` to pass through structured results

### ✅ Converted Commands (11 of 11)

#### Simple Commands (4/4 complete)

1. **status** (`getStatus()` → `StatusResult`)
   - Returns session status, selected thread, view ranges
   - Formatter: `formatStatusResult()`

2. **function expand** (`functionExpand()` → `FunctionExpandResult`)
   - Returns full untruncated function name with library
   - Formatter: `formatFunctionExpandResult()`

3. **function info** (`functionInfo()` → `FunctionInfoResult`)
   - Returns detailed function info including resource and library details
   - Formatter: `formatFunctionInfoResult()`

4. **view push/pop** (`pushViewRange()`, `popViewRange()` → `ViewRangeResult`)
   - Returns view range operation results with timestamps
   - Formatter: `formatViewRangeResult()`

#### Medium Commands (7/7 complete)

5. **thread info** (`threadInfo()` → `ThreadInfoResult`)
   - Returns thread details with structured CPU activity data
   - Created `CpuActivityEntry` interface and `collectSliceTree()` helper
   - Formatter: `formatThreadInfoResult()`

6. **thread samples** (`threadSamples()` → `ThreadSamplesResult`)
   - Returns call trees (regular and inverted) and top function lists
   - Created `collectCallTree()` and `collectCallTreeNode()` helpers
   - Formatter: `formatThreadSamplesResult()`

7. **profile info** (`profileInfo()` → `ProfileInfoResult`)
   - Returns process/thread tree and CPU activity
   - Formatter: `formatProfileInfoResult()`

8. **marker stack** (`markerStack()` → `MarkerStackResult`)
   - Returns full stack trace data for a marker
   - Formatter: `formatMarkerStackResult()`

9. **marker info** (`markerInfo()` → `MarkerInfoResult`)
   - Returns marker fields, timing, and optional stack trace
   - Formatter: `formatMarkerInfoResult()`

10. **thread markers** (`threadMarkers()` → `ThreadMarkersResult`)
    - Returns aggregated statistics by type and category
    - Includes duration/rate stats, filtering, and custom grouping
    - Formatter: `formatThreadMarkersResult()`

## Proven Conversion Pattern

Every command follows the same 5-step pattern:

### Step 1: Read Current Implementation

Identify where the current formatting happens:

```bash
# Find the method in ProfileQuerier
grep -n "async commandName" src/profile-query/index.ts

# Find the formatter function
grep -n "formatCommandName" src/profile-query/formatters/
```

### Step 2: Extract Data Collection

In the formatter file (e.g., `formatters/thread-info.ts`):

```typescript
// Add new function that collects data without formatting
export function collectThreadInfo(...): ThreadInfoResult {
  // Reuse existing data collection logic
  const state = store.getState();
  const thread = threadSelectors.getRawThread(state);
  // ... collect all data ...

  return {
    type: 'thread-info',
    // ... structured data ...
  };
}
```

Key principle: **Extract, don't duplicate**. The data collection logic already exists in the formatter - just separate it from the string concatenation.

### Step 3: Update ProfileQuerier Method

In `src/profile-query/index.ts`:

```typescript
// Change return type and call new collector
async threadInfo(threadHandle?: string): Promise<ThreadInfoResult> {
  return collectThreadInfo(
    this._store,
    this._timestampManager,
    this._threadMap,
    threadHandle
  );
}
```

### Step 4: Add CLI Formatter

In `src/profile-query-cli/formatters.ts`:

```typescript
export function formatThreadInfoResult(result: ThreadInfoResult): string {
  // Convert structured data back to human-readable text
  // This is basically the string concatenation logic from the old formatter
  return `Name: ${result.friendlyName}\n...`;
}
```

### Step 5: Wire Up CLI Dispatcher

In `src/profile-query-cli/index.ts`:

```typescript
// Add formatter import
import { formatThreadInfoResult } from './formatters';

// Add case to formatOutput() switch
switch (result.type) {
  case 'thread-info':
    return formatThreadInfoResult(result);
  // ...
}
```

### Step 6: Test and Commit

```bash
yarn lint-fix
yarn ts
yarn test profile-query
yarn test:cli
jj commit -m "Implement JSON support for X command"
```

## Common Patterns and Helpers

### CPU Activity Data

For commands that show CPU activity (profile info, thread info):

- Use `collectSliceTree()` from `cpu-activity.ts`
- Returns array of `CpuActivityEntry` with timestamps and nesting depth
- Plain text formatter recreates the indented tree structure

### Stack Traces

For markers with stacks:

- Define `StackTraceData` interface with frames array
- Each frame has `funcIndex`, `name`, `nameWithLibrary`, `library`
- Include `truncated` boolean if stack was limited
- Plain text formatter handles truncation display

### Nested Structures

For hierarchical data (processes/threads, marker groups):

- Use arrays of objects with optional nested arrays
- Plain text formatter uses indentation to show hierarchy
- JSON output preserves full structure naturally

## Testing Strategy

For each converted command:

1. **Type checking**: `yarn ts` should pass
2. **Unit tests**: `yarn test profile-query` should pass
3. **Integration tests**: `yarn test:cli` should pass
4. **Manual testing** (optional but recommended):

   ```bash
   # Build and start a session
   yarn build-profile-query-cli
   pq load path/to/profile.json

   # Test plain text output (should match old behavior)
   pq thread info

   # Test JSON output
   pq thread info --json
   pq thread info --json | jq '.cpuActivity[0]'
   ```

## Benefits of This Approach

1. **No breaking changes** - Default behavior unchanged
2. **Type safety** - Full TypeScript types for all JSON structures
3. **Reusable data** - JSON can be piped to jq, saved to files, etc.
4. **Maintainable** - Clear separation between data collection and formatting
5. **Testable** - Structured data easier to test than formatted strings
6. **Documented** - JSON structure serves as API documentation

## Success Criteria

✅ **All success criteria met:**

- ✅ All 11 commands return structured `CommandResult` types
- ✅ All commands work with `--json` flag
- ✅ All commands work without `--json` flag (backward compatible)
- ✅ All tests pass (`yarn test profile-query` and `yarn test:cli`)
- ✅ Type checking passes (`yarn ts`)
- ✅ Linting passes (`yarn lint-fix`)

The JSON output implementation is now complete. All profile-query CLI commands support both human-readable text output (default) and structured JSON output (with `--json` flag) for programmatic processing.
