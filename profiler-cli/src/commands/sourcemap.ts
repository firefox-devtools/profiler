/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli sourcemap` command.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Command } from 'commander';
import { addGlobalOptions, runCommand } from './shared';
import { sendCommand } from '../client';
import { formatOutput } from '../output';

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
    const absolutePath = path.resolve(mapPath);
    if (!fs.existsSync(absolutePath)) {
      console.error(`Error: Source map file not found: ${absolutePath}`);
      process.exitCode = 1;
      return;
    }

    const result = await sendCommand(
      sessionDir,
      {
        command: 'sourcemap',
        subcommand: 'apply',
        path: absolutePath,
        to: opts.to,
      },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));

    // `ambiguous` (needs disambiguation) and `error` are failures, so exit
    // non-zero and let scripts branch on them. `applied` / `unchanged` exit 0.
    if (
      typeof result !== 'string' &&
      (result.type === 'sourcemap-ambiguous' ||
        result.type === 'sourcemap-error')
    ) {
      process.exitCode = 1;
    }
  });
}
