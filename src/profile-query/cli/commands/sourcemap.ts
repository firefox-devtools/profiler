/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli sourcemap` command.
 */

import type { Command } from 'commander';
import { CliUsageError } from 'firefox-profiler/profile-query/cli/parse';
import { addGlobalOptions, type CommandContext } from './shared';

export function registerSourcemapCommand(
  program: Command,
  ctx: CommandContext
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
    await ctx.run({ command: 'sourcemap', subcommand: 'sources' }, opts);
  });

  const { fileSystem } = ctx;
  if (fileSystem === null) {
    return;
  }

  addGlobalOptions(
    sourcemap
      .command('apply <path>')
      .description('Apply a .map file, auto-matching it to a bundle source')
      .option(
        '--to <src-N>',
        'Apply to this source instead of auto-matching (from "sourcemap sources")'
      )
  ).action(async (mapPath: string, opts) => {
    // Resolve to an absolute path here: the daemon runs with a different cwd,
    // so it can only read the file by absolute path (mirrors the load flow).
    const absolutePath = fileSystem.resolvePath(mapPath);
    if (!fileSystem.exists(absolutePath)) {
      throw new CliUsageError(`Source map file not found: ${absolutePath}`);
    }

    const result = await ctx.run(
      {
        command: 'sourcemap',
        subcommand: 'apply',
        path: absolutePath,
        to: opts.to,
      },
      opts
    );

    // `ambiguous` (needs disambiguation) and `error` are failures, so exit
    // non-zero and let scripts branch on them. `applied` / `unchanged` exit 0.
    if (
      typeof result !== 'string' &&
      (result.type === 'sourcemap-ambiguous' ||
        result.type === 'sourcemap-error')
    ) {
      ctx.setFailed();
    }
  });
}
