# Profile Query Library

A library for programmatically querying the contents of a Firefox Profiler profile.

## Usage

**Note:** Most users should use the [profile-query-cli](../profile-query-cli/README.md) (`pq` command) instead of using this library directly.

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

## Available Methods

- `static async load(filePathOrUrl: string): Promise<ProfileQuerier>` - Load a profile from file or URL
- `async profileInfo(): Promise<string>` - Get profile summary (processes, threads, CPU activity)
- `async threadInfo(threadHandle?: string): Promise<string>` - Get detailed thread information
- `async threadSelect(threadHandle: string): Promise<string>` - Select a thread for subsequent queries
- `async threadSamples(threadHandle?: string): Promise<string>` - Get call tree and top functions for a thread
- `async pushViewRange(rangeName: string): Promise<string>` - Push a zoom range (supports timestamps, marker handles, or time values)
- `async popViewRange(): Promise<string>` - Pop the most recent zoom range
- `async getStatus(): Promise<string>` - Get current session status (selected thread, zoom ranges)

## Architecture

The library is built on top of the Firefox Profiler's Redux store and selectors:

- **ProfileQuerier**: Main class that wraps a Redux store and provides query methods
- **TimestampManager**: Manages timestamp naming for time range queries
- **ThreadMap**: Maps thread handles (e.g., "t-0", "t-1") to thread indices
- **Formatters**: Format query results as human-readable text

All query results are returned as formatted strings, suitable for display in a terminal or log file.
