# Profile Query Library

A library for programmatically querying the contents of a Firefox Profiler profile.

## Usage

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
