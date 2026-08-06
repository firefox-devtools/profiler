/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli strategy` command.
 */

import type { Command } from 'commander';
import { CALL_TREE_SUMMARY_STRATEGIES } from 'firefox-profiler/profile-query/call-tree-strategy';
import { addGlobalOptions, parseStrategyArg, runCommand } from './shared';

export function registerStrategyCommand(
  program: Command,
  sessionDir: string
): void {
  addGlobalOptions(
    program
      .command('strategy <name>')
      .description(
        `Set the data source that the samples and functions commands summarize: ${CALL_TREE_SUMMARY_STRATEGIES.join(', ')}`
      )
  ).action(async (nameArg: string, opts) => {
    await runCommand(
      sessionDir,
      { command: 'strategy', strategy: parseStrategyArg('strategy', nameArg) },
      opts
    );
  });
}
