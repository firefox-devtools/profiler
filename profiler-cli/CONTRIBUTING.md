# Contributing to Profiler CLI

## Architecture

**Two-process model:**

- **Daemon process**: Long-running background process that loads a profile via `ProfileQuerier` and keeps it in memory
- **Client process**: Short-lived process that sends commands to the daemon and prints results

**IPC:** Unix domain sockets (named pipes on Windows) with line-delimited JSON messages

**Session storage:** `~/.profiler-cli/` (or `$PROFILER_CLI_SESSION_DIR` for development)

`ProfileQuerier` lives in `src/profile-query/` in the main profiler repo. The CLI daemon is just an IPC wrapper around it — query logic belongs in `src/profile-query/`, not in `daemon.ts`.

**Shared command layer:** The command definitions are shared with the web app's profile chat (see `docs-developer/profile-chat.md`), which runs pq commands in the page. They live in `src/profile-query/cli/`:

- `protocol.ts`: `ClientCommand` and `CommandResult`
- `commands/`: the commander definitions. Actions call `ctx.run(command, opts)` on a `CommandContext` that the entry point injects. Here it sends the command to the daemon and prints the result. In the web app it runs the command on the page's own store.
- `parse.ts`: argument parsers. They throw a `CliUsageError` instead of exiting.
- `execute.ts`: `executeClientCommand`, the dispatch from a `ClientCommand` to `ProfileQuerier`
- `formatters.ts`, `output.ts`, `permalink-view.ts`

These files must not use Node APIs. Anything that touches the file system goes through `CommandContext.fileSystem` and the `FileSystemCommands` that `ProfileQuerierNode` (`src/profile-query/node.ts`) implements. What stays in `profiler-cli/src/` is the daemon, the client, sessions and the session-level commands (`load`, `stop`, `session`, `guide`, `schemas`).

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

To publish, see [`docs-developer/deploying.md`](../docs-developer/deploying.md#4-publish-profiler-cli-to-npm).
The CLI release is part of the regular profiler deploy: the version bump lands on
`main` before the deploy, and the npm publish plus the GitHub release happen right
after it.

## Development Workflow

**Environment variable isolation:**

```bash
export PROFILER_CLI_SESSION_DIR="./.profiler-cli-dev"  # Use local directory instead of ~/.profiler-cli
profiler-cli load profile.json               # or: ./dist/profiler-cli.js load profile.json
```

All test scripts automatically set `PROFILER_CLI_SESSION_DIR="./.profiler-cli-dev"` to avoid polluting global state.

**Build:**

```bash
yarn build-cli # Creates ./dist/profiler-cli.js
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

See `src/protocol.ts` for the authoritative `ClientMessage` and `ServerResponse` type definitions, and `src/profile-query/cli/protocol.ts` in the main repo for `ClientCommand`.

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

Each command group lives in its own file under `src/profile-query/cli/commands/` in the main repo. To add a new command, modify the following files. The example below adds a hypothetical `profiler-cli allocation info` command.

### Step 1: Define types in `src/profile-query/cli/protocol.ts`

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

### Step 2: Create `src/profile-query/cli/commands/allocation.ts`

Report invalid arguments by throwing a `CliUsageError` from `src/profile-query/cli/parse.ts`, never with `process.exit`, because the same code runs in the browser.

```typescript
import type { Command } from 'commander';
import { addGlobalOptions, type CommandContext } from './shared';

export function registerAllocationCommand(
  program: Command,
  ctx: CommandContext
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
    await ctx.run(
      { command: 'allocation', subcommand: 'info', thread: opts.thread },
      opts
    );
  });
}
```

### Step 3: Handle the command in `src/profile-query/cli/execute.ts`

Add a case to `executeClientCommand()`:

```typescript
case 'allocation':
  switch (command.subcommand) {
    case 'info':
      return querier.allocationInfo(command.thread);
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

### Step 5: Add a formatter in `src/profile-query/cli/formatters.ts` and wire it into `output.ts`

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
// src/profile-query/cli/commands/index.ts — add to registerQueryCommands
registerAllocationCommand(program, ctx);
```

Then:

- Add the command to `README.md`
- Remove it from "Known Gaps" below if it was previously stubbed out

## Known Gaps

These commands are parsed and routed but throw "unimplemented" in `executeClientCommand`:

- `profile threads`
- `marker select`
- `sample info`, `sample select`
- `function select`
