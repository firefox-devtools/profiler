# Marker Support Implementation Plan for `pq` CLI

## Overview

This document outlines the implementation plan for adding comprehensive marker support to the profile-query CLI (`pq`). Markers provide ~50% of profiling insight (Layout/Reflow, JavaScript names, IPC messages, GPU boundaries) and are a critical missing feature.

## Background

### Marker Data Model (from codebase analysis)

**Core Types:**

- `Marker`: `{ start: ms, end: ms | null, name: string, category: number, data: MarkerPayload | null, threadId: Tid | null }`
- `MarkerPayload`: Union of 30+ specific payload types (Network, GCMajor, FileIO, IPC, DOMEvent, etc.)
- `MarkerSchema`: Defines display rules (`tooltipLabel`, `tableLabel`, `chartLabel`, `fields[]`, `display[]`, `description`)

**Web UI Views:**

1. **Marker Chart**: Rows grouped by (category, name), shows rectangles for intervals or diamonds for instants
   - Each marker has a `chartLabel` (can be templated from payload data)
   - Markers filtered by `display: ['marker-chart']` in schema
2. **Marker Table**: One row per marker with columns: start, end, name, tableLabel
   - `tableLabel` is templated from marker schema
3. **Tooltip/Sidebar**: Shows `tooltipLabel`, all field key-value pairs, type description, stack trace if available

**Key Properties:**

- Instant markers: `end === null`
- Interval markers: `end !== null`
- Markers can have stacks (cause backtraces)
- Markers can have rich structured data (via MarkerSchema fields)
- Tens of thousands of markers per thread is common

## Problem Statement

We cannot naively print all markers and their fields to the CLI because:

1. Profiles often contain 10,000+ markers per thread
2. Each marker can have 5-15 fields with verbose values
3. This would overwhelm both the reader and the LLM context window
4. Different marker types need different presentation strategies

## Design Principles

1. **Aggregation First**: Show summaries, not raw data
2. **Progressive Disclosure**: Start with overview, allow drilling down
3. **Context-Aware Grouping**: Group markers intelligently based on their characteristics
4. **Actionable Insights**: Present data that helps diagnose performance issues
5. **Format Flexibility**: Support both human-readable and machine-parseable output

## Implementation Phases

### Phase 1: Basic Marker Listing (MVP)

**Goal**: Show high-level marker distribution and basic statistics

**Commands:**

```bash
pq thread markers                     # List marker groups with counts
pq thread markers --summary           # Show aggregate statistics
pq marker info <marker-handle>        # Show details for a specific marker
```

**`pq thread markers` output:**

```
Markers in thread t-93 (Renderer) — 14,523 markers

By Type (top 15):
  Reflow                     4,234 markers  (interval: min=0.12ms, avg=2.3ms, max=45.2ms)
  DOMEvent                   3,891 markers  (interval: min=0.01ms, avg=0.5ms, max=12.1ms)
  Styles                     2,456 markers  (interval: min=0.05ms, avg=1.2ms, max=8.7ms)
  JavaScript                 1,823 markers  (instant)
  Paint                        892 markers  (interval: min=0.3ms, avg=5.1ms, max=23.4ms)
  Network                      234 markers  (interval: min=5.2ms, avg=234.5ms, max=2341.2ms)
  GCSlice                      156 markers  (interval: min=0.8ms, avg=12.3ms, max=156.7ms)
  IPC (IPCOut)                  89 markers  (interval: min=0.01ms, avg=2.1ms, max=45.2ms)
  ... (7 more types)

By Category:
  Layout                     6,892 markers (47.5%)
  JavaScript                 4,234 markers (29.1%)
  Graphics                   1,456 markers (10.0%)
  ... (4 more categories)

Rate Analysis (markers/second):
  DOMEvent: 45.2 markers/sec (rate: min=0.5ms, avg=22.1ms, max=2341ms)
  Reflow: 12.3 markers/sec (rate: min=1.2ms, avg=81.2ms, max=5234ms)
  Styles: 8.9 markers/sec (rate: min=2.1ms, avg=112.4ms, max=8912ms)

Use --type <name> to filter, --details for per-marker info, or m-<N> handles to inspect individual markers.
```

**`pq thread markers --summary` output:**

```
Marker Summary for thread t-93 (Renderer)

Total markers: 14,523
Time range: 2.145s - 15.891s (13.746s)
Marker types: 22
Marker categories: 7

Instant markers: 2,891 (19.9%)
Interval markers: 11,632 (80.1%)

Duration statistics (interval markers only):
  Min: 0.01ms
  Avg: 3.4ms
  Median: 1.2ms
  P95: 12.3ms
  P99: 45.6ms
  Max: 234.5ms

Longest intervals:
  m-1234: Paint - 234.5ms (7.234s - 7.469s)
  m-5678: GCMajor - 156.7ms (10.123s - 10.280s)
  m-3456: Reflow - 89.3ms (12.456s - 12.545s)
  m-7890: Network (https://example.com/api) - 2341.2ms (3.234s - 5.575s)
  m-2345: DOMEvent (click) - 45.2ms (8.123s - 8.168s)
```

**Implementation Tasks:**

- [x] Create `formatters/marker-info.ts` for marker formatting logic
- [x] Implement `MarkerMap` class (similar to `ThreadMap`, `FunctionMap`)
- [x] Add marker aggregation functions (group by type, category, compute stats)
- [x] Add `ProfileQuerier.threadMarkers()` method
- [x] Add `ProfileQuerier.markerInfo(markerHandle)` method
- [x] Wire up in protocol.ts, daemon.ts, index.ts
- [x] Add unit tests for utility functions (formatDuration, computeDurationStats, computeRateStats)

**Status: ✅ COMPLETE** (Commits: 25eaf637, 63e5d2d7)

**Data Structures:**

```typescript
// MarkerMap for handle management
class MarkerMap {
  private markers: Marker[] = [];
  private handleToIndex: Map<string, MarkerIndex> = new Map();
  private indexToHandle: Map<MarkerIndex, string> = new Map();

  registerMarker(marker: Marker, index: MarkerIndex): string;
  getMarker(handle: string): Marker | null;
  getMarkers(): Marker[];
}

// Aggregation structures
interface MarkerTypeStats {
  typeName: string;
  count: number;
  isInterval: boolean;
  durationStats?: DurationStats;
  rateStats?: RateStats;
  topMarkers: Array<{ handle: string; label: string; duration?: number }>;
}

interface DurationStats {
  min: number;
  max: number;
  avg: number;
  median: number;
  p95: number;
  p99: number;
}

interface RateStats {
  markersPerSecond: number;
  minGap: number;
  avgGap: number;
  maxGap: number;
}
```

### Phase 2: Filtering and Search

**Goal**: Allow users to filter markers by various criteria

**Status: ✅ COMPLETE** (Commits: 1e478dcc, 43ccb20c)

**What was implemented:**

Phase 2 provides both text-based search and duration-based filtering:

**Search filtering** leverages the existing marker search functionality built into the profiler codebase. This approach:

- Reuses tested, proven code from the web UI
- Avoids duplicating complex filtering logic
- Provides a simple, flexible search interface

**Duration filtering** is implemented by filtering marker indexes after search filtering:

- Filters markers by minimum and/or maximum duration in milliseconds
- Excludes instant markers when duration constraints are specified
- Supports combination with search filtering

**Commands:**

```bash
pq thread markers --search DOMEvent                        # Search for "DOMEvent" markers
pq thread markers --search Stack                           # Search for markers with "Stack" in name
pq thread markers --category Graphics                      # Filter by Graphics category
pq thread markers --category GC                            # Partial match: matches "GC / CC"
pq thread markers --has-stack                              # Only markers with stack traces
pq thread markers --min-duration 10                        # Markers with duration >= 10ms
pq thread markers --max-duration 100                       # Markers with duration <= 100ms
pq thread markers --limit 1000                             # Limit to first 1000 markers
pq thread markers --min-duration 5 --max-duration 50       # Markers between 5-50ms
pq thread markers --category Other --min-duration 10       # Combined category and duration
pq thread markers --has-stack --category Layout --min-duration 1  # All filters combined
pq thread markers --category Layout --limit 50             # Limit after filtering
pq thread markers --search Reflow --min-duration 5         # Combined search and duration
```

**Output example:**

```bash
$ pq thread markers --search DOMEvent

Markers in thread t-0 (Parent Process) — 2849 markers (filtered from 258060)

By Type (top 15):
  DOMEvent                   2849 markers  (interval: min=0.40μs, avg=14.53μs, max=2.25ms)

By Category:
  DOM                        2849 markers (100.0%)

Rate Analysis (markers/second):
  DOMEvent: 93.7 markers/sec (rate: min=2.40μs, avg=10.68ms, max=3.37s)

Use --search <term> to filter markers, or m-<N> handles to inspect individual markers.
```

**Implementation approach:**

```typescript
// Use built-in marker search instead of custom filtering
if (searchString) {
  store.dispatch(changeMarkersSearchString(searchString));
}
const filteredIndexes = searchString
  ? threadSelectors.getSearchFilteredMarkerIndexes(state)
  : threadSelectors.getFullMarkerListIndexes(state);
// Always clear search after use
store.dispatch(changeMarkersSearchString(''));
```

**Completed Tasks:**

- [x] Add `--search` parameter to CLI
- [x] Wire up `changeMarkersSearchString` action dispatch
- [x] Use `getSearchFilteredMarkerIndexes` selector for filtered results
- [x] Add try/finally block to ensure search string is cleared
- [x] Update protocol, daemon, and CLI to pass search string
- [x] Show "(filtered from N)" when filters are active
- [x] Update help text with search examples
- [x] Add `--min-duration` and `--max-duration` parameters to CLI
- [x] Implement duration filtering by whittling down filtered marker indexes
- [x] Add validation for duration parameter inputs
- [x] Update help text with duration filtering examples
- [x] Add `--category` parameter to CLI for filtering by category name
- [x] Implement case-insensitive substring matching for category filtering
- [x] Update help text with category filtering examples

**Additional enhancements (implemented):**

- [x] `--min-duration <ms>` - Filter by minimum duration (Committed: 43ccb20c)
- [x] `--max-duration <ms>` - Filter by maximum duration (Committed: 43ccb20c)
- [x] `--category <name>` - Filter by category name with case-insensitive substring matching (Committed: 7a44d4f9)
- [x] `--has-stack` - Only show markers with stack traces (Committed: bd52b911)
- [x] `--limit <N>` - Limit the number of markers used in aggregation (Committed: pending)

Duration filtering is implemented by filtering the marker indexes after search filtering. Instant markers (markers with no end time) are excluded when duration constraints are specified.

Category filtering uses case-insensitive substring matching on category names, allowing partial matches (e.g., "GC" matches "GC / CC").

Stack filtering checks for markers that have a `cause` field in their data payload, which contains stack trace information.

Limit caps the number of markers used in aggregation after all other filters are applied. This is useful for quickly examining a subset of markers from large profiles.

**Future enhancements (not yet implemented):**

The following filtering options could be added in the future:

- [ ] `--field <key>:<value>` - Filter by field values

### Phase 3: Smart Grouping and Sub-grouping

**Goal**: Handle markers with similar names but different characteristics

**Status: ✅ COMPLETE** (Commits: 7c64ef07, ae17f140)

**What was implemented:**

Phase 3 provides multi-level marker grouping with both manual and automatic grouping strategies:

**Custom grouping** via `--group-by` allows hierarchical grouping by any combination of:

- `type`: Marker type (data.type)
- `name`: Marker name
- `category`: Category name
- `field:<fieldname>`: Any marker field (e.g., `field:eventType`, `field:phase`)

**Auto-grouping** via `--auto-group` uses a smart heuristic to automatically select the best field for sub-grouping:

- Prefers fields with 3-20 unique values (ideal grouping range)
- Avoids fields with too many unique values (>50, likely IDs or timestamps)
- Requires fields to appear in >80% of markers
- Boosts score for fields that appear in all markers

**Commands:**

```bash
pq thread markers --group-by type,name             # Group by type, then name
pq thread markers --group-by type,field:eventType  # Group by type, then eventType field
pq thread markers --group-by category,type         # Group by category, then type
pq thread markers --auto-group                     # Automatic smart grouping
pq thread markers --search DOMEvent --group-by field:eventType  # Filter + custom grouping
```

**Output example:**

```bash
$ pq thread markers --search DOMEvent --auto-group --limit 200

Markers in thread t-0 (Parent Process) — 200 markers (filtered from 258060)

By Type (top 15):
  DOMEvent                    200 markers  (interval: min=0.60μs, avg=41.65μs, max=2.06ms)
    pointermove                  59 markers  (interval: min=1.30μs, avg=2.82μs, max=4.50μs)
    mousemove                    59 markers  (interval: min=16.00μs, avg=27.55μs, max=84.30μs)
    MozAfterPaint                16 markers  (interval: min=1.30μs, avg=4.41μs, max=8.50μs)
    mouseenter                   15 markers  (interval: min=0.60μs, avg=1.07μs, max=3.20μs)
    mouseleave                   13 markers  (interval: min=0.60μs, avg=1.25μs, max=3.10μs)
    ...
```

**Completed Tasks:**

- [x] Implement multi-level grouping (group by multiple keys)
- [x] Add auto-grouping heuristic (analyze marker field variance with smart scoring)
- [x] Add `--group-by` flag with support for `type`, `name`, `category`, `field:<fieldname>`
- [x] Implement sub-group statistics (per-group duration/rate stats)
- [x] Add hierarchical display with proper indentation
- [x] Limit recursive depth to 3 levels to prevent excessive nesting

### Phase 4: Marker Details and Field Display

**Goal**: Show detailed information for individual markers

**Status: ✅ COMPLETE** (Commits: 77c95d9d, d9817b0d)

**What was implemented:**

Phase 4 provides comprehensive marker inspection with detailed field display and complete stack trace viewing. Marker handles are now visible in marker listings, making it easy to inspect specific markers.

**Commands:**

```bash
pq marker info <handle>           # Full marker details with stack preview
pq marker stack <handle>          # Complete stack trace (all frames)
```

**Actual output:**

```bash
$ pq thread markers --has-stack --limit 3

Markers in thread t-0 (Parent Process) — 3 markers (filtered from 258060)

By Type (top 15):
  TextStack                     1 markers  (interval: min=651.20μs, avg=651.20μs, max=651.20μs)
    Examples: m-1 (651.20μs)
  Text                          1 markers  (interval: min=1.93ms, avg=1.93ms, max=1.93ms)
    Examples: m-2 (1.93ms)
  FlowMarker                    1 markers  (instant)
    Examples: m-3

$ pq marker info m-1

Marker m-1: NotifyObservers - NotifyObservers

Type: TextStack
Category: Other
Time: 1h2m - 1h2m (651.20μs)
Thread: t-0 (Parent Process)

Fields:
  Details: profiler-started

Stack trace:
  Captured at: 1h2m
  [1] xul.dll!NotifyObservers(char const*, nsISupports*)
  [2] xul.dll!NotifyProfilerStarted(mozilla::PowerOfTwo<unsigned int> const&, mozilla::Maybe<double>)
  [3] xul.dll!profiler_start(mozilla::PowerOfTwo<unsigned int>)
  ...
  [20] xul.dll!js::InternalCallOrConstruct(JSContext*, JS::CallArgs const&, js::)
  ... (101 more frames)

Use 'pq marker stack m-1' for the full stack trace.

$ pq marker stack m-1

Stack trace for marker m-1: NotifyObservers

Thread: t-0 (Parent Process)
Captured at: 1h2m

  [1] xul.dll!NotifyObservers(char const*, nsISupports*)
  [2] xul.dll!NotifyProfilerStarted(mozilla::PowerOfTwo<unsigned int> const&, mozilla::Maybe<double>)
  ...
  [120] ntdll.dll!RtlUserThreadStart
  [121] (root)
```

**Implementation details:**

- **Marker handles visible**: Top 3 example markers shown for each type with handles and durations
- **`pq marker info`**: Shows full marker details with stack trace preview (first 20 frames)
- **`pq marker stack`**: Displays complete stack traces without frame limit
- **Stack formatting**: Reuses formatFunctionNameWithLibrary() for consistent display with library names
- **MarkerSchema integration**: Fields formatted using existing MarkerSchema formatters from web UI

**Implementation Tasks:**

- [x] Implement `markerInfo(handle)` method
- [x] Format marker fields using MarkerSchema formatters
- [x] Add stack trace formatting (walks stack table, formats with library names)
- [x] Implement `markerStack(handle)` method for full stack traces
- [x] Display marker handles in listings (top 3 examples per type)
- [x] Wire up in protocol.ts, daemon.ts, index.ts
- [x] Update CLI help text and examples

**Future enhancements (not yet implemented):**

- [ ] `pq marker expand <handle>` - Show full field values for truncated fields
- [ ] `--format json` option for machine-readable output

### Phase 5: Temporal Visualization (ASCII Charts)

**Goal**: Provide a compact visual representation of marker timing

**Commands:**

```bash
pq thread markers --timeline                       # ASCII timeline
pq thread markers --type Reflow --timeline         # Timeline for specific type
pq thread markers --histogram                      # Duration histogram
```

**Output example:**

```bash
$ pq thread markers --type Reflow --timeline

Reflow markers timeline (thread t-93, 2.145s - 15.891s, 13.746s total)

Duration histogram (4,234 markers):
  0-1ms     ████████████████████████████████████████ 1,892 (44.7%)
  1-2ms     ████████████████████ 956 (22.6%)
  2-5ms     ████████████ 587 (13.9%)
  5-10ms    ██████ 324 (7.7%)
  10-20ms   ███ 234 (5.5%)
  20-50ms   ██ 189 (4.5%)
  50-100ms  █ 45 (1.1%)
  100ms+    █ 7 (0.2%)

Timeline (each char = 137ms, | = marker):
2.1s  |  |    ||  | |  |       |  ||     |    |  |        |   |    3.5s
3.5s  |     |  | ||  |||   |  | |    |      || |  |   |       |    4.9s
4.9s    |   |||   |  |  |    ||    |  |    |    ||  |    |  |  |   6.3s
6.3s  |  |    |  |||    |  |    | |  |  |    |  |    |  |  | |     7.7s
7.7s    |  ||  |    |  |  | ||     |    |  |  ||    |  |   |  |    9.1s
9.1s  | |    |   || |     |   | |  |  |    ||    | |   | |    |   10.5s
10.5s   |  |  |    |  ||   |  |    || |   |  |  |   ||   |  |  |   11.9s
11.9s |  |    | ||    |  | |    |  |    |  ||   |  |    | |    |   13.3s
13.3s   | |  |    | |   ||   | |  |   || |   | |    |  |  | |  |   14.7s
14.7s  |   || |  |    | |  |    ||  | |    | |   |  |  |    |  |   15.9s

Density over time (markers per second):
  2-4s:   12.3/s ████████
  4-6s:   18.7/s ████████████
  6-8s:   8.9/s  ██████
  8-10s:  23.4/s ███████████████
  10-12s: 15.6/s ██████████
  12-14s: 11.2/s ███████
  14-16s: 6.7/s  ████

Peak activity: 8.123s - 8.456s (23 markers in 333ms window)
```

**Implementation Tasks:**

- [ ] Implement ASCII timeline generator
- [ ] Implement duration histogram generator
- [ ] Add density analysis (markers per time bucket)
- [ ] Make timeline resolution configurable (auto-adjust to terminal width)
- [ ] Add `--width` flag to control chart width

### Phase 6: Advanced Analysis Features

**Goal**: Provide deeper insights into marker patterns

**Commands:**

```bash
pq thread markers --rate-analysis                  # Analyze marker rate patterns
pq thread markers --type Network --waterfall       # Network waterfall chart
pq thread markers --overlap-analysis               # Find overlapping markers
pq thread markers --critical-path                  # Identify critical path markers
```

**Rate Analysis Output:**

```bash
$ pq thread markers --type DOMEvent --rate-analysis

Rate analysis for DOMEvent markers (thread t-93)

Overall rate: 45.2 markers/sec

Inter-marker gaps (time between successive markers):
  Min: 0.5ms
  Avg: 22.1ms
  Median: 18.7ms
  P95: 89.3ms
  P99: 234.5ms
  Max: 2341.2ms

Burst detection (3+ markers within 50ms):
  Burst at 8.123s: 5 markers in 23ms (click cascade)
  Burst at 10.234s: 8 markers in 45ms (scroll events)
  Burst at 12.456s: 4 markers in 31ms (mousemove cluster)
  ... (12 more bursts)

Idle periods (>1000ms without markers):
  1.234s - 2.567s (1333ms)
  5.678s - 7.123s (1445ms)
  13.890s - 15.234s (1344ms)
```

**Network Waterfall Output:**

```bash
$ pq thread markers --type Network --waterfall

Network waterfall (thread t-93, 50 requests)

Time     Duration  Status  URL
2.145s   ████████  200     https://example.com/api/users
2.234s   ██        200     https://cdn.example.com/logo.png
2.267s   ███       200     https://cdn.example.com/style.css
2.289s   ████      200     https://cdn.example.com/app.js
2.345s      ████████████  200     https://api.example.com/data?page=1
2.456s      ██        304     https://cdn.example.com/font.woff2
...

Legend:
  ████ = Request (DNS + Connect + Request + Response)
  Each █ = ~50ms
```

**Implementation Tasks:**

- [ ] Implement rate analysis (gap statistics, burst detection)
- [ ] Implement overlap detection (find concurrent markers)
- [ ] Add network waterfall visualization
- [ ] Add critical path analysis (longest marker chains)
- [ ] Add `--export` flag to save analysis to JSON/CSV

## Technical Implementation Details

### Component Structure

```
src/profile-query/
├── index.ts                          # ProfileQuerier class
├── formatters/
│   ├── marker-info.ts               # Marker listing/summary formatters
│   ├── marker-details.ts            # Individual marker detail formatter
│   ├── marker-timeline.ts           # ASCII timeline/histogram generators
│   └── marker-analysis.ts           # Advanced analysis formatters
├── marker-map.ts                    # MarkerMap handle manager
├── marker-aggregator.ts             # Marker aggregation logic
├── marker-filter.ts                 # Marker filtering logic
└── marker-grouping.ts               # Smart grouping heuristics
```

### Key Algorithms

**1. Marker Aggregation**

```typescript
function aggregateMarkersByType(
  markers: Marker[],
  markerSchemaByName: MarkerSchemaByName
): MarkerTypeStats[] {
  const groups = new Map<string, Marker[]>();

  for (const marker of markers) {
    const type = marker.data?.type ?? 'Unknown';
    if (!groups.has(type)) {
      groups.set(type, []);
    }
    groups.get(type)!.push(marker);
  }

  return Array.from(groups.entries()).map(([type, markers]) => ({
    typeName: type,
    count: markers.length,
    isInterval: markers[0].end !== null,
    durationStats: computeDurationStats(markers),
    rateStats: computeRateStats(markers),
    topMarkers: selectTopMarkers(markers, 5),
  }));
}
```

**2. Duration Statistics**

```typescript
function computeDurationStats(markers: Marker[]): DurationStats | undefined {
  const durations = markers
    .filter((m) => m.end !== null)
    .map((m) => m.end! - m.start)
    .sort((a, b) => a - b);

  if (durations.length === 0) return undefined;

  return {
    min: durations[0],
    max: durations[durations.length - 1],
    avg: durations.reduce((a, b) => a + b, 0) / durations.length,
    median: durations[Math.floor(durations.length / 2)],
    p95: durations[Math.floor(durations.length * 0.95)],
    p99: durations[Math.floor(durations.length * 0.99)],
  };
}
```

**3. Rate Statistics**

```typescript
function computeRateStats(markers: Marker[]): RateStats {
  const sorted = [...markers].sort((a, b) => a.start - b.start);
  const gaps: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    gaps.push(sorted[i].start - sorted[i - 1].start);
  }

  const timeRange = sorted[sorted.length - 1].start - sorted[0].start;
  const markersPerSecond = (markers.length / timeRange) * 1000;

  return {
    markersPerSecond,
    minGap: Math.min(...gaps),
    avgGap: gaps.reduce((a, b) => a + b, 0) / gaps.length,
    maxGap: Math.max(...gaps),
  };
}
```

**4. Smart Grouping**

```typescript
function autoGroupMarkers(
  markers: Marker[],
  schema: MarkerSchema
): GroupingStrategy {
  // Analyze variance in marker fields
  const fieldVariance = analyzeFieldVariance(markers, schema);

  // If a field has high variance (e.g., eventType in DOMEvent markers),
  // use it as a grouping key
  const highVarianceFields = fieldVariance
    .filter((f) => f.uniqueRatio > 0.3) // >30% unique values
    .sort((a, b) => b.uniqueRatio - a.uniqueRatio);

  if (highVarianceFields.length > 0) {
    return { type: 'field', field: highVarianceFields[0].key };
  }

  // Fall back to type-level grouping
  return { type: 'type' };
}
```

### Protocol Updates

**`protocol.ts`:**

```typescript
export type ClientCommand =
  | { command: 'thread'; subcommand: 'markers'; options?: MarkerListOptions }
  | { command: 'marker'; subcommand: 'info'; marker: string }
  | { command: 'marker'; subcommand: 'stack'; marker: string }
  | { command: 'marker'; subcommand: 'expand'; marker: string; field: string };
// ... existing commands

interface MarkerListOptions {
  type?: string; // Filter by type
  category?: string; // Filter by category
  minDuration?: number; // Min duration in ms
  maxDuration?: number; // Max duration in ms
  nameFilter?: string; // Regex for name
  fieldFilter?: string; // Format: "field:value"
  hasStack?: boolean; // Only markers with stacks
  groupBy?: string; // Grouping strategy
  timeline?: boolean; // Show ASCII timeline
  histogram?: boolean; // Show duration histogram
  summary?: boolean; // Show summary only
  limit?: number; // Limit output lines
  format?: 'text' | 'json'; // Output format
}
```

## Testing Strategy

1. **Unit Tests** (`src/test/unit/profile-query-markers.test.ts`):
   - Test marker aggregation functions
   - Test filtering logic
   - Test statistics calculations
   - Test ASCII chart generation

2. **Integration Tests** (`yarn test:cli`):
   - Test marker listing with real profiles
   - Test filtering combinations
   - Test grouping strategies
   - Test marker detail display

3. **Manual Testing**:
   - Test with large profiles (10k+ markers)
   - Test with different marker types
   - Test edge cases (no markers, single marker, all instant/interval)

## Performance Considerations

1. **Lazy Marker Loading**: Don't load all marker details unless needed
2. **Pagination**: For large result sets, support pagination (e.g., `--page 2 --page-size 50`)
3. **Streaming Output**: For very large listings, stream output instead of buffering
4. **Caching**: Cache aggregated stats in ProfileQuerier for repeated queries
5. **Sampling**: For >10k markers, consider sampling for histogram/timeline

## Open Questions / Design Decisions

1. **Handle Persistence**: Should marker handles (m-N) be stable across sessions, or ephemeral?
   - **Decision**: Ephemeral within session (like function handles), reset on each `pq load`

2. **Default Grouping**: What should be the default grouping strategy?
   - **Decision**: Group by type first, with option to drill down

3. **Timeline Resolution**: How to auto-adjust timeline character width?
   - **Decision**: Divide time range by terminal width (default 80 chars), cap at 1 char = 10ms minimum

4. **Field Display**: Should we show all fields by default or only non-hidden fields?
   - **Decision**: Follow marker schema `hidden` flag, add `--all-fields` to override

5. **Stack Traces**: Should stacks be shown inline or require separate command?
   - **Decision**: Show truncated stack (top 5 frames) in `marker info`, full stack in `marker stack`

6. **JSON Output**: What should the JSON schema look like?
   - **Decision**: Match web UI's marker structure, include all computed stats

## Success Metrics

1. Can view marker distribution across a thread in <5 seconds
2. Can identify performance bottlenecks (long markers) in <3 commands
3. Can filter to specific marker types/categories in 1 command
4. Can inspect individual marker details including stack traces
5. Output is readable and actionable for performance analysis

## Future Enhancements (Post-Launch)

1. **Marker Comparison**: Compare marker patterns between two time ranges
2. **Marker Correlation**: Find correlations between different marker types
3. **Marker Export**: Export filtered markers to flamegraph format
4. **Marker Diff**: Compare markers between two profiles
5. **Smart Filters**: Pre-defined filters for common analysis tasks (e.g., "long-layout", "slow-network")
6. **Interactive Mode**: TUI for browsing markers interactively

## Implementation Priority

**Must Have (Phase 1 & 2):**

- Basic marker listing with aggregation
- Marker type/category filtering
- Individual marker details
- Duration statistics

**Should Have (Phase 3 & 4):**

- Smart grouping by fields
- Marker stack traces
- Field-based filtering

**Nice to Have (Phase 5 & 6):**

- ASCII timeline/histogram
- Rate analysis
- Network waterfall
- Critical path analysis

## Timeline Estimate

- Phase 1 (Basic Listing): 2-3 days
- Phase 2 (Filtering): 1-2 days
- Phase 3 (Grouping): 1-2 days
- Phase 4 (Details): 1-2 days
- Phase 5 (Visualization): 2-3 days
- Phase 6 (Advanced): 2-3 days

**Total**: ~2 weeks for full implementation
**MVP (Phases 1-2)**: ~1 week
