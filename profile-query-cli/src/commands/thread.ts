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
import { addGlobalOptions, addSampleFilterOptions } from './shared';
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

    let callTreeOptions = undefined;
    if (opts.maxLines !== undefined || opts.scoring !== undefined) {
      callTreeOptions = {} as {
        maxNodes?: number;
        scoringStrategy?: CallTreeScoringStrategy;
      };
      if (opts.maxLines !== undefined) {
        const maxLines = parseInt(String(opts.maxLines), 10);
        if (isNaN(maxLines) || maxLines <= 0) {
          console.error('Error: --max-lines must be a positive integer');
          process.exit(1);
        }
        callTreeOptions.maxNodes = maxLines;
      }
      if (opts.scoring !== undefined) {
        if (!VALID_SCORING_STRATEGIES.includes(opts.scoring)) {
          console.error(
            `Error: --scoring must be one of: ${VALID_SCORING_STRATEGIES.join(', ')}`
          );
          process.exit(1);
        }
        callTreeOptions.scoringStrategy =
          opts.scoring as CallTreeScoringStrategy;
      }
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'samples-top-down',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        search: opts.search,
        callTreeOptions,
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

    let callTreeOptions = undefined;
    if (opts.maxLines !== undefined || opts.scoring !== undefined) {
      callTreeOptions = {} as {
        maxNodes?: number;
        scoringStrategy?: CallTreeScoringStrategy;
      };
      if (opts.maxLines !== undefined) {
        const maxLines = parseInt(String(opts.maxLines), 10);
        if (isNaN(maxLines) || maxLines <= 0) {
          console.error('Error: --max-lines must be a positive integer');
          process.exit(1);
        }
        callTreeOptions.maxNodes = maxLines;
      }
      if (opts.scoring !== undefined) {
        if (!VALID_SCORING_STRATEGIES.includes(opts.scoring)) {
          console.error(
            `Error: --scoring must be one of: ${VALID_SCORING_STRATEGIES.join(', ')}`
          );
          process.exit(1);
        }
        callTreeOptions.scoringStrategy =
          opts.scoring as CallTreeScoringStrategy;
      }
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'thread',
        subcommand: 'samples-bottom-up',
        thread: opts.thread,
        includeIdle: opts.includeIdle || undefined,
        search: opts.search,
        callTreeOptions,
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
      opts.topN !== undefined
    ) {
      markerFilters = {};
      if (opts.search !== undefined) markerFilters.searchString = opts.search;
      if (opts.category !== undefined) markerFilters.category = opts.category;
      if (opts.hasStack) markerFilters.hasStack = true;
      if (opts.autoGroup) markerFilters.autoGroup = true;
      if (opts.groupBy !== undefined) markerFilters.groupBy = opts.groupBy;

      if (opts.minDuration !== undefined) {
        const minDuration = parseFloat(opts.minDuration);
        if (isNaN(minDuration) || minDuration < 0) {
          console.error(
            'Error: --min-duration must be a positive number (in milliseconds)'
          );
          process.exit(1);
        }
        markerFilters.minDuration = minDuration;
      }
      if (opts.maxDuration !== undefined) {
        const maxDuration = parseFloat(opts.maxDuration);
        if (isNaN(maxDuration) || maxDuration < 0) {
          console.error(
            'Error: --max-duration must be a positive number (in milliseconds)'
          );
          process.exit(1);
        }
        markerFilters.maxDuration = maxDuration;
      }
      if (opts.limit !== undefined) {
        const limit = parseInt(opts.limit, 10);
        if (isNaN(limit) || limit <= 0) {
          console.error('Error: --limit must be a positive integer');
          process.exit(1);
        }
        markerFilters.limit = limit;
      }
      if (opts.topN !== undefined) {
        const topN = parseInt(opts.topN, 10);
        if (isNaN(topN) || topN <= 0) {
          console.error('Error: --top-n must be a positive integer');
          process.exit(1);
        }
        markerFilters.topN = topN;
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
      if (opts.search !== undefined) functionFilters.searchString = opts.search;
      if (opts.minSelf !== undefined) {
        const minSelf = parseFloat(opts.minSelf);
        if (isNaN(minSelf) || minSelf < 0 || minSelf > 100) {
          console.error(
            'Error: --min-self must be a number between 0 and 100 (percentage)'
          );
          process.exit(1);
        }
        functionFilters.minSelf = minSelf;
      }
      if (opts.limit !== undefined) {
        const limit = parseInt(opts.limit, 10);
        if (isNaN(limit) || limit <= 0) {
          console.error('Error: --limit must be a positive integer');
          process.exit(1);
        }
        functionFilters.limit = limit;
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
