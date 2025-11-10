# Profile Query CLI (`pq`)

A command-line interface for querying Firefox Profiler profiles with persistent daemon sessions.

## Architecture

**Two-process model:**

- **Daemon process**: Long-running background process that loads a profile via `ProfileQuerier` and keeps it in memory
- **Client process**: Short-lived process that sends commands to the daemon and prints results

**IPC:** Unix domain sockets with line-delimited JSON messages

**Session storage:** `~/.pq/` (or `$PQ_SESSION_DIR` for development)

## Commands

**Note:** On machines with `pq` in PATH, you can use `pq` instead of `./dist/pq.js` for shorter commands.

```bash
# Build the CLI
yarn build-profile-query-cli

# Basic usage
pq load <PATH>              # Start daemon and load profile
pq profile info             # Print profile summary
pq thread info              # Print detailed thread information
pq thread select <handle>   # Select a thread (e.g., t-0, t-1)
pq thread samples           # Show call tree and top functions
pq function expand <handle> # Show full untruncated function name (e.g., f-1)
pq function info <handle>   # Show detailed function information
pq zoom push <range>        # Push a zoom range (e.g., 2.7,3.1 or ts-g,ts-G or m-158)
pq zoom pop                 # Pop the most recent zoom range
pq status                   # Show session status (selected thread, zoom ranges)
pq stop                     # Stop daemon
pq list-sessions            # List all running daemon sessions

# Multiple sessions
pq load <PATH> --session <id>
pq profile info --session <id>
pq stop --session <id>

# Thread selection
pq thread select t-93       # Select thread t-93
pq thread samples           # View samples for selected thread
pq thread info --thread t-0 # View info for specific thread without selecting
```

## Project Structure

```
src/profile-query-cli/
├── index.ts       # CLI entry point, argument parsing, command routing
├── client.ts      # Client logic: spawn daemon, send commands via socket
├── daemon.ts      # Daemon logic: load profile, listen on socket, handle commands
├── session.ts     # Session file management, socket paths, validation
├── protocol.ts    # TypeScript types for IPC messages
├── webpack.config.js  # Build config with shebang and Node.js polyfills
├── package.json   # npm distribution metadata (dependencies defined in root)
└── tests/         # CLI integration tests
```

## Build & Distribution

This package uses a **bundled distribution approach**:

- **Source code**: Lives in `src/profile-query-cli/` within the firefox-devtools/profiler monorepo
- **Dependencies**: Defined in the root `package.json` (react, redux, protobufjs, etc.)
- **Build process**: Webpack bundles and minifies everything into a single ~640KB `dist/pq.js` file (~187KB gzipped) with zero runtime dependencies
- **Published artifact**: Just the `dist/pq.js` executable is published to npm as `@firefox-profiler/pq`
- **Package.json**: Contains only npm metadata - it does NOT list dependencies since they're pre-bundled

This means:
- Users who install via npm get a self-contained binary that just works
- Developers working on the CLI use the root package.json dependencies
- The `package.json` in this directory is for npm publishing only, not for development

To publish:
```bash
# From repository root
yarn build-profile-query-cli
cd src/profile-query-cli
npm publish
```

## Session Management

**Session directory:** `~/.pq/` or `$PQ_SESSION_DIR`

**Files per session:**

```
~/.pq/
├── current                    # Symlink to current session socket
├── <session-id>.sock          # Unix domain socket for IPC
├── <session-id>.json          # Session metadata (PID, profile path, timestamps)
└── <session-id>.log           # Daemon logs (kept for debugging)
```

**Session metadata example:**

```json
{
  "id": "abc123xyz",
  "socketPath": "/Users/user/.pq/abc123xyz.sock",
  "logPath": "/Users/user/.pq/abc123xyz.log",
  "pid": 12345,
  "profilePath": "/path/to/profile.json",
  "createdAt": "2025-10-31T10:00:00.000Z"
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
yarn build-profile-query-cli # Creates ./dist/pq.js, global `pq` forwards to this
```

**Unit tests:**

```bash
yarn test profile-query
```

**CLI integration tests:**

```bash
yarn test:cli
```

## Implementation Details

**Daemon startup (client.ts):**

1. Spawn detached Node.js process with `--daemon` flag
2. Poll every 50ms for session readiness (max 10 seconds)
3. Check: session ID exists → metadata exists → session validates
4. Return immediately when ready

**IPC protocol (protocol.ts):**

```typescript
// Client → Daemon
type ClientMessage =
  | { type: 'command'; command: ClientCommand }
  | { type: 'shutdown' }
  | { type: 'status' };

type ClientCommand =
  | { command: 'profile'; subcommand: 'info' | 'threads' }
  | {
      command: 'thread';
      subcommand: 'info' | 'select' | 'samples';
      thread?: string;
    }
  | { command: 'zoom'; subcommand: 'push' | 'pop'; range?: string }
  | { command: 'status' };
// ... and more

// Daemon → Client
type ServerResponse =
  | { type: 'success'; result: string }
  | { type: 'error'; error: string }
  | { type: 'loading' }
  | { type: 'ready' };
```

**Session validation (session.ts):**

- Check PID is running (`process.kill(pid, 0)`)
- Check socket file exists
- Auto-cleanup stale sessions

**Symlinks:**

- `current` symlink uses relative path (`sessionId.sock`)
- Resolved to absolute in `getCurrentSocketPath()` when needed

## Current State

**Implemented:**

- ✅ Persistent daemon with profile loading
- ✅ Unix socket IPC
- ✅ Multiple concurrent sessions
- ✅ Session management (current session, explicit session IDs)
- ✅ Environment variable isolation (`PQ_SESSION_DIR`)
- ✅ Manual test scripts
- ✅ `profile info` command (shows profile name, platform, threads, CPU activity)
- ✅ `thread info` command (shows thread details, CPU activity over time)
- ✅ `thread select` command (selects a thread for subsequent queries)
- ✅ `thread samples` command (call tree, top functions, inverted tree, heaviest stack)
- ✅ `zoom push` and `zoom pop` commands (time range filtering with multiple format support, including marker handles)
- ✅ `status` command (shows selected thread and zoom range stack)
- ✅ `list-sessions` command (shows all running sessions)

- ✅ `function expand` command (shows full untruncated function name)
- ✅ `function info` command (shows detailed function metadata)

**Partially implemented (parsed and wired up but not functional):**

- ⚠️ `profile threads` - throws "unimplemented" in daemon
- ⚠️ `thread markers` - throws "unimplemented" in daemon
- ⚠️ `thread functions` - throws "unimplemented" in daemon
- ⚠️ `marker info` and `marker select` - throws "unimplemented" in daemon
- ⚠️ `sample info` and `sample select` - throws "unimplemented" in daemon
- ⚠️ `function select` - throws "unimplemented" in daemon

## Build Configuration

**Key webpack settings:**

- `target: 'node'` - Node.js output
- `stats: 'errors-warnings'` - Quiet builds
- `BannerPlugin` - Adds `#!/usr/bin/env node` shebang
- `BannerPlugin` - Adds `globalThis.self = globalThis` polyfill for browser globals
- `optimization.minimize: false` - Keep readable stack traces
- Postbuild: `chmod +x dist/pq.js`

## Adding New Commands

To add a new command, you need to modify **4 files** (client.ts doesn't need changes as it generically forwards commands):

### Step 1: Define the command type in `protocol.ts`

Add your command to the `ClientCommand` type union:

```typescript
export type ClientCommand =
  | { command: 'profile'; subcommand: 'info' | 'threads' }
  | { command: 'marker'; subcommand: 'info'; marker?: string }  // Add new command
  | ...
```

### Step 2: Parse CLI arguments in `index.ts`

Add a case to the command switch statement:

```typescript
case 'marker': {
  const subcommand = argv._[1] ?? 'info';
  const marker = argv.marker;  // Read from --marker flag
  if (subcommand === 'info' || subcommand === 'select') {
    const result = await sendCommand(
      SESSION_DIR,
      { command: 'marker', subcommand, marker },
      argv.session
    );
    console.log(result);
  } else {
    console.error(`Error: Unknown command ${command} ${subcommand}`);
    process.exit(1);
  }
  break;
}
```

**Note:** client.ts doesn't need changes - it generically forwards all commands via `sendCommand()`.

### Step 3: Handle the command in `daemon.ts`

Add a case to `processCommand()`:

```typescript
case 'marker':
  switch (command.subcommand) {
    case 'info':
      return this.querier!.markerInfo(command.marker);
    case 'select':
      return this.querier!.markerSelect(command.marker);
    default:
      throw assertExhaustiveCheck(command);
  }
```

### Step 4: Implement ProfileQuerier methods in `src/profile-query/index.ts`

```typescript
async markerInfo(markerHandle?: string): Promise<string> {
  // Implementation
  return formatMarkerInfo(this._store, this._threadMap, markerHandle);
}
```

### Step 5: Update documentation

- Add the command to the help text in `index.ts` (the `printUsage()` function)
- Add the command to the "Commands" section of this README
- Add the command to the "Current State" section as implemented
