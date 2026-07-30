/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli sourcemap` command.
 */

import type { Command } from 'commander';
import { addGlobalOptions, runCommand } from './shared';

export function registerSourcemapCommand(
  program: Command,
  sessionDir: string
): void {
  const sourcemap = program
    .command('sourcemap')
    .description('Apply source maps to de-minify JavaScript stacks');

  addGlobalOptions(
    sourcemap
      .command('sources')
      .description(
        'List bundle sources eligible for a source map (src-N handles)'
      )
  ).action(async (opts) => {
    await runCommand(
      sessionDir,
      { command: 'sourcemap', subcommand: 'sources' },
      opts
    );
  });
}
