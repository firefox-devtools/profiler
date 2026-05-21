/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli thread` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { parseEphemeralFilters } from '../utils/parse';
import {
  addGlobalOptions,
  addSampleFilterOptions,
  parseIntArg,
  parseFloatArg,
} from './shared';
import type {
  CallTreeScoringStrategy,
  MarkerFilterOptions,
  FunctionFilterOptions,
} from '../protocol';

const VALID_SCORING_STRATEGIES: CallTreeScoringStrategy[] = [
  'exponential-0.95',
  'exponential-0.9',
  'exponential-0.8',
  'harmonic-0.1',
  'harmonic-0.5',
  'harmonic-1.0',
  'percentage-only',
];

function addSamplesOptions(cmd: Command): Command {
  return addSampleFilterOptions(
    addGlobalOptions(cmd)
      .option('--thread <handle>', 'Thread handle (e.g. t-0)')
      .option('--include-idle', 'Include idle samples in percentages')
      .option(
        '--search <term>',
        'Keep samples containing this substring in any frame. Comma-separates multiple terms, all must match (AND).'
      )
      .option('--limit <N>', 'Limit the number of results shown')
  );
}

function addCallTreeOptions(cmd: Command): Command {
  return addSamplesOptions(cmd)
    .option('--max-lines <N>', 'Maximum nodes in call tree (default: 100)')
    .option(
      '--scoring <strategy>',
      `Call tree scoring strategy: ${VALID_SCORING_STRATEGIES.join(', ')}`
    );
}

function parseCallTreeOptions(opts: {
  maxLines?: unknown;
  scoring?: string;
}):
  | { maxNodes?: number; scoringStrategy?: CallTreeScoringStrategy }
  | undefined {
  if (opts.maxLines === undefined && opts.scoring === undefined) {
    return undefined;
  }
  const result: {
    maxNodes?: number;
    scoringStrategy?: CallTreeScoringStrategy;
  } = {};
  if (opts.maxLines !== undefined) {
    result.maxNodes = parseIntArg('--max-lines', String(opts.maxLines), 1);
  }
  if (opts.scoring !== undefined) {
    if (!(VALID_SCORING_STRATEGIES as string[]).includes(opts.scoring)) {
      console.error(
        `Error: --scoring must be one of: ${VALID_SCORING_STRATEGIES.join(', ')}`
      );
      process.exit(1);
    }
    result.scoringStrategy = opts.scoring as CallTreeScoringStrategy;
  }
  return result;
}

export function registerThreadCommand(
  program: Command,
  sessionDir: string
): void {
  const thread = program.command('thread').description('Thread-level commands');

  // thread info
  addGlobalOptions(
    thread
      .command('info')
      .description('Print detailed thread information')
      .option('--thread <handle>', 'Thread handle (e.g. t-0)')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'thread', subcommand: 'info', thread: opts.thread },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread select
  addGlobalOptions(
    thread
      .command('select [handle]')
      .description('Select a thread (e.g. t-0, t-1)')
      .option('--thread <handle>', 'Thread handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const threadHandle = handleArg ?? opts.thread;
    const result = await sendCommand(
      sessionDir,
      { command: 'thread', subcommand: 'select', thread: threadHandle },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread samples
  addSamplesOptions(
    thread
      .command('samples')
      .description('Show hot functions list for a thread')
  ).action(async (opts) => {
    const sampleFilters = parseEphemeralFilters(opts);
    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'samples',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        search: opts.search,
        sampleFilters: sampleFilters.length ? sampleFilters : undefined,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread samples-top-down
  addCallTreeOptions(
    thread
      .command('samples-top-down')
      .description('Show top-down call tree (where CPU time is spent)')
  ).action(async (opts) => {
    const sampleFilters = parseEphemeralFilters(opts);
    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'samples-top-down',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        search: opts.search,
        callTreeOptions: parseCallTreeOptions(opts),
        sampleFilters: sampleFilters.length ? sampleFilters : undefined,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread samples-bottom-up
  addCallTreeOptions(
    thread
      .command('samples-bottom-up')
      .description('Show bottom-up call tree (what calls hot functions)')
  ).action(async (opts) => {
    const sampleFilters = parseEphemeralFilters(opts);
    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'samples-bottom-up',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        search: opts.search,
        callTreeOptions: parseCallTreeOptions(opts),
        sampleFilters: sampleFilters.length ? sampleFilters : undefined,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread markers
  addGlobalOptions(
    thread
      .command('markers')
      .description('List markers with aggregated statistics')
      .option('--thread <handle>', 'Thread handle (e.g. t-0)')
      .option('--search <term>', 'Filter by substring')
      .option(
        '--category <name>',
        'Filter by category name (case-insensitive substring match)'
      )
      .option(
        '--min-duration <ms>',
        'Filter by minimum duration in milliseconds'
      )
      .option(
        '--max-duration <ms>',
        'Filter by maximum duration in milliseconds'
      )
      .option('--has-stack', 'Show only markers with stack traces')
      .option('--limit <N>', 'Limit the number of results shown')
      .option(
        '--group-by <keys>',
        'Group by custom keys (e.g. "type,name" or "type,field:eventType")'
      )
      .option(
        '--auto-group',
        'Automatically determine grouping based on field variance'
      )
      .option(
        '--top-n <N>',
        'Number of top markers to include per group in JSON output (default: 5)'
      )
      .option('--list', 'Show a flat chronological list of individual markers')
  ).action(async (opts) => {
    let markerFilters: MarkerFilterOptions | undefined;

    if (
      opts.search !== undefined ||
      opts.minDuration !== undefined ||
      opts.maxDuration !== undefined ||
      opts.category !== undefined ||
      opts.hasStack ||
      opts.limit !== undefined ||
      opts.groupBy !== undefined ||
      opts.autoGroup ||
      opts.topN !== undefined ||
      opts.list
    ) {
      markerFilters = {};
      if (opts.search !== undefined) {
        markerFilters.searchString = opts.search;
      }
      if (opts.category !== undefined) {
        markerFilters.category = opts.category;
      }
      if (opts.hasStack) {
        markerFilters.hasStack = true;
      }
      if (opts.autoGroup) {
        markerFilters.autoGroup = true;
      }
      if (opts.groupBy !== undefined) {
        markerFilters.groupBy = opts.groupBy;
      }
      if (opts.list) {
        markerFilters.list = true;
      }

      if (opts.minDuration !== undefined) {
        markerFilters.minDuration = parseFloatArg(
          '--min-duration',
          opts.minDuration,
          0,
          Infinity,
          'Error: --min-duration must be a positive number (in milliseconds)'
        );
      }
      if (opts.maxDuration !== undefined) {
        markerFilters.maxDuration = parseFloatArg(
          '--max-duration',
          opts.maxDuration,
          0,
          Infinity,
          'Error: --max-duration must be a positive number (in milliseconds)'
        );
      }
      if (opts.limit !== undefined) {
        markerFilters.limit = parseIntArg('--limit', opts.limit, 1);
      }
      if (opts.topN !== undefined) {
        markerFilters.topN = parseIntArg('--top-n', opts.topN, 1);
      }
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'markers',
        thread: opts.thread,
        markerFilters,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread network
  addGlobalOptions(
    thread
      .command('network')
      .description('Show network requests with timing phases')
      .option('--thread <handle>', 'Thread handle (e.g. t-0)')
      .option('--search <term>', 'Filter by URL substring')
      .option(
        '--min-duration <ms>',
        'Filter by minimum total request duration in milliseconds'
      )
      .option(
        '--max-duration <ms>',
        'Filter by maximum total request duration in milliseconds'
      )
      .option('--limit <N>', 'Max requests to show (default: 20, 0 = show all)')
  ).action(async (opts) => {
    const networkFilters: {
      searchString?: string;
      minDuration?: number;
      maxDuration?: number;
      limit?: number;
    } = {};

    if (opts.search !== undefined) {
      networkFilters.searchString = opts.search;
    }
    if (opts.minDuration !== undefined) {
      networkFilters.minDuration = parseFloatArg(
        '--min-duration',
        opts.minDuration,
        0,
        Infinity,
        'Error: --min-duration must be a positive number (in milliseconds)'
      );
    }
    if (opts.maxDuration !== undefined) {
      networkFilters.maxDuration = parseFloatArg(
        '--max-duration',
        opts.maxDuration,
        0,
        Infinity,
        'Error: --max-duration must be a positive number (in milliseconds)'
      );
    }
    if (opts.limit !== undefined) {
      networkFilters.limit = parseIntArg(
        '--limit',
        opts.limit,
        0,
        'Error: --limit must be a non-negative integer (0 = show all)'
      );
    } else {
      networkFilters.limit = 20;
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'network',
        thread: opts.thread,
        networkFilters,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread page-load
  addGlobalOptions(
    thread
      .command('page-load')
      .description(
        'Show page load summary: navigation timing, resources, CPU categories, and jank'
      )
      .option('--thread <handle>', 'Thread handle (e.g. t-0)')
      .option(
        '--navigation <N>',
        'Select which navigation to show (1-based, default: last completed)'
      )
      .option(
        '--jank-limit <N>',
        'Max jank periods to show (default: 10, 0 = show all)'
      )
  ).action(async (opts) => {
    const pageLoadOptions: { navigationIndex?: number; jankLimit?: number } =
      {};

    if (opts.navigation !== undefined) {
      pageLoadOptions.navigationIndex = parseIntArg(
        '--navigation',
        opts.navigation,
        1,
        'Error: --navigation must be a positive integer (1-based index)'
      );
    }
    if (opts.jankLimit !== undefined) {
      pageLoadOptions.jankLimit = parseIntArg(
        '--jank-limit',
        opts.jankLimit,
        0,
        'Error: --jank-limit must be a non-negative integer (0 = show all)'
      );
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'page-load',
        thread: opts.thread,
        pageLoadOptions,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  // thread functions
  addSampleFilterOptions(
    addGlobalOptions(
      thread
        .command('functions')
        .description('List all functions with CPU percentages')
        .option('--thread <handle>', 'Thread handle (e.g. t-0)')
        .option('--search <term>', 'Filter by substring')
        .option(
          '--min-self <percent>',
          'Filter by minimum self time percentage'
        )
        .option('--limit <N>', 'Limit the number of results shown')
        .option('--include-idle', 'Include idle samples in percentages')
    )
  ).action(async (opts) => {
    let functionFilters: FunctionFilterOptions | undefined;

    if (
      opts.search !== undefined ||
      opts.minSelf !== undefined ||
      opts.limit !== undefined
    ) {
      functionFilters = {};
      if (opts.search !== undefined) {
        functionFilters.searchString = opts.search;
      }
      if (opts.minSelf !== undefined) {
        functionFilters.minSelf = parseFloatArg(
          '--min-self',
          opts.minSelf,
          0,
          100,
          'Error: --min-self must be a number between 0 and 100 (percentage)'
        );
      }
      if (opts.limit !== undefined) {
        functionFilters.limit = parseIntArg('--limit', opts.limit, 1);
      }
    }

    const sampleFilters = parseEphemeralFilters(opts);

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'functions',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        functionFilters,
        sampleFilters: sampleFilters.length ? sampleFilters : undefined,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
