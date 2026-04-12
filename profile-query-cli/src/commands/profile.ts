/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `pq profile` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { addGlobalOptions } from './shared';

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
}
