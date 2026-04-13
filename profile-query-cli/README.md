# Profile Query CLI (`pq`)

A command-line interface for querying Firefox Profiler profiles with persistent daemon sessions.

## Architecture

**Two-process model:**

- **Daemon process**: Long-running background process that loads a profile via `ProfileQuerier` and keeps it in memory
- **Client process**: Short-lived process that sends commands to the daemon and prints results

**IPC:** Unix domain sockets (named pipes on Windows) with line-delimited JSON messages

**Session storage:** `~/.pq/` (or `$PQ_SESSION_DIR` for development)

`ProfileQuerier` lives in `src/profile-query/` in the main profiler repo and is shared with the web app. The CLI daemon is just an IPC wrapper around it — query logic belongs in `src/profile-query/`, not in `daemon.ts`.

## Commands

**Note:** On machines with `pq` in PATH, you can use `pq` instead of `./dist/pq.js` for shorter commands.

```bash
# Build the CLI
yarn build-profile-query-cli

# Basic usage
pq load <PATH>                   # Start daemon and load profile (PATH can be a file or http/https URL)
pq profile info                  # Print profile summary [--all] [--search <term>]
pq thread info                   # Print detailed thread information
pq thread select <handle>        # Select a thread (e.g., t-0, t-1)
pq thread samples                # Show hot functions list for current thread
pq thread samples-top-down       # Show top-down call tree (where CPU time is spent)
pq thread samples-bottom-up      # Show bottom-up call tree (what calls hot functions)
pq thread markers                # List markers with aggregated statistics
pq thread functions              # List all functions with CPU percentages
pq marker info <handle>          # Show detailed marker information (e.g., m-1234)
pq marker stack <handle>         # Show full stack trace for a marker
pq function expand <handle>      # Show full untruncated function name (e.g., f-123)
pq function info <handle>        # Show detailed function information
pq zoom push <range>             # Push a zoom range (e.g., 2.7,3.1 or ts-g,ts-G or m-158)
pq zoom pop                      # Pop the most recent zoom range
pq zoom clear                    # Clear all zoom ranges (return to full profile)
pq filter push <filter-flag>     # Push a sticky sample filter (see filter flags below)
pq filter pop [N]                # Pop the last N filters (default: 1)
pq filter list                   # List active filters for current thread
pq filter clear                  # Remove all filters for current thread
pq status                        # Show session status (selected thread, zoom ranges, filters)
pq stop                          # Stop current daemon
pq stop <id>                     # Stop a specific session
pq stop --all                    # Stop all sessions
pq session list                  # List all running daemon sessions (* marks current)
pq session use <id>              # Switch the current session

# Multiple sessions
pq load <PATH> --session <id>
pq profile info --session <id>

# Thread selection
pq thread select t-93            # Select thread t-93
pq thread samples                # View samples for selected thread
pq thread info --thread t-0      # View info for specific thread without selecting
```

Run `pq guide` for a detailed usage guide with patterns and tips. Run `pq --help` for the full options reference.

### Common options

| Flag                   | Description                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--thread <handle>`    | Specify thread (e.g., `t-0`)                                                                                                                             |
| `--search <term>`      | Filter results by substring. For samples commands, comma-separates multiple terms that all must match (AND); `\|` is literal, not OR.                    |
| `--include-idle`       | Include idle samples (excluded by default in samples commands)                                                                                           |
| `--json`               | Output as JSON (for use with `jq`, etc.)                                                                                                                 |
| `--limit <N>`          | Limit number of results shown                                                                                                                            |
| `--max-lines <N>`      | Limit call tree nodes for `samples-top-down`/`samples-bottom-up` (default: 100)                                                                          |
| `--scoring <strategy>` | Call tree scoring: `exponential-0.95`, `exponential-0.9` (default), `exponential-0.8`, `harmonic-0.1`, `harmonic-0.5`, `harmonic-1.0`, `percentage-only` |
| `--all`                | Show all threads in `profile info` (overrides default top-5 limit)                                                                                       |
| `--session <id>`       | Use a specific session instead of the current one                                                                                                        |

### Sample filter flags

These work ephemerally on `thread samples` / `thread functions`, and as persistent filters via `filter push`.

| Flag                               | Description                                                        |
| ---------------------------------- | ------------------------------------------------------------------ |
| `--excludes-function <f-N>`        | Drop samples containing this function                              |
| `--merge <f-N,...>`                | Remove functions from stacks (collapse them out)                   |
| `--root-at <f-N>`                  | Re-root stacks at this function                                    |
| `--includes-function <f-N,...>`    | Keep only samples containing any of these functions                |
| `--includes-prefix <f-N,...>`      | Keep only samples whose stack starts with this root-first sequence |
| `--includes-suffix <f-N>`          | Keep only samples whose leaf frame is this function                |
| `--during-marker --search <text>`  | Keep only samples that fall during matching markers                |
| `--outside-marker --search <text>` | Keep only samples that fall outside matching markers               |

For `filter push`, exactly one flag per push. For ephemeral use, multiple flags may be combined and applied left-to-right; the same flag may also be repeated (e.g. `--merge f-1 --merge f-2`).

## Project Structure

```
profile-query-cli/
├── src/
│   ├── index.ts       # CLI entry point, argument parsing, command routing
│   ├── client.ts      # Client logic: spawn daemon, send commands via socket
│   ├── daemon.ts      # Daemon logic: load profile, listen on socket, handle commands
│   ├── session.ts     # Session file management, socket paths, validation
│   ├── protocol.ts    # TypeScript types for IPC messages
│   ├── formatters.ts  # Plain-text formatters for structured command results
│   ├── constants.ts   # Build-time constants (BUILD_HASH, etc.)
│   └── test/
│       ├── unit/          # CLI unit tests
│       └── integration/   # CLI integration tests
├── package.json       # npm distribution metadata (dependencies defined in root)
└── dist/              # Bundled executable output
```

## Build & Distribution

This package uses a **bundled distribution approach**:

- **Source code**: Lives in `profile-query-cli/src/` within the firefox-devtools/profiler monorepo
- **Dependencies**: Defined in the root `package.json` (react, redux, protobufjs, etc.)
- **Build process**: The CLI build writes a single ~640KB executable to `profile-query-cli/dist/pq.js` (~187KB gzipped) with zero runtime dependencies
- **Published artifact**: `profile-query-cli/dist/pq.js` is published to npm as `@firefox-profiler/pq`
- **Package.json**: Contains only npm metadata - it does NOT list dependencies since they're pre-bundled

This means:

- Users who install via npm get a self-contained binary that just works
- Developers working on the CLI use the root package.json dependencies
- The `package.json` in this directory is for npm publishing only, not for development

To publish:

```bash
# From repository root
yarn build-profile-query-cli
cd profile-query-cli
npm publish
```

## Session Management

**Session directory:** `~/.pq/` or `$PQ_SESSION_DIR`

**Files per session:**

```
~/.pq/
├── current                    # Symlink to current session socket
├── <session-id>.sock          # Unix domain socket for IPC (Unix only)
├── <session-id>.json          # Session metadata (PID, profile path, timestamps)
└── <session-id>.log           # Daemon logs (kept for debugging)
```

On Windows, IPC uses a named pipe (`\\.\pipe\pq-<session-id>`) instead of a `.sock` file.

**Session metadata example:**

```json
{
  "id": "abc123xyz",
  "socketPath": "/Users/user/.pq/abc123xyz.sock", // or \\.\pipe\pq-abc123xyz on Windows
  "logPath": "/Users/user/.pq/abc123xyz.log",
  "pid": 12345,
  "profilePath": "/path/to/profile.json",
  "createdAt": "2025-10-31T10:00:00.000Z",
  "buildHash": "abc123"
}
```

## Development Workflow

**Environment variable isolation:**

```bash
export PQ_SESSION_DIR="./.pq-dev"  # Use local directory instead of ~/.pq
pq load profile.json               # or: ./dist/pq.js load profile.json
```

All test scripts automatically set `PQ_SESSION_DIR="./.pq-dev"` to avoid polluting global state.

**Build:**

```bash
yarn build-profile-query-cli # Creates ./dist/pq.js
```

**Unit tests:**

```bash
yarn test profile-query
```

**CLI integration tests:**

```bash
yarn test-cli
```

## Implementation Details

**Daemon startup (client.ts):**

Two-phase startup:

1. Spawn detached Node.js process with `--daemon` flag
2. **Phase 1** — Poll every 50ms (max 500ms) until the session validates (metadata written, process running, socket exists)
3. **Phase 2** — Poll every 100ms (max 60s) via status messages until the profile finishes loading; fail immediately if a load error is returned
4. Return session ID when profile is ready

**IPC protocol (protocol.ts):**

```typescript
// Client → Daemon
type ClientMessage =
  | { type: 'command'; command: ClientCommand }
  | { type: 'shutdown' }
  | { type: 'status' };

type ClientCommand =
  | { command: 'profile'; subcommand: 'info' | 'threads'; all?: boolean; search?: string }
  | { command: 'thread'; subcommand: 'info' | 'select' | 'samples' | 'samples-top-down' | 'samples-bottom-up' | 'markers' | 'functions'; thread?: string; ... }
  | { command: 'marker'; subcommand: 'info' | 'select' | 'stack'; marker?: string }
  | { command: 'sample'; subcommand: 'info' | 'select'; sample?: string }
  | { command: 'function'; subcommand: 'info' | 'select' | 'expand'; function?: string }
  | { command: 'zoom'; subcommand: 'push' | 'pop' | 'clear'; range?: string }
  | { command: 'filter'; subcommand: 'push' | 'pop' | 'list' | 'clear'; thread?: string; spec?: SampleFilterSpec; count?: number }
  | { command: 'status' };

// Daemon → Client
type ServerResponse =
  | { type: 'success'; result: string | CommandResult }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'ready' };
```

**Session validation (session.ts):**

- Check PID is running (`process.kill(pid, 0)`)
- Check socket file exists (Unix only — named pipes on Windows are not filesystem files)
- Auto-cleanup stale sessions

**Symlinks:**

- `current` symlink uses relative path (`sessionId.sock`)
- Resolved to absolute in `getCurrentSocketPath()` when needed

## Known Gaps

These commands are parsed and routed but throw "unimplemented" in the daemon:

- `profile threads`
- `marker select`
- `sample info`, `sample select`
- `function select`

## Build Configuration

**Current build behavior:**

- esbuild bundles the CLI for Node.js
- A build banner adds the `#!/usr/bin/env node` shebang
- The banner also sets `globalThis.self = globalThis` for browser-oriented shared code
- `__BUILD_HASH__` is injected at build time
- `gecko-profiler-demangle` is left external to keep the CLI lean
- Postbuild: `chmod +x dist/pq.js`

## Adding New Commands

To add a new command, you need to modify **5 files** (client.ts doesn't need changes as it generically forwards commands). The example below adds a hypothetical `pq allocation info` command.

### Step 1: Define types in `protocol.ts`

Add to the `ClientCommand` union, define a result type, and add it to `CommandResult`:

```typescript
// In ClientCommand:
| { command: 'allocation'; subcommand: 'info'; thread?: string }

// New result type:
export type AllocationInfoResult = {
  type: 'allocation-info';
  totalBytes: number;
  // ... other fields
};

// In CommandResult:
| WithContext<AllocationInfoResult>
```

### Step 2: Parse CLI arguments in `index.ts`

Add a case to the command switch, and add a corresponding case to the `formatOutput` switch:

```typescript
// In the main command switch:
case 'allocation': {
  const subcommand = argv._[1] ?? 'info';
  if (subcommand === 'info') {
    const result = await sendCommand(
      SESSION_DIR,
      { command: 'allocation', subcommand, thread: argv.thread },
      argv.session
    );
    console.log(formatOutput(result, argv.json || false));
  } else {
    console.error(`Error: Unknown command ${command} ${subcommand}`);
    process.exit(1);
  }
  break;
}

// In the formatOutput switch:
case 'allocation-info':
  return formatAllocationInfoResult(result);
```

**Note:** client.ts doesn't need changes — it generically forwards all commands via `sendCommand()`.

### Step 3: Handle the command in `daemon.ts`

Add a case to `processCommand()`:

```typescript
case 'allocation':
  switch (command.subcommand) {
    case 'info':
      return this.querier!.allocationInfo(command.thread);
    default:
      throw assertExhaustiveCheck(command);
  }
```

### Step 4: Implement the ProfileQuerier method in `src/profile-query/index.ts`

Return a structured result type wrapped in `WithContext`, not a plain string:

```typescript
async allocationInfo(threadHandle?: string): Promise<WithContext<AllocationInfoResult>> {
  // ...
  return { type: 'allocation-info', context: this._getContext(), totalBytes: ... };
}
```

### Step 5: Add a formatter in `formatters.ts`

```typescript
export function formatAllocationInfoResult(
  result: WithContext<AllocationInfoResult>
): string {
  const lines: string[] = [formatContextHeader(result.context)];
  lines.push(`Total allocated: ${result.totalBytes} bytes`);
  return lines.join('\n');
}
```

Then import it at the top of `index.ts`.

### Step 6: Update documentation

- Add the command to the help text in `index.ts` (the `printUsage()` function)
- Add the command to the "Commands" section of this README
- Remove it from the "Known Gaps" section if it was previously stubbed out
