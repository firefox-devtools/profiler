/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * CLI entry point for pq (Profile Querier).
 *
 * Usage:
 *   pq load <PATH> [--session <id>]          Start a new daemon and load a profile
 *   pq profile info [--session <id>]         Print profile summary
 *   pq thread info [--thread <handle>]       Print thread information
 *   pq thread samples [--thread <handle>]    Show thread call tree and top functions
 *   pq stop [<id>] [--all]                   Stop the daemon
 *   pq session list                          List all running sessions
 *   pq session use <id>                      Switch the current session
 *
 * Build:
 *   yarn build-profile-query-cli
 *
 * Run:
 *   pq <command>                    (if pq is in PATH)
 *   ./profile-query-cli/dist/pq.js <command>  (direct invocation)
 *
 * Helper scripts:
 *   ./bin/pq-test          Quick smoke test
 *   ./bin/pq-test-multi    Test multiple concurrent sessions
 *   ./bin/pq-status        Show session status
 *   ./bin/pq-clean         Clean up sessions (--logs to also remove logs)
 */

import * as path from 'path';
import * as os from 'os';
import guideText from '../guide.txt';
import minimist from 'minimist';
import { startDaemon } from './daemon';
import { sendCommand, startNewDaemon, stopDaemon } from './client';
import {
  cleanupSession,
  getCurrentSessionId,
  listSessions,
  setCurrentSession,
  validateSession,
} from './session';
import type {
  MarkerFilterOptions,
  FunctionFilterOptions,
  SampleFilterSpec,
  CommandResult,
  CallTreeCollectionOptions,
  CallTreeScoringStrategy,
} from './protocol';
import {
  formatStatusResult,
  formatFunctionExpandResult,
  formatFunctionInfoResult,
  formatViewRangeResult,
  formatFilterStackResult,
  formatThreadInfoResult,
  formatMarkerStackResult,
  formatMarkerInfoResult,
  formatProfileInfoResult,
  formatThreadSamplesResult,
  formatThreadSamplesTopDownResult,
  formatThreadSamplesBottomUpResult,
  formatThreadMarkersResult,
  formatThreadFunctionsResult,
} from './formatters';

// Read session directory from environment (only place this is read)
const SESSION_DIR =
  process.env.PQ_SESSION_DIR || path.join(os.homedir(), '.pq');

interface Args {
  _: string[];
  session?: string;
  daemon?: boolean;
  help?: boolean;
  h?: boolean;
  guide?: boolean;
  json?: boolean;
  'max-lines'?: number;
  scoring?: string;
  // filter command flags (value-taking)
  'excludes-function'?: string;
  'excludes-any-function'?: string;
  merge?: string;
  'root-at'?: string;
  'includes-function'?: string;
  'includes-any-function'?: string;
  'includes-prefix'?: string;
  'includes-suffix'?: string;
  count?: string;
  // filter command presence flags
  'during-marker'?: boolean;
  'outside-marker'?: boolean;
  search?: string;
}

function printUsage(): void {
  console.log(`Usage: pq <command> [options]

Commands:
  load <PATH>                 Load a profile and start a daemon session
  profile info                Print profile summary (processes, threads, CPU activity) [--all] [--search <term>]
  thread info                 Print detailed thread information
  thread select <handle>      Select a thread (e.g., t-0, t-1)
  thread samples              Show hot functions list for a thread
  thread samples-top-down     Show top-down call tree (where CPU time is spent)
  thread samples-bottom-up    Show bottom-up call tree (what calls hot functions)
  thread markers              List markers with aggregated statistics
  thread functions            List all functions with CPU percentages
  marker info <handle>        Show detailed marker information (e.g., m-1234)
  marker stack <handle>       Show full stack trace for a marker (e.g., m-1234)
  function expand <handle>    Show full untruncated function name (e.g., f-123)
  function info <handle>     Show detailed function information
  zoom push <range>          Push a zoom range (e.g., 2.7,3.1 or ts-g,ts-G or m-158)
  zoom pop                   Pop the most recent zoom range
  zoom clear                 Clear all zoom ranges (return to full profile)
  filter push                Push a sticky sample filter (see filter flags below)
  filter pop [N]             Pop the last N filters (default: 1)
  filter list                List active filters for current thread
  filter clear               Remove all filters for current thread
  status                     Show session status (selected thread, zoom ranges, filters)
  stop [<id>]                Stop the current session, a specific session, or all with --all
  session list               List all running daemon sessions
  session use <id>           Switch the current session

Options:
  --session <id>           Use a specific session (default: current session)
  --thread <handle>        Specify thread by handle (e.g., t-0, t-1)
  --marker <handle>        Specify marker by handle (e.g., m-1, m-2)
  --function <handle>      Specify function by handle (e.g., f-123, f-456)
  --search <term>          Search/filter by substring (markers, functions, and samples call trees)
  --include-idle           Include idle samples in percentages (samples commands exclude idle by default)
  --category <name>        Filter markers by category name (case-insensitive substring match)
  --min-duration <ms>      Filter markers by minimum duration in milliseconds
  --max-duration <ms>      Filter markers by maximum duration in milliseconds
  --min-self <percent>     Filter functions by minimum self time percentage (for 'thread functions')
  --all                    Show all processes and threads (for 'profile info', overrides default top-5 limit)
  --has-stack              Filter to show only markers with stack traces
  --limit <N>              Limit the number of results shown
  --group-by <keys>        Group markers by custom keys (e.g., "type,name" or "type,field:eventType")
  --auto-group             Automatically determine grouping based on field variance
  --max-lines <N>          Maximum nodes in call tree (for 'samples-top-down'/'samples-bottom-up', default: 100)
  --scoring <strategy>     Call tree scoring: exponential-0.95, exponential-0.9 (default), exponential-0.8,
                           harmonic-0.1, harmonic-0.5, harmonic-1.0, percentage-only
  --json                   Output results as JSON (for use with jq, etc.)
  --guide                  Show detailed usage guide (commands, patterns, tips)
  --help, -h               Show this help message

Sample filter flags (work on 'thread samples/functions' ephemerally AND with 'filter push' for sticky use):
  --excludes-function <f-N>         Drop samples containing this function
  --excludes-any-function <f-N,...> Drop samples containing any of these functions (OR)
  --merge <f-N,...>                 Merge (remove) functions from stacks
  --root-at <f-N>                   Re-root stacks at this function
  --includes-function <f-N,...>     Keep only samples whose stack contains any of these functions
  --includes-any-function <f-N,...> Alias for --includes-function (explicit OR form)
  --includes-prefix <f-N,...>       Keep only samples whose stack starts with this root-first sequence
  --includes-suffix <f-N>           Keep only samples whose leaf frame is this function
  --during-marker --search <text>   Keep only samples during matching markers
  --outside-marker --search <text>  Keep only samples outside matching markers

  For 'filter push': exactly one filter flag per push.
  For 'thread samples/functions': multiple flags may be combined; applied in left-to-right order.
    The same flag may also be repeated (e.g. --merge f-1 --merge f-2) to apply it multiple times.

Examples:
  pq load profile.json.gz
  pq profile info
  pq thread info --thread t-0
  pq thread samples
  pq thread markers
  pq thread functions
  pq thread functions --search Present
  pq thread functions --min-self 1
  pq thread functions --limit 50
  pq thread markers --search DOMEvent
  pq thread markers --category Graphics
  pq thread markers --min-duration 10
  pq thread markers --max-duration 100
  pq thread markers --has-stack
  pq thread markers --limit 1000
  pq thread markers --group-by type,name
  pq thread markers --group-by type,field:eventType
  pq thread markers --auto-group
  pq marker info m-1234
  pq marker stack m-1234
  pq function expand f-123
  pq function info f-123
  pq zoom push 2.7,3.1
  pq zoom push m-158
  pq zoom pop
  pq zoom clear
  pq filter push --excludes-function f-184
  pq filter push --merge f-142,f-143
  pq filter push --includes-function f-500
  pq filter push --during-marker --search Paint
  pq filter push --outside-marker --search GC
  pq filter pop
  pq filter pop 3
  pq filter list
  pq filter clear
  pq thread samples --excludes-function f-184
  pq thread samples --merge f-1 --merge f-2 --root-at f-500
  pq thread samples --root-at f-500 --limit 30
  pq thread functions --includes-function f-500 --limit 20
  pq status
  pq stop
  pq stop abc123
  pq stop --all
  pq session list
  pq session use abc123
  pq thread samples-top-down --max-lines 50
  pq thread samples-top-down --scoring exponential-0.8
  pq thread samples-top-down --search GC
  pq thread samples-bottom-up --max-lines 200 --scoring harmonic-1.0
  pq thread samples --include-idle
`);
}

function printGuide(): void {
  console.log(guideText);
}

/**
 * Format command result for output.
 * If json flag is set, output JSON. Otherwise output as string.
 */
function formatOutput(
  result: string | CommandResult,
  jsonFlag: boolean
): string {
  if (jsonFlag) {
    if (typeof result === 'string') {
      // Legacy string result - wrap in a simple JSON structure
      return JSON.stringify({ type: 'text', result }, null, 2);
    }
    // Structured result - output as JSON
    return JSON.stringify(result, null, 2);
  }

  // Plain text output
  if (typeof result === 'string') {
    return result;
  }

  // Format structured results as plain text
  switch (result.type) {
    case 'status':
      return formatStatusResult(result);
    case 'filter-stack':
      return formatFilterStackResult(result);
    case 'function-expand':
      return formatFunctionExpandResult(result);
    case 'function-info':
      return formatFunctionInfoResult(result);
    case 'view-range':
      return formatViewRangeResult(result);
    case 'thread-info':
      return formatThreadInfoResult(result);
    case 'marker-stack':
      return formatMarkerStackResult(result);
    case 'marker-info':
      return formatMarkerInfoResult(result);
    case 'profile-info':
      return formatProfileInfoResult(result);
    case 'thread-samples':
      return formatThreadSamplesResult(result);
    case 'thread-samples-top-down':
      return formatThreadSamplesTopDownResult(result);
    case 'thread-samples-bottom-up':
      return formatThreadSamplesBottomUpResult(result);
    case 'thread-markers':
      return formatThreadMarkersResult(result);
    case 'thread-functions':
      return formatThreadFunctionsResult(result);
    default:
      // For types without formatters yet, fall back to JSON
      return JSON.stringify(result, null, 2);
  }
}

/**
 * Parse zero or more ephemeral SampleFilterSpecs from CLI arguments.
 * Used for `pq thread samples/functions` etc. to apply filters for one invocation.
 * Multiple flags are collected in order; each produces one spec. The same flag may be
 * repeated (e.g. --merge f-1 --merge f-2) to apply it multiple times.
 */
function parseEphemeralFilters(argv: Args): SampleFilterSpec[] {
  function parseFuncList(value: string): number[] {
    return value.split(',').map((s) => {
      const m = /^f-(\d+)$/.exec(s.trim());
      if (!m) {
        console.error(
          `Error: invalid function handle "${s.trim()}" (expected f-<N>)`
        );
        process.exit(1);
      }
      return parseInt(m[1], 10);
    });
  }

  // Normalize a flag value to an array to support repeated flags (e.g. --merge x --merge y).
  function toArray(value: unknown): string[] {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value as string];
  }

  const specs: SampleFilterSpec[] = [];

  for (const v of toArray(argv['excludes-function'])) {
    specs.push({ type: 'excludes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv['excludes-any-function'])) {
    specs.push({ type: 'excludes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv.merge)) {
    specs.push({ type: 'merge', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv['root-at'])) {
    const indexes = parseFuncList(v);
    if (indexes.length !== 1) {
      console.error('Error: --root-at takes exactly one function handle');
      process.exit(1);
    }
    specs.push({ type: 'root-at', funcIndex: indexes[0] });
  }
  for (const v of toArray(argv['includes-function'])) {
    specs.push({ type: 'includes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv['includes-any-function'])) {
    specs.push({ type: 'includes-function', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv['includes-prefix'])) {
    specs.push({ type: 'includes-prefix', funcIndexes: parseFuncList(v) });
  }
  for (const v of toArray(argv['includes-suffix'])) {
    const indexes = parseFuncList(v);
    if (indexes.length !== 1) {
      console.error(
        'Error: --includes-suffix takes exactly one function handle'
      );
      process.exit(1);
    }
    specs.push({ type: 'includes-suffix', funcIndex: indexes[0] });
  }
  if (argv['during-marker'] === true) {
    if (!argv.search) {
      console.error('Error: --during-marker requires --search <text>');
      process.exit(1);
    }
    specs.push({ type: 'during-marker', searchString: argv.search });
  }
  if (argv['outside-marker'] === true) {
    if (!argv.search) {
      console.error('Error: --outside-marker requires --search <text>');
      process.exit(1);
    }
    specs.push({ type: 'outside-marker', searchString: argv.search });
  }

  return specs;
}

/**
 * Parse a SampleFilterSpec from CLI arguments for `pq filter push`.
 * Exactly one filter flag must be provided.
 */
function parseFilterSpec(argv: Args): SampleFilterSpec {
  // Parse a comma-separated list of function handles (e.g. "f-1,f-2") into funcIndexes.
  function parseFuncList(value: string): number[] {
    return value.split(',').map((s) => {
      const m = /^f-(\d+)$/.exec(s.trim());
      if (!m) {
        console.error(
          `Error: invalid function handle "${s.trim()}" (expected f-<N>)`
        );
        process.exit(1);
      }
      return parseInt(m[1], 10);
    });
  }

  const flags = [
    'excludes-function',
    'excludes-any-function',
    'merge',
    'root-at',
    'includes-function',
    'includes-any-function',
    'includes-prefix',
    'includes-suffix',
  ] as const;

  const markerFlags = ['during-marker', 'outside-marker'] as const;
  const activeFlags = flags.filter((f) => argv[f] !== undefined);
  const activeMarkerFlags = markerFlags.filter((f) => argv[f] === true);

  const totalActive = activeFlags.length + activeMarkerFlags.length;
  if (totalActive === 0) {
    console.error(
      'Error: filter push requires one of: ' +
        [...flags, ...markerFlags].map((f) => `--${f}`).join(', ')
    );
    process.exit(1);
  }
  if (totalActive > 1) {
    console.error('Error: filter push accepts only one filter flag per push');
    process.exit(1);
  }

  if (argv['excludes-function'] !== undefined) {
    return {
      type: 'excludes-function',
      funcIndexes: parseFuncList(argv['excludes-function']),
    };
  }
  if (argv['excludes-any-function'] !== undefined) {
    return {
      type: 'excludes-function',
      funcIndexes: parseFuncList(argv['excludes-any-function']),
    };
  }
  if (argv.merge !== undefined) {
    return { type: 'merge', funcIndexes: parseFuncList(argv.merge) };
  }
  if (argv['root-at'] !== undefined) {
    const indexes = parseFuncList(argv['root-at']);
    if (indexes.length !== 1) {
      console.error('Error: --root-at takes exactly one function handle');
      process.exit(1);
    }
    return { type: 'root-at', funcIndex: indexes[0] };
  }
  if (argv['includes-function'] !== undefined) {
    return {
      type: 'includes-function',
      funcIndexes: parseFuncList(argv['includes-function']),
    };
  }
  if (argv['includes-any-function'] !== undefined) {
    return {
      type: 'includes-function',
      funcIndexes: parseFuncList(argv['includes-any-function']),
    };
  }
  if (argv['includes-prefix'] !== undefined) {
    return {
      type: 'includes-prefix',
      funcIndexes: parseFuncList(argv['includes-prefix']),
    };
  }
  if (argv['includes-suffix'] !== undefined) {
    const indexes = parseFuncList(argv['includes-suffix']);
    if (indexes.length !== 1) {
      console.error(
        'Error: --includes-suffix takes exactly one function handle'
      );
      process.exit(1);
    }
    return { type: 'includes-suffix', funcIndex: indexes[0] };
  }
  if (argv['during-marker'] === true) {
    if (!argv.search) {
      console.error('Error: --during-marker requires --search <text>');
      process.exit(1);
    }
    return { type: 'during-marker', searchString: argv.search };
  }
  if (argv['outside-marker'] === true) {
    if (!argv.search) {
      console.error('Error: --outside-marker requires --search <text>');
      process.exit(1);
    }
    return { type: 'outside-marker', searchString: argv.search };
  }

  // Should not be reachable.
  console.error('Error: no valid filter flag found');
  process.exit(1);
  throw new Error('unreachable');
}

async function main(): Promise<void> {
  const argv = minimist<Args>(process.argv.slice(2), {
    string: [
      'session',
      'thread',
      'marker',
      'sample',
      'function',
      'search',
      'min-duration',
      'max-duration',
      'min-self',
      'category',
      'limit',
      'group-by',
      'max-lines',
      'scoring',
      // filter command flags (value-taking)
      'excludes-function',
      'excludes-any-function',
      'merge',
      'root-at',
      'includes-function',
      'includes-any-function',
      'includes-prefix',
      'includes-suffix',
      'count',
    ],
    boolean: [
      'daemon',
      'help',
      'h',
      'guide',
      'all',
      'has-stack',
      'auto-group',
      'json',
      // filter command presence flags
      'during-marker',
      'outside-marker',
    ],
    alias: { h: 'help' },
  });

  // Check for help flag
  if (argv.help || argv.h) {
    printUsage();
    process.exit(0);
  }

  // Check for guide flag
  if (argv.guide) {
    printGuide();
    process.exit(0);
  }

  // Internal flag: running as daemon
  if (argv.daemon) {
    const profilePath = argv._[0];
    if (!profilePath) {
      console.error('Error: Profile path required for daemon mode');
      process.exit(1);
    }
    await startDaemon(SESSION_DIR, profilePath, argv.session);
    return;
  }

  // Parse command
  const command = argv._[0];

  if (!command) {
    console.error('Error: No command specified\n');
    printUsage();
    process.exit(1);
  }

  try {
    switch (command) {
      case 'help': {
        printUsage();
        break;
      }

      case 'load': {
        const profilePath = argv._[1];
        if (!profilePath) {
          console.error('Error: Profile path required for "load" command');
          console.error('Usage: pq load <PATH> [--session <id>]');
          process.exit(1);
        }

        console.log(`Loading profile from ${profilePath}...`);
        const sessionId = await startNewDaemon(
          SESSION_DIR,
          profilePath,
          argv.session
        );
        console.log(`Session started: ${sessionId}`);
        break;
      }

      case 'profile': {
        const subcommand = argv._[1] ?? 'info';
        if (subcommand === 'info' || subcommand === 'threads') {
          const result = await sendCommand(
            SESSION_DIR,
            {
              command: 'profile',
              subcommand,
              all: argv.all,
              search: argv.search,
            },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'thread': {
        const subcommand = argv._[1] ?? 'info';
        // For thread select, get the thread handle from argv._[2] if not provided via --thread flag
        const thread =
          argv.thread ?? (subcommand === 'select' ? argv._[2] : undefined);

        // Parse marker filter options if this is a markers command
        let markerFilters: MarkerFilterOptions | undefined;
        let functionFilters: FunctionFilterOptions | undefined;

        if (subcommand === 'markers') {
          const hasSearch = argv.search !== undefined;
          const hasMinDuration = argv['min-duration'] !== undefined;
          const hasMaxDuration = argv['max-duration'] !== undefined;
          const hasCategory = argv.category !== undefined;
          const hasStack = argv['has-stack'];
          const hasLimit = argv.limit !== undefined;
          const hasGroupBy = argv['group-by'] !== undefined;
          const hasAutoGroup = argv['auto-group'];

          if (
            hasSearch ||
            hasMinDuration ||
            hasMaxDuration ||
            hasCategory ||
            hasStack ||
            hasLimit ||
            hasGroupBy ||
            hasAutoGroup
          ) {
            markerFilters = {};
            if (hasSearch) {
              markerFilters.searchString = argv.search;
            }
            if (hasMinDuration) {
              const minDuration = parseFloat(argv['min-duration']);
              if (isNaN(minDuration) || minDuration < 0) {
                console.error(
                  'Error: --min-duration must be a positive number (in milliseconds)'
                );
                process.exit(1);
              }
              markerFilters.minDuration = minDuration;
            }
            if (hasMaxDuration) {
              const maxDuration = parseFloat(argv['max-duration']);
              if (isNaN(maxDuration) || maxDuration < 0) {
                console.error(
                  'Error: --max-duration must be a positive number (in milliseconds)'
                );
                process.exit(1);
              }
              markerFilters.maxDuration = maxDuration;
            }
            if (hasCategory) {
              markerFilters.category = argv.category;
            }
            if (hasStack) {
              markerFilters.hasStack = true;
            }
            if (hasLimit) {
              const limit = parseInt(argv.limit, 10);
              if (isNaN(limit) || limit <= 0) {
                console.error('Error: --limit must be a positive integer');
                process.exit(1);
              }
              markerFilters.limit = limit;
            }
            if (hasGroupBy) {
              markerFilters.groupBy = argv['group-by'];
            }
            if (hasAutoGroup) {
              markerFilters.autoGroup = true;
            }
          }
        }

        // Parse function filter options if this is a functions command
        if (subcommand === 'functions') {
          const hasSearch = argv.search !== undefined;
          const hasMinSelf = argv['min-self'] !== undefined;
          const hasLimit = argv.limit !== undefined;

          if (hasSearch || hasMinSelf || hasLimit) {
            functionFilters = {};
            if (hasSearch) {
              functionFilters.searchString = argv.search;
            }
            if (hasMinSelf) {
              const minSelf = parseFloat(argv['min-self']);
              if (isNaN(minSelf) || minSelf < 0 || minSelf > 100) {
                console.error(
                  'Error: --min-self must be a number between 0 and 100 (percentage)'
                );
                process.exit(1);
              }
              functionFilters.minSelf = minSelf;
            }
            if (hasLimit) {
              const limit = parseInt(argv.limit, 10);
              if (isNaN(limit) || limit <= 0) {
                console.error('Error: --limit must be a positive integer');
                process.exit(1);
              }
              functionFilters.limit = limit;
            }
          }
        }

        // Parse call tree options for samples-top-down and samples-bottom-up
        let callTreeOptions: CallTreeCollectionOptions | undefined;
        if (
          subcommand === 'samples-top-down' ||
          subcommand === 'samples-bottom-up'
        ) {
          const hasMaxLines = argv['max-lines'] !== undefined;
          const hasScoring = argv.scoring !== undefined;

          if (hasMaxLines || hasScoring) {
            callTreeOptions = {};
            if (hasMaxLines) {
              const maxLines = parseInt(String(argv['max-lines']), 10);
              if (isNaN(maxLines) || maxLines <= 0) {
                console.error('Error: --max-lines must be a positive integer');
                process.exit(1);
              }
              callTreeOptions.maxNodes = maxLines;
            }
            if (hasScoring) {
              const validStrategies = [
                'exponential-0.95',
                'exponential-0.92',
                'exponential-0.9',
                'exponential-0.8',
                'harmonic-0.1',
                'harmonic-0.5',
                'harmonic-1.0',
                'percentage-only',
              ];
              const scoringValue = argv.scoring;
              if (!scoringValue || !validStrategies.includes(scoringValue)) {
                console.error(
                  `Error: --scoring must be one of: ${validStrategies.join(', ')}`
                );
                process.exit(1);
              }
              callTreeOptions.scoringStrategy =
                scoringValue as CallTreeScoringStrategy;
            }
          }
        }

        const includeIdle =
          (subcommand === 'samples' ||
            subcommand === 'samples-top-down' ||
            subcommand === 'samples-bottom-up' ||
            subcommand === 'functions') &&
          argv['include-idle'] === true;

        const samplesSearch =
          (subcommand === 'samples' ||
            subcommand === 'samples-top-down' ||
            subcommand === 'samples-bottom-up') &&
          typeof argv.search === 'string'
            ? (argv.search as string)
            : undefined;

        if (
          subcommand === 'info' ||
          subcommand === 'select' ||
          subcommand === 'samples' ||
          subcommand === 'samples-top-down' ||
          subcommand === 'samples-bottom-up' ||
          subcommand === 'markers' ||
          subcommand === 'functions'
        ) {
          // Parse ephemeral sample filters for commands that support them.
          const sampleFilters =
            subcommand === 'samples' ||
            subcommand === 'samples-top-down' ||
            subcommand === 'samples-bottom-up' ||
            subcommand === 'functions'
              ? parseEphemeralFilters(argv)
              : undefined;

          const result = await sendCommand(
            SESSION_DIR,
            {
              command: 'thread',
              subcommand,
              thread,
              includeIdle: includeIdle || undefined,
              search: samplesSearch,
              markerFilters,
              functionFilters,
              callTreeOptions,
              sampleFilters: sampleFilters?.length ? sampleFilters : undefined,
            },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'marker': {
        const subcommand = argv._[1] ?? 'info';
        // For marker commands, get the marker handle from argv._[2] if not provided via --marker flag
        const marker =
          argv.marker ??
          (subcommand === 'info' ||
          subcommand === 'select' ||
          subcommand === 'stack'
            ? argv._[2]
            : undefined);
        if (
          subcommand === 'info' ||
          subcommand === 'select' ||
          subcommand === 'stack'
        ) {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'marker', subcommand, marker },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'sample': {
        const subcommand = argv._[1] ?? 'info';
        const sample = argv.sample;
        if (subcommand === 'info' || subcommand === 'select') {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'sample', subcommand, sample },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'function': {
        const subcommand = argv._[1] ?? 'info';
        // For function commands, get the function handle from argv._[2] if not provided via --function flag
        const function_ =
          argv.function ??
          (subcommand === 'info' ||
          subcommand === 'expand' ||
          subcommand === 'select'
            ? argv._[2]
            : undefined);
        if (
          subcommand === 'info' ||
          subcommand === 'expand' ||
          subcommand === 'select'
        ) {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'function', subcommand, function: function_ },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'filter': {
        const explicitSubcommand = argv._[1];
        const subcommand = explicitSubcommand ?? 'list';

        const thread = argv.thread ?? undefined;

        if (subcommand === 'push') {
          // Parse the filter spec from flags.
          const spec = parseFilterSpec(argv);
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'filter', subcommand: 'push', thread, spec },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else if (subcommand === 'pop') {
          // Accept count as positional arg ("pq filter pop 2") or --count flag.
          const rawCount = argv._[2] ?? argv.count;
          const count =
            rawCount !== undefined ? parseInt(String(rawCount), 10) : 1;
          if (isNaN(count) || count <= 0) {
            console.error('Error: count must be a positive integer');
            process.exit(1);
          }
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'filter', subcommand: 'pop', thread, count },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else if (subcommand === 'list') {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'filter', subcommand: 'list', thread },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
          if (!explicitSubcommand) {
            console.log('Other options: pq filter <push|pop|clear> [options]');
          }
        } else if (subcommand === 'clear') {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'filter', subcommand: 'clear', thread },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command filter ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'zoom': {
        const subcommand = argv._[1];
        if (!subcommand) {
          console.error('Error: zoom command requires a subcommand');
          console.error('Usage: pq zoom <push|pop|clear> [range]');
          process.exit(1);
        }
        if (subcommand === 'push') {
          const range = argv._[2];
          if (!range) {
            console.error('Error: zoom push requires a range argument');
            console.error('Usage: pq zoom push <range>');
            console.error('Example: pq zoom push 2.7,3.1');
            process.exit(1);
          }
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'zoom', subcommand: 'push', range },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else if (subcommand === 'pop') {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'zoom', subcommand: 'pop' },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else if (subcommand === 'clear') {
          const result = await sendCommand(
            SESSION_DIR,
            { command: 'zoom', subcommand: 'clear' },
            argv.session
          );
          console.log(formatOutput(result, argv.json || false));
        } else {
          console.error(`Error: Unknown command ${command} ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      case 'status': {
        const result = await sendCommand(
          SESSION_DIR,
          { command: 'status' },
          argv.session
        );
        console.log(formatOutput(result, argv.json || false));
        break;
      }

      case 'stop': {
        if (argv.all) {
          const sessionIds = listSessions(SESSION_DIR);
          await Promise.all(
            sessionIds.map((id) => stopDaemon(SESSION_DIR, id))
          );
        } else {
          // Accept session id as positional arg (pq stop <id>) or --session flag
          const sessionId = argv._[1] ?? argv.session;
          await stopDaemon(SESSION_DIR, sessionId);
        }
        break;
      }

      case 'session': {
        const subcommand = argv._[1];
        if (!subcommand || subcommand === 'list') {
          const sessionIds = listSessions(SESSION_DIR);
          let numCleaned = 0;
          const runningSessionMetadata = [];
          for (const sessionId of sessionIds) {
            const metadata = validateSession(SESSION_DIR, sessionId);
            if (metadata === null) {
              cleanupSession(SESSION_DIR, sessionId);
              numCleaned++;
              continue;
            }
            runningSessionMetadata.push(metadata);
          }

          if (numCleaned !== 0) {
            console.log(`Cleaned up ${numCleaned} stale sessions.`);
            console.log();
          }
          runningSessionMetadata.sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          const currentSessionId = getCurrentSessionId(SESSION_DIR);
          console.log(
            `Found ${runningSessionMetadata.length} running sessions:`
          );
          for (const metadata of runningSessionMetadata) {
            const isCurrent = metadata.id === currentSessionId;
            const marker = isCurrent ? '* ' : '  ';
            console.log(
              `${marker}${metadata.id}, created at ${metadata.createdAt} [daemon pid: ${metadata.pid}]`
            );
          }
        } else if (subcommand === 'use') {
          const sessionId = argv._[2];
          if (!sessionId) {
            console.error('Error: session use requires a session id');
            console.error('Usage: pq session use <id>');
            process.exit(1);
          }
          const metadata = validateSession(SESSION_DIR, sessionId);
          if (metadata === null) {
            console.error(
              `Error: session "${sessionId}" not found or not running`
            );
            process.exit(1);
          }
          setCurrentSession(SESSION_DIR, sessionId);
          console.log(`Switched to session ${sessionId}`);
        } else {
          console.error(`Error: Unknown command session ${subcommand}`);
          process.exit(1);
        }
        break;
      }

      default: {
        console.error(`Error: Unknown command "${command}"\n`);
        printUsage();
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
