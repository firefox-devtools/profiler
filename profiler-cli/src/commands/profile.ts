/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli profile` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { addGlobalOptions, parseIntArg } from './shared';

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
    const result = await sendCommand(
      sessionDir,
      {
        command: 'profile',
        subcommand: 'info',
        all: opts.all,
        search: opts.search,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
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

    const result = await sendCommand(
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
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
