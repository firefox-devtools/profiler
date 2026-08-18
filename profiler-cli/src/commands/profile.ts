/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli profile` command.
 */

import type { Command } from 'commander';
import type { MarkerFilterOptions } from '../protocol';
import {
  addGlobalOptions,
  parseFloatArg,
  parseIntArg,
  runCommand,
} from './shared';

export function registerProfileCommand(
  program: Command,
  sessionDir: string
): void {
  const profile = program
    .command('profile')
    .description('Profile-level commands');

  addGlobalOptions(
    profile
      .command('info')
      .description('Print profile summary (processes, threads, CPU activity)')
      .option(
        '--all',
        'Show all processes and threads (overrides default top-5 limit)'
      )
      .option('--search <term>', 'Filter by substring')
  ).action(async (opts) => {
    await runCommand(
      sessionDir,
      {
        command: 'profile',
        subcommand: 'info',
        all: opts.all,
        search: opts.search,
      },
      opts
    );
  });

  addGlobalOptions(
    profile
      .command('meta')
      .description(
        'Print profile metadata (application, platform, recording settings)'
      )
  ).action(async (opts) => {
    await runCommand(
      sessionDir,
      {
        command: 'profile',
        subcommand: 'meta',
      },
      opts
    );
  });

  addGlobalOptions(
    profile
      .command('markers')
      .description(
        'Search markers across all threads (same rows as `thread markers --list`, plus a thread column)'
      )
      .option(
        '--search <term>',
        'Filter by substring (also supports field:value and - negation)'
      )
      .option(
        '--thread <handle>',
        'Restrict the search to a specific thread (e.g. t-0); default is every thread'
      )
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
      .option(
        '--limit <N>',
        'Limit the number of marker rows shown (max 100000; the per-thread counts stay exact)'
      )
  ).action(async (opts) => {
    const markerFilters: MarkerFilterOptions & { thread?: string } = {};

    if (opts.search !== undefined) {
      markerFilters.searchString = opts.search;
    }
    if (opts.thread !== undefined) {
      markerFilters.thread = opts.thread;
    }
    if (opts.category !== undefined) {
      markerFilters.category = opts.category;
    }
    if (opts.hasStack) {
      markerFilters.hasStack = true;
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
    // Without a filter this sweeps every marker in the profile and the first
    // rows are whichever markers thread 0 happened to record first, which
    // answers nothing. `--limit` is an explicit opt-in to that browsing mode.
    if (Object.keys(markerFilters).length === 0 && opts.limit === undefined) {
      console.error(
        'Error: profile markers needs a filter: --search, --category, --min-duration, --max-duration, --has-stack, or --thread.\n' +
          'For a thread inventory use "profile info"; to browse one thread use "thread markers".'
      );
      process.exit(1);
    }

    if (opts.limit !== undefined) {
      markerFilters.limit = parseIntArg('--limit', opts.limit, 1);
    }

    await runCommand(
      sessionDir,
      {
        command: 'profile',
        subcommand: 'markers',
        markerFilters:
          Object.keys(markerFilters).length > 0 ? markerFilters : undefined,
      },
      opts
    );
  });

  const VALID_LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'];

  addGlobalOptions(
    profile
      .command('logs')
      .description('Print Log markers in MOZ_LOG format')
      .option('--thread <handle>', 'Filter to a specific thread (e.g. t-0)')
      .option('--module <name>', 'Filter by module name (substring match)')
      .option(
        '--level <level>',
        `Minimum log level: ${VALID_LOG_LEVELS.join(', ')}`
      )
      .option('--search <term>', 'Filter by substring in message')
      .option('--limit <N>', 'Limit to first N entries')
  ).action(async (opts) => {
    if (opts.level !== undefined && !VALID_LOG_LEVELS.includes(opts.level)) {
      console.error(
        `Error: --level must be one of: ${VALID_LOG_LEVELS.join(', ')}`
      );
      process.exit(1);
    }

    let limit: number | undefined;
    if (opts.limit !== undefined) {
      limit = parseIntArg('--limit', opts.limit, 1);
    }

    const hasFilters =
      opts.thread !== undefined ||
      opts.module !== undefined ||
      opts.level !== undefined ||
      opts.search !== undefined ||
      limit !== undefined;

    await runCommand(
      sessionDir,
      {
        command: 'profile',
        subcommand: 'logs',
        logFilters: hasFilters
          ? {
              thread: opts.thread,
              module: opts.module,
              level: opts.level,
              search: opts.search,
              limit,
            }
          : undefined,
      },
      opts
    );
  });
}
