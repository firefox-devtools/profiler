# Contributing to Profiler CLI

## Architecture

**Two-process model:**

- **Daemon process**: Long-running background process that loads a profile via `ProfileQuerier` and keeps it in memory
- **Client process**: Short-lived process that sends commands to the daemon and prints results

**IPC:** Unix domain sockets (named pipes on Windows) with line-delimited JSON messages

**Session storage:** `~/.profiler-cli/` (or `$PROFILER_CLI_SESSION_DIR` for development)

`ProfileQuerier` lives in `src/profile-query/` in the main profiler repo and is shared with the web app. The CLI daemon is just an IPC wrapper around it — query logic belongs in `src/profile-query/`, not in `daemon.ts`.

## Project Structure

```
profiler-cli/
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

- **Source code**: Lives in `profiler-cli/src/` within the firefox-devtools/profiler monorepo
- **Dependencies**: Defined in the root `package.json` (react, redux, protobufjs, etc.)
- **Build process**: The CLI build writes a single ~640KB executable to `profiler-cli/dist/profiler-cli.js` (~187KB gzipped) with zero runtime dependencies
- **Published artifact**: `profiler-cli/dist/profiler-cli.js` is published to npm as `@firefox-profiler/profiler-cli`
- **Package.json**: Contains only npm metadata — it does NOT list dependencies since they're pre-bundled

This means:

- Users who install via npm get a self-contained binary that just works
- Developers working on the CLI use the root package.json dependencies
- The `package.json` in this directory is for npm publishing only, not for development

To publish:

```bash
# From repository root
yarn build-profiler-cli
cd profiler-cli
npm publish
```

## Development Workflow

**Environment variable isolation:**

```bash
export PROFILER_CLI_SESSION_DIR="./.profiler-cli-dev"  # Use local directory instead of ~/.profiler-cli
profiler-cli load profile.json               # or: ./dist/profiler-cli.js load profile.json
```

All test scripts automatically set `PROFILER_CLI_SESSION_DIR="./.profiler-cli-dev"` to avoid polluting global state.

**Build:**

```bash
yarn build-profiler-cli # Creates ./dist/profiler-cli.js
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

**Session metadata example:**

```json
{
  "id": "abc123xyz",
  "socketPath": "/Users/user/.profiler-cli/abc123xyz.sock",
  "logPath": "/Users/user/.profiler-cli/abc123xyz.log",
  "pid": 12345,
  "profilePath": "/path/to/profile.json",
  "createdAt": "2025-10-31T10:00:00.000Z",
  "buildHash": "abc123"
}
```

On Windows, `socketPath` is a named pipe: `\\.\pipe\profiler-cli-<session-id>`.

## Build Configuration

- esbuild bundles the CLI for Node.js
- A build banner adds the `#!/usr/bin/env node` shebang
- The banner also sets `globalThis.self = globalThis` for browser-oriented shared code
- `__BUILD_HASH__` is injected at build time
- `gecko-profiler-demangle` is left external to keep the CLI lean
- Postbuild: `chmod +x dist/profiler-cli.js`

## Adding New Commands

To add a new command, modify **5 files** (client.ts doesn't need changes as it generically forwards commands). The example below adds a hypothetical `profiler-cli allocation info` command.

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

client.ts doesn't need changes — it generically forwards all commands via `sendCommand()`.

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
- Add the command to the "Commands" section of `README.md`
- Remove it from the "Known Gaps" section below if it was previously stubbed out

## Known Gaps

These commands are parsed and routed but throw "unimplemented" in the daemon:

- `profile threads`
- `marker select`
- `sample info`, `sample select`
- `function select`
