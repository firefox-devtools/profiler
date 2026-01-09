# Processed Profile Format

The Gecko Profiler emits JSON profiles that Firefox Profiler can display. This original Gecko profile format needs to be processed in order to provide a data structure that is optimized for JavaScript analysis and performance. This client-side step provides a convenient mechanism for pre-processing certain data transformations.

## Why Process the Profile?

The largest transformation is moving the performance data from a list of small objects (each entry being an object with multiple properties) to a few array tables containing long lists of primitive values. This structure-of-arrays approach has significant performance benefits:

**Example transformation:**
- **Before (array-of-objects):** 1000 samples = 1 array containing 1000 objects, each with 7 properties
- **After (structure-of-arrays):** 1000 samples = 1 table object containing 7 arrays, each of length 1000

**Benefits:**
- Fewer objects need to be tracked by the garbage collector
- Smaller serialized file

## Profile Structure Overview

A processed profile consists of these main components:

### Top-Level Structure

```typescript
Profile {
  meta: ProfileMeta           // Metadata about the recording session
  libs: Lib[]                 // Shared libraries loaded during profiling
  pages?: PageList            // Browser pages/tabs (for web content)
  counters?: RawCounter[]     // Performance counters (memory, CPU, etc.)
  profilerOverhead?: ProfilerOverhead[]  // Profiler's own overhead
  shared: RawProfileSharedData  // Shared data (strings, sources)
  threads: RawThread[]        // The actual thread data
  profilingLog?: ProfilingLog // Logs from the profiling process
  profileGatheringLog?: ProfilingLog // Logs from profile gathering
}
```

### Thread Structure

Each thread contains multiple tables that work together to represent the call stacks and timing data:

```typescript
RawThread {
  // Thread identification
  name: string                      // e.g., "GeckoMain", "Compositor", "DOM Worker"
  pid: Pid                          // e.g., "12345" (stringified process ID)
  tid: Tid                          // e.g., 67890 (thread ID, can be number or string)
  processType: ProcessType          // e.g., "default", "tab", "gpu", "plugin"
  processName?: string              // e.g., "Web Content" (human-readable)
  isMainThread: boolean             // true for the main thread of a process

  // Timing and lifecycle
  processStartupTime: Milliseconds  // When the process started
  processShutdownTime: Milliseconds | null  // When process ended (null if still running)
  registerTime: Milliseconds        // When thread was registered with profiler
  unregisterTime: Milliseconds | null  // When thread unregistered (null if still active)
  pausedRanges: PausedRange[]       // Periods when profiling was paused

  // Web content context (for content processes)
  'eTLD+1'?: string                 // e.g., "mozilla.org" (effective top-level domain)
  isPrivateBrowsing?: boolean       // true if this thread is for private browsing
  userContextId?: number            // Container ID (Firefox Multi-Account Containers)

  // Display options
  showMarkersInTimeline?: boolean   // Whether to show markers in timeline view
  isJsTracer?: boolean              // true if this is a JS tracing thread

  // Core profiling data tables
  samples: RawSamplesTable          // When and what was sampled
  stackTable: RawStackTable         // Call stack tree structure
  frameTable: FrameTable            // Individual stack frames
  funcTable: FuncTable              // Function information
  resourceTable: ResourceTable      // Where code came from (libraries, URLs)
  nativeSymbols: NativeSymbolTable  // Native code symbols
  markers: RawMarkerTable           // Arbitrary events and annotations

  // Optional specialized data
  jsAllocations?: JsAllocationsTable      // JS memory allocations
  nativeAllocations?: NativeAllocationsTable  // Native memory allocations
  jsTracer?: JsTracerTable          // Fine-grained JS tracing
}
```

**Common thread names:**
- `"GeckoMain"` - Main thread of the browser process
- `"Compositor"` - Graphics compositing thread
- `"Renderer"` - WebRender rendering thread
- `"DOM Worker"` - Web Worker thread
- `"StreamTrans"` - Network stream transport
- `"Socket Thread"` - Network socket operations

**Process types:**
- `"default"` - Main browser process
- `"tab"` / `"web"` - Web content process
- `"gpu"` - GPU process for graphics
- `"plugin"` - Plugin process (legacy)
- `"extension"` - Extension process

## Key Tables Explained

### Samples Table

The core data structure containing what functions were executing at specific points in time:

```typescript
RawSamplesTable {
  // Timing - either time OR timeDeltas must be present
  time?: Milliseconds[]                    // Absolute timestamp for each sample
  timeDeltas?: Milliseconds[]              // Time delta since previous sample (alternative to time)

  stack: Array<IndexIntoStackTable | null>  // What stack was active at this sample

  // Weighting
  weight: null | number[]                  // Sample weight (null means all weights are 1)
  weightType: 'samples' | 'tracing-ms' | 'bytes'  // What the weight represents

  // Responsiveness metrics
  responsiveness?: Array<Milliseconds | null>  // Older metric: event delay (16ms intervals)
  eventDelay?: Array<Milliseconds | null>  // Newer metric: hypothetical input event delay

  // CPU usage
  threadCPUDelta?: Array<number | null>    // CPU usage delta between samples

  // For merged profiles
  threadId?: Tid[]                         // Origin thread ID (only in merged threads)

  length: number
}
```

### Stack Table

Stores the tree of stack nodes efficiently. Instead of storing each complete call stack separately, stacks are represented as a tree where each node references its parent (prefix):

```typescript
RawStackTable {
  frame: IndexIntoFrameTable[]              // The frame at this stack node
  prefix: Array<IndexIntoStackTable | null>  // Parent stack (null for root)
  length: number
}
```

**How it works:**
- Root stack nodes have `null` as their prefix
- Each non-root stack has the index of its "caller" / "parent" as its prefix
- A complete call stack is obtained by walking from a node to the root
- Shared prefixes are stored only once, saving significant space

**Example:**
```
Call stacks:
  A -> B -> C
  A -> B -> D
  A -> E

Stack table representation:
  Index 0: frame=A, prefix=null
  Index 1: frame=B, prefix=0
  Index 2: frame=C, prefix=1
  Index 3: frame=D, prefix=1
  Index 4: frame=E, prefix=0
```

### Frame Table

Contains context information about function execution:

```typescript
FrameTable {
  address: Array<Address | -1>         // Memory address (for native code)
  inlineDepth: number[]                // Depth of inlined functions
  category: (IndexIntoCategoryList | null)[]  // Frame category
  subcategory: (IndexIntoSubcategoryListForCategory | null)[]
  func: IndexIntoFuncTable[]           // The function being executed
  nativeSymbol: (IndexIntoNativeSymbolTable | null)[]
  innerWindowID: (InnerWindowID | null)[]  // For correlating to pages
  line: (number | null)[]              // Source line number
  column: (number | null)[]            // Source column number
  length: number
}
```

### Function Table

Groups frames by the function they belong to:

```typescript
FuncTable {
  name: Array<IndexIntoStringTable>    // Function name
  isJS: Array<boolean>                 // Is this JavaScript?
  relevantForJS: Array<boolean>        // Show in JS views?
  resource: Array<IndexIntoResourceTable | -1>  // Where code came from
  source: Array<IndexIntoSourceTable | null>    // Source file (JS only)
  lineNumber: Array<number | null>     // Function start line (JS only)
  columnNumber: Array<number | null>   // Function start column (JS only)
  length: number
}
```

### Resource Table

Describes where code came from (libraries, web hosts, add-ons):

```typescript
ResourceTable {
  lib: Array<IndexIntoLibs | null>          // Native library
  name: Array<IndexIntoStringTable>         // Resource name
  host: Array<IndexIntoStringTable | null>  // Web host (for JS)
  type: ResourceTypeEnum[]                  // Resource type
  length: number
}
```

### Markers Table

Represents arbitrary events that happen during profiling (paints, network requests, user input, etc.):

```typescript
RawMarkerTable {
  data: Array<MarkerPayload | null>      // Structured marker data
  name: IndexIntoStringTable[]           // Marker name
  startTime: Array<number | null>        // When marker started (ms)
  endTime: Array<number | null>          // When marker ended (ms)
  phase: MarkerPhase[]                   // Instant, Interval, Start, End
  category: IndexIntoCategoryList[]      // Marker category
  threadId?: Array<Tid | null>           // Origin thread (for merged threads)
  length: number
}
```

## String Table

To save space, all strings are deduplicated into a single `stringArray`. Other tables reference strings by their index:

```typescript
RawProfileSharedData {
  stringArray: string[]  // All unique strings in the profile
  sources: SourceTable   // Source file mappings
}
```

## Weight Types

Profiles can represent different types of data through the weight system:

- **`samples`**: Traditional sampling profiles (weight of 1 per sample)
- **`tracing-ms`**: Tracing data converted to samples, weighted by duration in milliseconds
- **`bytes`**: Memory allocation profiles, weighted by bytes allocated

## Sample-Based vs. Tracing Data

The samples table can represent both traditional sampling and tracing data:

**Traditional sampling:** Fixed interval sampling (e.g., every 1ms), all samples weighted equally.

**Tracing as samples:** Convert tracing spans into self-time samples. For example:

```
Timeline:  0 1 2 3 4 5 6 7 8 9 10
Spans:     A A A A A A A A A A A
               B B D D D D
               C C E E E E

Self-time: A A C C E E E E A A A

Samples table:
  time:   [0,   2,   4,   8]
  stack:  [A, ABC, ADE,  A]
  weight: [2,   2,   4,  3]
```

## Profile Metadata

The `meta` object contains important context:

```typescript
ProfileMeta {
  interval: Milliseconds              // Sample interval (e.g., 1ms)
  startTime: Milliseconds             // Unix epoch timestamp (ms) when main process started
  endTime?: Milliseconds              // Unix epoch timestamp (ms) when profile capture ended
  profilingStartTime?: Milliseconds   // Offset from startTime (ms) when recording began
  profilingEndTime?: Milliseconds     // Offset from startTime (ms) when recording ended

  // Format versions - see CHANGELOG-formats.md for version history
  // When upgrading profiles, implement upgraders in src/profile-logic/process-profile.js
  version: number                     // Gecko profile format version (from browser)
  preprocessedProfileVersion: number  // Processed format version (this format)

  product: string                     // "Firefox" or other
  processType: number                 // Raw enum value for main process type
  stackwalk: 0 | 1                    // 1 if native stack walking enabled, 0 otherwise
  debug?: boolean                     // true for debug builds, false for opt builds

  // Categories define the color and grouping of stack frames (e.g., "JavaScript", "Layout", "Network")
  // If absent, a default category list is used. Must include a "grey" default category.
  categories?: CategoryList

  // Marker schema defines how to display markers in the UI - see docs-developer/markers.md
  markerSchema: MarkerSchema[]

  // Platform-specific clock values for precise time correlation across systems
  startTimeAsClockMonotonicNanosecondsSinceBoot?: number  // Linux/Android
  startTimeAsMachAbsoluteTimeNanoseconds?: number         // macOS
  startTimeAsQueryPerformanceCounterValue?: number        // Windows

  // Platform information
  platform?: string                   // e.g., "Windows", "Macintosh", "X11", "Android"
  oscpu?: string                      // e.g., "Intel Mac OS X"
  toolkit?: string                    // e.g., "gtk", "windows", "cocoa", "android"
  abi?: string                        // e.g., "x86_64-gcc3" (XPCOM ABI)
  misc?: string                       // e.g., "rv:63.0" (browser revision)

  // Hardware information
  physicalCPUs?: number               // Physical CPU cores
  logicalCPUs?: number                // Logical CPU cores (includes hyperthreading)
  CPUName?: string                    // e.g., "Intel Core i7-9750H"
  mainMemory?: Bytes                  // Total system RAM in bytes

  // Build information
  appBuildID?: string                 // e.g., "20230615120000"
  updateChannel?: string              // e.g., "nightly", "release", "beta", "esr", "default"
  sourceURL?: string                  // URL to source code revision
  device?: string                     // Device model (Android only, e.g., "Samsung Galaxy S21")

  // Extensions
  extensions?: ExtensionTable         // Browser extensions installed during capture

  // Symbolication status
  symbolicated?: boolean              // true if native symbols already resolved
  symbolicationNotSupported?: boolean // true if symbolication impossible (e.g., imported)

  // Profiler configuration
  configuration?: ProfilerConfiguration  // Settings: threads, features, capacity, etc.
  sampleUnits?: SampleUnits           // Units for sample table values (per-platform)

  // Visual metrics (browsertime only)
  visualMetrics?: VisualMetrics       // Page load visual performance metrics

  // Imported profile metadata
  importedFrom?: string               // Source product/tool name
  arguments?: string                  // Program arguments (for imported profiles)
  fileName?: string                   // File name (for size profiles)
  fileSize?: Bytes                    // Total file size (for size profiles)

  // UI hints for imported profiles
  usesOnlyOneStackType?: boolean      // Don't show stack type filtering
  sourceCodeIsNotOnSearchfox?: boolean  // Hide "Look up on Searchfox" option
  initialVisibleThreads?: ThreadIndex[]     // Pre-select visible threads
  initialSelectedThreads?: ThreadIndex[]    // Pre-select active thread
  keepProfileThreadOrder?: boolean    // Don't reorder by importance score
  extra?: ExtraProfileInfoSection[]   // Additional metadata sections

  // Power profiling
  gramsOfCO2ePerKWh?: number         // CO2 emissions per kWh (for power tracks)
}
```

## Categories and Subcategories

Categories are used to color-code and filter stack frames:

```typescript
Category {
  name: string                    // e.g., "JavaScript", "Layout", "Network"
  color: CategoryColor            // Visual color for the timeline
  subcategories: string[]         // More specific classifications
}
```

Frame categories determine the color and classification of stack nodes in the UI. If a frame has no category, it inherits from its parent in the call stack.

## Pages and Windows

For web content, the profile can track which code belongs to which page:

```typescript
Page {
  tabID: TabID                      // Shared across all pages in a tab's session history
  innerWindowID: InnerWindowID      // Unique ID for this JS window object (unique key)
  url: string                       // Page URL
  embedderInnerWindowID: number     // Parent frame's innerWindowID (0 for top-level)
  isPrivateBrowsing?: boolean       // true if opened in private browsing (Firefox 98+)
  favicon?: string | null           // Base64-encoded favicon data URI (Firefox 134+, null if unavailable)
}
```

Frames have an `innerWindowID` field that correlates them to specific pages.

## Memory Profiling

Memory allocations can be profiled and appear as specialized tables:

### JS Allocations

```typescript
JsAllocationsTable {
  time: Milliseconds[]
  className: string[]               // Object class name
  typeName: string[]                // Type (e.g., "JSObject")
  coarseType: string[]              // Coarse type (e.g., "Object")
  weight: Bytes[]                   // Allocation size
  weightType: 'bytes'
  inNursery: boolean[]              // Nursery vs. tenured
  stack: Array<IndexIntoStackTable | null>
  length: number
}
```

### Native Allocations

```typescript
NativeAllocationsTable {
  time: Milliseconds[]
  weight: Bytes[]                   // Allocation size (can be negative)
  weightType: 'bytes'
  stack: Array<IndexIntoStackTable | null>
  memoryAddress?: number[]          // Address of allocation
  threadId?: number[]               // Thread performing allocation
  length: number
}
```

## Counters

Track numeric values over time (memory usage, CPU load, custom metrics):

```typescript
RawCounter {
  name: string                      // Counter name (e.g., "Memory", "CPU Usage")
  category: string                  // Category for grouping
  description: string               // Human-readable description
  color?: GraphColor                // Graph color (e.g., "blue", "red", "green")
  pid: Pid                          // Process ID this counter belongs to
  mainThreadIndex: ThreadIndex      // Main thread of the process
  samples: RawCounterSamplesTable {
    // Either time OR timeDeltas must be present
    time?: Milliseconds[]           // Absolute timestamps
    timeDeltas?: Milliseconds[]     // Time deltas since previous sample
    number?: number[]               // Change count (pre-v43, now optional)
    count: number[]                 // Counter value at each sample
    length: number
  }
}
```

## TypeScript Type Definitions

The authoritative documentation for the processed profile format is in the TypeScript type definitions at [src/types/profile.ts](../src/types/profile.ts). The types include detailed inline documentation explaining each field.

## Working with Profiles

When working with processed profiles:

1. **Access strings:** Use indices to look up strings in `profile.shared.stringArray`
2. **Walk stacks:** Follow `prefix` links in the stack table to build complete call stacks
3. **Match frames to functions:** Use `frame.func` to group related frames
4. **Filter by category:** Use frame categories to focus on specific types of code
5. **Correlate to pages:** Use `innerWindowID` to filter by web page/tab
6. **Handle null values:** Many fields are nullable; always check before using

## Profile Processing Pipeline

1. **Gecko emits raw profile:** Original JSON from the browser
2. **Process profile:** Transform to structure-of-arrays format
3. **Symbolication:** Resolve addresses to function names (if needed)
4. **Analysis:** Extract derived data (call trees, timelines, etc.)
5. **Visualization:** Render in Firefox Profiler UI

## Version Compatibility

- `meta.version`: Gecko profile format version (from browser)
- `meta.preprocessedProfileVersion`: Processed format version (from profiler.firefox.com)

The profiler includes upgraders to handle older profile versions, ensuring backward compatibility.
