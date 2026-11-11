/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli status` and `profiler-cli permalink` commands.
 */

import type { Command } from 'commander';
import { addGlobalOptions, type CommandContext } from './shared';

export function registerStatusCommands(
  program: Command,
  ctx: CommandContext
): void {
  addGlobalOptions(
    program
      .command('status')
      .description(
        'Show session status (selected thread, zoom ranges, filters)'
      )
  ).action(async (opts) => {
    await ctx.run({ command: 'status' }, opts);
  });

  addGlobalOptions(
    program
      .command('permalink')
      .description(
        'Print a profiler.firefox.com URL for the current view of an already published profile'
      )
      .option('--short', 'Shorten the URL through share.firefox.dev')
  ).action(async (opts) => {
    await ctx.run({ command: 'permalink', short: opts.short ?? false }, opts);
  });
}
