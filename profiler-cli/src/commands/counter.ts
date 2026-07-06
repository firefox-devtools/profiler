/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli counter` command.
 */

import type { Command } from 'commander';
import { addGlobalOptions, runCommand } from './shared';

export function registerCounterCommand(
  program: Command,
  sessionDir: string
): void {
  const counter = program
    .command('counter')
    .description('Counter-level commands');

  addGlobalOptions(
    counter
      .command('list')
      .description('List all counters with one-line summaries')
  ).action(async (opts) => {
    await runCommand(
      sessionDir,
      { command: 'counter', subcommand: 'list' },
      opts
    );
  });

  addGlobalOptions(
    counter
      .command('info [handle]')
      .description('Show detailed information about a counter (e.g. c-0)')
      .option('--counter <handle>', 'Counter handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const counterHandle = handleArg ?? opts.counter;
    await runCommand(
      sessionDir,
      { command: 'counter', subcommand: 'info', counter: counterHandle },
      opts
    );
  });
}
