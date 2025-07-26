/**
 * CLI entry point for pq (Profile Querier).
 *
 * Usage:
 *   pq load <PATH> [--session <id>]          Start a new daemon and load a profile
 *   pq profile info [--session <id>]         Print profile summary
 *   pq thread info [--thread <handle>]       Print thread information
 *   pq thread samples [--thread <handle>]    Show thread call tree and top functions
 *   pq stop [--session <id>] [--all]         Stop the daemon
 *   pq list-sessions                          List all running sessions
 *
 * Build:
 *   yarn build-profile-query-cli
 *
 * Run:
 *   pq <command>                    (if pq is in PATH)
 *   ./dist/pq.js <command>          (direct invocation)
 *
 * Helper scripts:
 *   ./bin/pq-test          Quick smoke test
 *   ./bin/pq-test-multi    Test multiple concurrent sessions
 *   ./bin/pq-status        Show session status
 *   ./bin/pq-clean         Clean up sessions (--logs to also remove logs)
 */

import * as path from 'path';
import * as os from 'os';
import minimist from 'minimist';
import { startDaemon } from './daemon';
import { sendCommand, startNewDaemon, stopDaemon } from './client';
import { cleanupSession, listSessions, validateSession } from './session';
import type {
  MarkerFilterOptions,
  FunctionFilterOptions,
  CommandResult,
  CallTreeCollectionOptions,
  CallTreeScoringStrategy,
} from './protocol';
import {
  formatStatusResult,
  formatFunctionExpandResult,
  formatFunctionInfoResult,
  formatViewRangeResult,
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
  json?: boolean;
  'max-lines'?: number;
  scoring?: string;
}

function printUsage(): void {
  console.log(`Usage: pq <command> [options]

Commands:
  load <PATH>                 Load a profile and start a daemon session
  profile info                Print profile summary (processes, threads, CPU activity)
  thread info                 Print detailed thread information
  thread select <handle>      Select a thread (e.g., t-0, t-1)
  thread samples              Show hot functions list for a thread
  thread samples-top-down     Show top-down call tree (where CPU time is spent)
  thread samples-bottom-up    Show bottom-up call tree (what calls hot functions)
  thread markers              List markers with aggregated statistics
  thread functions            List all functions with CPU percentages
  marker info <handle>        Show detailed marker information (e.g., m-1234)
  marker stack <handle>       Show full stack trace for a marker (e.g., m-1234)
  function expand <handle>    Show full untruncated function name (e.g., f-1)
  function info <handle>     Show detailed function information
  zoom push <range>          Push a zoom range (e.g., 2.7,3.1 or ts-g,ts-G or m-158)
  zoom pop                   Pop the most recent zoom range
  zoom clear                 Clear all zoom ranges (return to full profile)
  status                     Show session status (selected thread, zoom ranges)
  stop                       Stop the daemon session
  list-sessions              List all running daemon sessions

Options:
  --session <id>           Use a specific session (default: current session)
  --thread <handle>        Specify thread by handle (e.g., t-0, t-1)
  --marker <handle>        Specify marker by handle (e.g., m-1, m-2)
  --function <handle>      Specify function by handle (e.g., f-1, f-2)
  --search <term>          Search/filter by substring (for 'thread markers' and 'thread functions')
  --category <name>        Filter markers by category name (case-insensitive substring match)
  --min-duration <ms>      Filter markers by minimum duration in milliseconds
  --max-duration <ms>      Filter markers by maximum duration in milliseconds
  --min-self <percent>     Filter functions by minimum self time percentage (for 'thread functions')
  --has-stack              Filter to show only markers with stack traces
  --limit <N>              Limit the number of results shown
  --group-by <keys>        Group markers by custom keys (e.g., "type,name" or "type,field:eventType")
  --auto-group             Automatically determine grouping based on field variance
  --max-lines <N>          Maximum nodes in call tree (for 'samples-top-down'/'samples-bottom-up', default: 100)
  --scoring <strategy>     Call tree scoring: exponential-0.95, exponential-0.9 (default), exponential-0.8,
                           harmonic-0.1, harmonic-0.5, harmonic-1.0, percentage-only
  --json                   Output results as JSON (for use with jq, etc.)
  --help, -h               Show this help message

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
  pq thread markers --category Layout --min-duration 5
  pq thread markers --search Reflow --min-duration 5 --max-duration 50
  pq thread markers --has-stack --category Other --limit 500
  pq thread markers --group-by type,name
  pq thread markers --group-by type,field:eventType
  pq thread markers --auto-group
  pq thread markers --search DOMEvent --group-by field:eventType
  pq marker info m-1234
  pq marker stack m-1234
  pq function expand f-12
  pq function info f-12
  pq zoom push 2.7,3.1
  pq zoom push m-158
  pq zoom pop
  pq zoom clear
  pq status
  pq stop
  pq list-sessions
  pq thread samples-top-down --max-lines 50
  pq thread samples-top-down --scoring exponential-0.8
  pq thread samples-bottom-up --max-lines 200 --scoring harmonic-1.0
`);
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
    ],
    boolean: ['daemon', 'help', 'h', 'all', 'has-stack', 'auto-group', 'json'],
    alias: { h: 'help' },
  });

  // Check for help flag
  if (argv.help || argv.h) {
    printUsage();
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
            { command: 'profile', subcommand },
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
          const hasSearch = !!argv.search;
          const hasMinDuration = !!argv['min-duration'];
          const hasMaxDuration = !!argv['max-duration'];
          const hasCategory = !!argv.category;
          const hasStack = argv['has-stack'];
          const hasLimit = !!argv.limit;
          const hasGroupBy = !!argv['group-by'];
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
          const hasSearch = !!argv.search;
          const hasMinSelf = !!argv['min-self'];
          const hasLimit = !!argv.limit;

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
          const hasMaxLines = !!argv['max-lines'];
          const hasScoring = !!argv.scoring;

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

        if (
          subcommand === 'info' ||
          subcommand === 'select' ||
          subcommand === 'samples' ||
          subcommand === 'samples-top-down' ||
          subcommand === 'samples-bottom-up' ||
          subcommand === 'markers' ||
          subcommand === 'functions'
        ) {
          const result = await sendCommand(
            SESSION_DIR,
            {
              command: 'thread',
              subcommand,
              thread,
              markerFilters,
              functionFilters,
              callTreeOptions,
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
          await stopDaemon(SESSION_DIR, argv.session);
        }
        break;
      }

      case 'list-sessions': {
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
        console.log(`Found ${runningSessionMetadata.length} running sessions:`);
        for (const metadata of runningSessionMetadata) {
          console.log(
            `- ${metadata.id}, created at ${metadata.createdAt} [daemon pid: ${metadata.pid}]`
          );
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
