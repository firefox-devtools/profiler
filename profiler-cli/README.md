# Firefox Profiler CLI

A command-line interface for querying Firefox Profiler profiles with persistent daemon sessions.

## Installation

```bash
npm install -g @firefox-devtools/profiler-cli@latest
```

Requires Node.js >= 24.

## Quick Start

```bash
profiler-cli load profile.json            # Load a profile (file or https:// URL)
profiler-cli profile info                 # Show profile summary
profiler-cli thread info                  # List threads
profiler-cli thread select t-0            # Select a thread
profiler-cli thread samples               # Show hot functions
profiler-cli stop                         # Stop the daemon
```

`profiler-cli` is also available as `pq` for shorter invocations (e.g. `pq thread samples`).

Run `profiler-cli guide` for a detailed usage guide with patterns and tips.
Run `profiler-cli --help` for the full options reference.

## Commands

```bash
profiler-cli load <PATH>                   # Start daemon and load profile (file or http/https URL)
profiler-cli profile info                  # Print profile summary [--all] [--search <term>]
profiler-cli profile logs                  # Print Log markers in MOZ_LOG format [--thread] [--module] [--level] [--search] [--limit]
profiler-cli thread info                   # Print detailed thread information
profiler-cli thread select <handle>        # Select a thread (e.g., t-0, t-1)
profiler-cli thread samples                # Show hot functions list for current thread
profiler-cli thread samples-top-down       # Show top-down call tree (where CPU time is spent)
profiler-cli thread samples-bottom-up      # Show bottom-up call tree (what calls hot functions)
profiler-cli thread markers                # List markers with aggregated statistics [--list for flat per-marker view]
profiler-cli thread functions              # List all functions with CPU percentages
profiler-cli thread network                # Show network requests with timing phases [--search] [--min-duration] [--max-duration] [--limit]
profiler-cli thread page-load              # Show page load summary (navigation timing, resources, CPU, jank)
profiler-cli marker info <handle>          # Show detailed marker information (e.g., m-1234)
profiler-cli marker stack <handle>         # Show full stack trace for a marker
profiler-cli function expand <handle>      # Show full untruncated function name (e.g., f-123)
profiler-cli function info <handle>        # Show detailed function information
profiler-cli function annotate <handle>    # Show annotated source/assembly with timing data [--mode src|asm|all] [--context 2|file|N] [--symbol-server <url>]
profiler-cli zoom push <range>             # Push a zoom range (e.g., 2.7,3.1 or ts-g,ts-G or m-158)
profiler-cli zoom pop                      # Pop the most recent zoom range
profiler-cli zoom clear                    # Clear all zoom ranges (return to full profile)
profiler-cli filter push <filter-flag>     # Push a sticky sample filter (see filter flags below)
profiler-cli filter pop [N]                # Pop the last N filters (default: 1)
profiler-cli filter list                   # List active filters for current thread
profiler-cli filter clear                  # Remove all filters for current thread
profiler-cli status                        # Show session status (selected thread, zoom ranges, filters)
profiler-cli stop                          # Stop current daemon
profiler-cli stop <id>                     # Stop a specific session
profiler-cli stop --all                    # Stop all sessions
profiler-cli session list                  # List all running daemon sessions (* marks current)
profiler-cli session use <id>              # Switch the current session
```

### Multiple sessions

```bash
profiler-cli load <PATH> --session <id>
profiler-cli profile info --session <id>
```

### Thread selection

```bash
profiler-cli thread select t-93            # Select thread t-93
profiler-cli thread samples                # View samples for selected thread
profiler-cli thread info --thread t-0      # View info for specific thread without selecting
```

## Options

| Flag                   | Description                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--thread <handle>`    | Specify thread (e.g., `t-0`)                                                                                                                             |
| `--search <term>`      | Filter results by substring. For samples commands, comma-separates multiple terms that all must match (AND); `\|` is literal, not OR.                    |
| `--include-idle`       | Include idle samples (excluded by default in samples commands)                                                                                           |
| `--json`               | Output as JSON (for use with `jq`, etc.)                                                                                                                 |
| `--limit <N>`          | Limit number of results shown                                                                                                                            |
| `--max-lines <N>`      | Limit call tree nodes for `samples-top-down`/`samples-bottom-up` (default: 100)                                                                          |
| `--scoring <strategy>` | Call tree scoring: `exponential-0.95`, `exponential-0.9` (default), `exponential-0.8`, `harmonic-0.1`, `harmonic-0.5`, `harmonic-1.0`, `percentage-only` |
| `--navigation <N>`     | Select which navigation to show in `thread page-load` (1-based, default: last completed)                                                                 |
| `--jank-limit <N>`     | Max jank periods to show in `thread page-load` (default: 10, 0 = show all)                                                                               |
| `--list`               | Show a flat chronological list of individual markers (for `thread markers`)                                                                              |
| `--all`                | Show all threads in `profile info` (overrides default top-5 limit)                                                                                       |
| `--session <id>`       | Use a specific session instead of the current one                                                                                                        |

## Sample Filter Flags

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

## Session Storage

Sessions are stored in `~/.profiler-cli/` (or `$PROFILER_CLI_SESSION_DIR` to override).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for architecture, build instructions, and how to add new commands.

## License

[MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/)
