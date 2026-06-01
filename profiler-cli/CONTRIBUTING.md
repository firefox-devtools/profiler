# Contributing to Profiler CLI

## Architecture

**Two-process model:**

- **Daemon process**: Long-running background process that loads a profile via `ProfileQuerier` and keeps it in memory
- **Client process**: Short-lived process that sends commands to the daemon and prints results

**IPC:** Unix domain sockets (named pipes on Windows) with line-delimited JSON messages

**Session storage:** `~/.profiler-cli/` (or `$PROFILER_CLI_SESSION_DIR` for development)

`ProfileQuerier` lives in `src/profile-query/` in the main profiler repo. The CLI daemon is just an IPC wrapper around it — query logic belongs in `src/profile-query/`, not in `daemon.ts`.

## Build & Distribution

This package uses a **bundled distribution approach**:

- **Source code**: Lives in `profiler-cli/src/` within the firefox-devtools/profiler monorepo
- **Dependencies**: Defined in the root `package.json` (react, redux, protobufjs, etc.)
- **Build process**: The CLI build writes a single self-contained executable to `profiler-cli/dist/profiler-cli.js` with zero runtime dependencies
- **Published artifact**: `profiler-cli/dist/profiler-cli.js` is published to npm as `@firefox-devtools/profiler-cli`
- **Package.json**: Contains only npm metadata — it does NOT list dependencies since they're pre-bundled

This means:

- Users who install via npm get a self-contained binary that just works
- Developers working on the CLI use the root package.json dependencies
- The `package.json` in this directory is for npm publishing only, not for development

To publish, see [`docs-developer/deploying.md`](../docs-developer/deploying.md#publishing-profiler-cli-to-npm).

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
3. **Phase 2** — Poll every 100ms (max 60s, or `$PROFILER_CLI_LOAD_TIMEOUT_MS`) via status messages until the profile finishes loading; fail immediately if a load error is returned
4. Return session ID when profile is ready

**IPC protocol (protocol.ts):**

See `src/protocol.ts` for the authoritative `ClientMessage`, `ClientCommand`, and `ServerResponse` type definitions.

**Session validation (session.ts):**

- Check PID is running (`process.kill(pid, 0)`)
- Check socket file exists (Unix only — named pipes on Windows are not filesystem files)
- Auto-cleanup stale sessions

**Current session pointer:**

- `current.txt` is a plain-text file containing the active session ID
- Resolved to the full socket path in `getCurrentSocketPath()` when needed

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

On Windows, `socketPath` is a named pipe: `\\.\pipe\profiler-cli-<namespace-hash>-<session-id>`,
where `<namespace-hash>` is derived from the session directory path to avoid cross-directory collisions.

## Build Configuration

- esbuild bundles the CLI for Node.js
- A build banner adds the `#!/usr/bin/env node` shebang
- The banner also sets `globalThis.self = globalThis` for browser-oriented shared code
- `__BUILD_HASH__` is injected at build time
- `gecko-profiler-demangle` is left external to keep the CLI lean
- Postbuild: `chmod +x dist/profiler-cli.js`

## Adding New Commands

Each command group lives in its own file under `commands/`. To add a new command, modify the following files. The example below adds a hypothetical `profiler-cli allocation info` command.

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

### Step 2: Create `commands/allocation.ts`

```typescript
import { Command } from 'commander';
import { sendCommand } from '../client';
import { addGlobalOptions } from './shared';
import { formatOutput } from '../output';

export function registerAllocationCommand(
  program: Command,
  sessionDir: string
): void {
  const allocation = program
    .command('allocation')
    .description('Allocation commands');

  addGlobalOptions(
    allocation
      .command('info')
      .description('Show allocation summary')
      .option('--thread <handle>', 'Thread to query')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'allocation', subcommand: 'info', thread: opts.thread },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
```

### Step 3: Handle the command in `daemon.ts`

Add a case to `processMessage()`:

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

### Step 5: Add a formatter in `formatters.ts` and wire it into `output.ts`

```typescript
// formatters.ts
export function formatAllocationInfoResult(
  result: WithContext<AllocationInfoResult>
): string {
  const lines: string[] = [formatContextHeader(result.context)];
  lines.push(`Total allocated: ${result.totalBytes} bytes`);
  return lines.join('\n');
}

// output.ts — add a case to the formatOutput switch
case 'allocation-info':
  return formatAllocationInfoResult(result);
```

### Step 6: Register the command and update docs

```typescript
// index.ts — add alongside the other register* calls
registerAllocationCommand(program, SESSION_DIR);
```

Then:

- Add the command to `README.md`
- Remove it from "Known Gaps" below if it was previously stubbed out

## Known Gaps

These commands are parsed and routed but throw "unimplemented" in the daemon:

- `profile threads`
- `marker select`
- `sample info`, `sample select`
- `function select`
