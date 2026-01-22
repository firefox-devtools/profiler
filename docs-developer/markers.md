# Markers

Markers are events that happen within the browser or application being profiled. Unlike samples (which are taken at regular intervals), every marker that is generated is recorded, providing an accurate picture of specific events. Markers can represent:

- **Instant events**: A single point in time (e.g., a DOM event firing)
- **Interval events**: Events with a start and end time (e.g., a paint operation)

Markers have a name, timing information, and optional structured data (payload) associated with them. They allow engineers to instrument their code with domain-specific information.

## Marker Schemas

Marker schemas define how markers are displayed in Firefox Profiler's UI. They specify:
- Which fields from the marker payload to display
- How to format those fields
- Where to show the markers (timeline, marker chart, marker table, etc.)
- Custom labels and descriptions

### Basic Schema Structure

```typescript
MarkerSchema {
  // Required fields
  name: string                      // Unique identifier matching the marker name
  display: MarkerDisplayLocation[]  // Where to show this marker type
  fields: MarkerSchemaField[]       // Fields to display from marker data

  // Optional display customization
  tooltipLabel?: string             // Label for tooltips (defaults to name)
  tableLabel?: string               // Label for marker table (defaults to name)
  chartLabel?: string               // Label for marker chart (defaults to name)
  description?: string              // User-facing description

  // Advanced features
  graphs?: MarkerGraph[]            // Create custom local tracks
  colorField?: string               // Key of field containing marker color
  isStackBased?: boolean            // True if markers are well-nested
}
```

### Example: Network Marker Schema

```typescript
{
  name: "Network",
  display: ["marker-chart", "marker-table", "timeline-overview"],
  tooltipLabel: "Network Request",
  tableLabel: "{marker.data.URI}",
  chartLabel: "{marker.data.requestMethod} {marker.data.URI}",
  fields: [
    { key: "URI", label: "URL", format: "url" },
    { key: "requestMethod", label: "Method", format: "string" },
    { key: "responseStatus", label: "Status", format: "integer" },
    { key: "contentType", label: "Content Type", format: "string" },
    { key: "pri", label: "Priority", format: "integer" },
    { key: "count", label: "Size", format: "bytes" }
  ],
  description: "Network requests to load resources"
}
```

## Marker Schema Fields

### Display Locations

The `display` array specifies where markers appear in the UI:

| Location | Description |
|----------|-------------|
| `marker-chart` | Main marker visualization timeline |
| `marker-table` | Searchable table of all markers |
| `timeline-overview` | Header timeline (requires `thread.showMarkersInTimeline = true` for imported profiles) |
| `timeline-memory` | Memory-specific timeline section |
| `timeline-ipc` | IPC (Inter-Process Communication) timeline |
| `timeline-fileio` | File I/O timeline |
| `stack-chart` | Stack chart view (not yet supported) |

### Field Definitions

Each field in the `fields` array describes a property from the marker's data payload:

```typescript
MarkerSchemaField {
  key: string              // Property name in marker.data
  label?: string           // Display label (defaults to key)
  format: MarkerFormatType // How to display the value
  hidden?: boolean         // Hide from tooltip/sidebar (still searchable)
}
```

## Format Types

The `format` field determines how values are displayed and whether they're sanitized:

### String Formats

| Format | Description | PII Handling |
|--------|-------------|--------------|
| `string` | Plain string | **No sanitization** - avoid URLs, file paths, sensitive data |
| `sanitized-string` | String with PII protection | Sanitized in public profiles |
| `url` | URL | Sanitized in public profiles |
| `file-path` | File system path | Sanitized in public profiles |
| `unique-string` | Index into string table | Resolved on display |

### Time Formats

All time values are stored as milliseconds internally:

| Format | Description | Example Display |
|--------|-------------|-----------------|
| `duration` | Time duration | "5s", "123ms", "50μs" |
| `time` | Timestamp relative to profile start | "15.5s", "20.5ms" |
| `seconds` | Duration in seconds only | "5s" |
| `milliseconds` | Duration in milliseconds only | "123ms" |
| `microseconds` | Duration in microseconds only | "50μs" |
| `nanoseconds` | Duration in nanoseconds only | "1000ns" |

### Numeric Formats

| Format | Description | Example Display |
|--------|-------------|-----------------|
| `integer` | Whole numbers | "1,234,567" |
| `decimal` | Floating-point numbers | "123,456.78" |
| `bytes` | Data size | "5.55 MB", "312.5 KB" |
| `percentage` | Percentage (value 0-1) | "50%" |
| `pid` | Process ID | Formatted process ID |
| `tid` | Thread ID | Formatted thread ID |

### Flow Formats

Used to track async operations across threads/processes:

| Format | Description |
|--------|-------------|
| `flow-id` | Flow identifier (hex string) |
| `terminating-flow-id` | Flow ID that ends the flow chain |

### Structured Formats

| Format | Description |
|--------|-------------|
| `list` | Array of values |
| `{ type: 'table', columns: [...] }` | Table with custom columns |

#### Table Format Example

```typescript
{
  key: "phases",
  label: "GC Phases",
  format: {
    type: 'table',
    columns: [
      { label: "Phase", type: "string" },
      { label: "Time", type: "duration" }
    ]
  }
}
```

## Supported Colors

Markers and graphs can use these colors:

- `blue`
- `green`
- `grey`
- `ink`
- `magenta`
- `orange`
- `purple`
- `red`
- `teal`
- `yellow`

### Using Colors

**Static color in graph:**
```typescript
graphs: [
  {
    key: "cpuUsage",
    type: "line",
    color: "blue"
  }
]
```

**Dynamic color per marker:**
```typescript
{
  name: "CustomMarker",
  colorField: "markerColor",  // Field in marker.data containing color
  fields: [
    { key: "markerColor", format: "string", hidden: true }
  ]
}
```

## Labels with Dynamic Content

Labels can include dynamic content using template strings with curly braces:

**Available template variables:**
- `{marker.name}` - The marker's name
- `{marker.data.fieldName}` - Any field from the marker's data payload

**Label purposes:**
- `tooltipLabel` - First line shown in tooltips and the sidebar (defaults to `marker.name`)
- `tableLabel` - Description column in the marker table (marker.name is already shown as a separate column, so use dynamic data here)
- `chartLabel` - Text displayed inside the marker box in the marker chart

```typescript
{
  name: "DOMEvent",
  tableLabel: "{marker.data.eventType}",  // Show the specific event type
  chartLabel: "{marker.data.eventType}",  // Display event type in the marker box
  fields: [
    { key: "eventType", label: "Event Type", format: "string" },
    { key: "latency", label: "Latency", format: "duration" }
  ]
}
```

**More examples:**
```typescript
// Network request - show URL in table and chart
tableLabel: "{marker.data.URI}"
chartLabel: "{marker.data.requestMethod} {marker.data.URI}"

// Database query - combine operation and table
tableLabel: "{marker.data.operation} – {marker.data.table}"
tooltipLabel: "Query: {marker.data.operation}"
```

## Custom Graphs

Create custom local tracks for markers with numeric data:

```typescript
MarkerGraph {
  key: string           // Field name with numeric data
  type: MarkerGraphType // 'bar', 'line', or 'line-filled'
  color?: GraphColor    // Optional color
}
```

**Example:**
```typescript
{
  name: "MemoryAllocation",
  display: [],  // Markers with graphs can have empty display (shown in their own track)
  graphs: [
    {
      key: "bytes",
      type: "bar",
      color: "orange"
    }
  ],
  fields: [
    { key: "bytes", label: "Allocated", format: "bytes" }
  ]
}
```

When markers have custom graphs, they appear in their own dedicated track and don't need to be shown in other display locations.

## Stack-Based Markers

Set `isStackBased: true` for markers that follow call-stack semantics:

```typescript
{
  name: "FunctionCall",
  isStackBased: true,  // Markers are well-nested like function calls
  display: ["marker-chart"],
  fields: [...]
}
```

**Requirements for stack-based markers:**
- Instant markers are always well-nested
- Interval markers must not partially overlap (A fully contains B or B fully contains A)

## Implementing Markers in Gecko

For Firefox/Gecko development, markers are implemented in C++:

### Key Files

- [ProfilerMarker.h] - Marker definitions
- [ProfilerMarkerPayload.h] - Payload types (header)
- [ProfilerMarkerPayload.cpp] - Payload types (implementation)
- [GeckoProfiler.h] - Main profiler API including [profiler_add_marker]

### Adding a Marker

```cpp
PROFILER_ADD_MARKER_WITH_PAYLOAD(
  "MyMarker",                    // Marker name
  OTHER,                         // Category
  MarkerPayload,                 // Payload type
  (arg1, arg2)                   // Payload constructor args
);
```

[ProfilerMarker.h]: https://searchfox.org/mozilla-central/source/tools/profiler/core/ProfilerMarker.h
[ProfilerMarkerPayload.h]: https://searchfox.org/mozilla-central/source/tools/profiler/public/ProfilerMarkerPayload.h
[ProfilerMarkerPayload.cpp]: https://searchfox.org/mozilla-central/source/tools/profiler/core/ProfilerMarkerPayload.cpp
[GeckoProfiler.h]: https://searchfox.org/mozilla-central/source/tools/profiler/public/GeckoProfiler.h
[profiler_add_marker]: https://searchfox.org/mozilla-central/rev/5e1e8d2f244bd8c210a578ff1f65c3b720efe34e/tools/profiler/public/GeckoProfiler.h#368-378

## Best Practices

1. **Use appropriate formats**: Choose formats that match your data type and provide proper PII protection
2. **Provide descriptions**: Help users understand what the marker represents
3. **Use dynamic labels**: Include key information in `tableLabel` and `chartLabel`
4. **Hide internal fields**: Use `hidden: true` for fields used in labels but not needed in tooltips
5. **Choose display locations**: Only show markers in relevant UI areas
6. **Sanitize PII**: Use `url`, `file-path`, or `sanitized-string` for data that might contain sensitive information

## Complete Example: Custom Application Marker Schema

```typescript
{
  name: "DatabaseQuery",
  tooltipLabel: "Database Query",
  tableLabel: "{marker.data.operation} – {marker.data.table}",
  chartLabel: "DB: {marker.data.operation}",
  description: "Database queries executed by the application",
  display: ["marker-chart", "marker-table", "timeline-overview"],
  fields: [
    { key: "operation", label: "Operation", format: "string" },
    { key: "table", label: "Table", format: "string" },
    { key: "rowCount", label: "Rows", format: "integer" },
    { key: "duration", label: "Duration", format: "duration" },
    { key: "query", label: "SQL Query", format: "sanitized-string" },
    { key: "cached", label: "Cached", format: "string" }
  ],
  graphs: [
    {
      key: "rowCount",
      type: "bar",
      color: "purple"
    }
  ]
}
```

---

# Common Marker Types

## Paint markers

| Category | Type                            | Explanation                                                                                                                                                                           |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paint    | RefreshDriverTick               | This is a container marker that wraps all phases of a refresh tick.                                                                                                                   |
| Paint    | FireScrollEvent                 | The time it took call event listeners for “scroll” events after the scroll position in a scrollable frame changed.                                                                    |
| Paint    | requestAnimationFrame callbacks | The time it takes to call JavaScript requestAnimationFrame callbacks during a refresh tick.                                                                                           |
| Paint    | Styles                          | The time it takes to recompute CSS style information on any changed elements in the document.                                                                                         |
| Paint    | Reflow                          | The time it took to recompute layout.                                                                                                                                                 |
| Paint    | DispatchSynthMouseMove          | The time it takes to fire mouseover and mouseout events (and running any JS event handlers) after a layout change or scroll caused the mouse to be over a different element.          |
| Paint    | DisplayList                     | The time it takes to build a DisplayList for the window, which is a list of primives that need to be rendered.                                                                        |
| Paint    | LayerBuilding                   | The time it took to generate a new layer tree based on the new display list.                                                                                                          |
| Paint    | Rasterize                       | The time it takes to turn the display items that were assigned to a PaintedLayer into pixels in that layer’s buffer.                                                                  |
| Paint    | ForwardTransaction              | The time it takes to forward changes to the layer tree to the compositor.                                                                                                             |
| Paint    | NotifyDidPaint                  | The time it takes for a post-refresh garbage collection to run. (The refresh driver notifies the JS engine that it painted, and the JS engine reacts by running GC for a brief time.) |
| Paint    | LayerTransaction                | The time it takes on the compositor thread to process the list of changes that is contained in a layer transaction. This includes texture upload.                                     |
| Paint    | Composite                       | The time it takes to combine layers, on the compositor thread, and display them in the window.                                                                                        |

### Additional context information for paint markers

#### RefreshDriver phases

The RefreshDriver is Gecko’s way of throttling certain work, most importantly painting, to the display’s refresh rate. It’s also the mechanism that’s used to call requestAnimationFrame callbacks.

For foreground tabs, the refresh driver “ticks” in response to vsync events, so usually 60 times per second. A refresh driver “tick” contains multiple phases, one of them being painting.

Painting requires an up-to-date layout object tree (“frame tree”), and computing that requires up-to-date style information. So the basic order of operations within a refresh tick is: Flush styles (“Styles” marker), flush layout (“Reflow” marker), paint. requestAnimationFrame callbacks can touch the DOM or change style information, so in order to avoid unnecessary repeated style flushing, those run first, before the style flush.

The paint phase contains multiple sub-phases: First, Gecko builds a display list for the whole window, then it computes a layer tree for the window based on that display list, and then it rasterizes the content of any PaintedLayers in that layer tree. At the end of painting, any changes to the layer tree and to any rasterized buffers are wrapped up into a layer transaction and forwarded to the compositor (“ForwardTransaction”).

There are a few more things that we do during a refresh tick: We dispatch synthetic mouse move events if a layout change triggered the mouse to be over a different element, we fire “scroll” events, and at the end of a refresh tick, we notify the JS Engine so that it has a chance to do a small chunk of GC (“NotifyDidPaint”).

#### Compositor thread

We have two tracing markers that are compositor-specific: “LayerTransaction” and “Composite”.
The compositor applies any changes that it received in a layers transaction to the layer tree, and on vsync, it recomposites the window with that new layer tree if anything changed.
