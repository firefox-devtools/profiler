# Profile Query Library

A library for programmatically querying the contents of a Firefox Profiler profile.

## Usage

**Note:** Most users should use the [profiler-cli](../profiler-cli/README.md) (`profiler-cli` command) instead of using this library directly.

### Building

```bash
yarn build-profile-query
```

### Programmatic Usage

```javascript
// Node.js interactive session
const { ProfileQuerier } = (await import('./dist/profile-query.js')).default;

// Load from file
const p1 = await ProfileQuerier.load('/path/to/profile.json.gz');

// Load from profiler.firefox.com URL
const p2 = await ProfileQuerier.load(
  'https://profiler.firefox.com/from-url/http%3A%2F%2Fexample.com%2Fprofile.json/'
);

// Load from share URL
const p3 = await ProfileQuerier.load('https://share.firefox.dev/4oLEjCw');

// Query the profile
const profileInfo = await p1.profileInfo();
const threadInfo = await p1.threadInfo();
const samples = await p1.threadSamples();
```

All query methods return structured result objects (typed as `WithContext<...>` or a specific result type), not plain strings. The `context` field on most results includes the current selected thread and view range.

## Available Methods

### Loading

- `static async load(filePathOrUrl: string): Promise<ProfileQuerier>` - Load a profile from file or URL

### Profile & Thread Info

- `async profileInfo(showAll?: boolean, search?: string): Promise<WithContext<ProfileInfoResult>>` - Get profile summary (processes, threads, CPU activity)
- `async threadInfo(threadHandle?: string): Promise<WithContext<ThreadInfoResult>>` - Get detailed thread information
- `async threadSelect(threadHandle: string): Promise<string>` - Select a thread for subsequent queries

### Thread Samples

- `async threadSamples(threadHandle?: string, includeIdle?: boolean, search?: string, sampleFilters?: SampleFilterSpec[]): Promise<WithContext<ThreadSamplesResult>>` - Get top functions and heaviest stack for a thread
- `async threadSamplesTopDown(threadHandle?: string, callTreeOptions?: CallTreeCollectionOptions, includeIdle?: boolean, search?: string, sampleFilters?: SampleFilterSpec[]): Promise<WithContext<ThreadSamplesTopDownResult>>` - Get top-down call tree
- `async threadSamplesBottomUp(threadHandle?: string, callTreeOptions?: CallTreeCollectionOptions, includeIdle?: boolean, search?: string, sampleFilters?: SampleFilterSpec[]): Promise<WithContext<ThreadSamplesBottomUpResult>>` - Get bottom-up (inverted) call tree

### Markers

- `async threadMarkers(threadHandle?: string, filterOptions?: MarkerFilterOptions): Promise<WithContext<ThreadMarkersResult>>` - List markers with aggregated statistics
- `async markerInfo(markerHandle: string): Promise<WithContext<MarkerInfoResult>>` - Get detailed information about a specific marker
- `async markerStack(markerHandle: string): Promise<WithContext<MarkerStackResult>>` - Get the stack trace captured with a marker

### Functions

- `async functionExpand(functionHandle: string): Promise<WithContext<FunctionExpandResult>>` - Show the full untruncated name of a function
- `async functionInfo(functionHandle: string): Promise<WithContext<FunctionInfoResult>>` - Show detailed information about a function (library, resource, JS flags)
- `async threadFunctions(threadHandle?: string, filterOptions?: FunctionFilterOptions, includeIdle?: boolean, sampleFilters?: SampleFilterSpec[]): Promise<WithContext<ThreadFunctionsResult>>` - List all functions with CPU percentages

### View Range (Zoom)

- `async pushViewRange(rangeName: string): Promise<ViewRangeResult>` - Push a zoom range (supports timestamps, marker handles, seconds, milliseconds, or percentage values)
- `async popViewRange(): Promise<ViewRangeResult>` - Pop the most recent zoom range
- `async clearViewRange(): Promise<ViewRangeResult>` - Clear all zoom ranges, returning to full profile view

### Filter Stack

- `filterPush(spec: SampleFilterSpec, threadHandle?: string): FilterStackResult` - Push a sample filter onto the stack for the current thread
- `filterPop(count?: number, threadHandle?: string): FilterStackResult` - Pop the last `count` filters (default: 1)
- `filterClear(threadHandle?: string): FilterStackResult` - Clear all filters for the current thread
- `filterList(threadHandle?: string): FilterStackResult` - List all active filters for the current thread

### Session Status

- `async getStatus(): Promise<StatusResult>` - Get current session status (selected thread, zoom range stack, active filter stacks)

## Architecture

The library is built on top of the Firefox Profiler's Redux store and selectors:

- **ProfileQuerier**: Main class that wraps a Redux store and provides query methods
- **TimestampManager**: Manages timestamp naming for time range queries
- **ThreadMap**: Maps thread handles (e.g., `t-0`, `t-1`) to thread indexes
- **MarkerMap**: Maps marker handles (e.g., `m-0`, `m-1`) to marker indexes within threads
- **FilterStack**: Manages per-thread stacks of sample filters (backed by Redux transforms)
- **Function handles**: Canonical handles like `f-123` refer to shared `profile.shared.funcTable` indices and are stable across sessions for the same processed profile data
- **Formatters**: Format query results into structured result objects

All query results are returned as typed result objects containing structured data. The CLI layer in `profiler-cli` is responsible for formatting these into human-readable text.
