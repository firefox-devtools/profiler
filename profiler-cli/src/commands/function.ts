/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli function` command.
 */

import type { Command } from 'commander';
import { addGlobalOptions, runCommand } from './shared';

export function registerFunctionCommand(
  program: Command,
  sessionDir: string
): void {
  const fn = program.command('function').description('Function-level commands');

  addGlobalOptions(
    fn
      .command('expand [handle]')
      .description('Show full untruncated function name (e.g. f-123)')
      .option('--function <handle>', 'Function handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const funcHandle = handleArg ?? opts.function;
    await runCommand(
      sessionDir,
      { command: 'function', subcommand: 'expand', function: funcHandle },
      opts
    );
  });

  addGlobalOptions(
    fn
      .command('info [handle]')
      .description('Show detailed function information (e.g. f-123)')
      .option('--function <handle>', 'Function handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const funcHandle = handleArg ?? opts.function;
    await runCommand(
      sessionDir,
      { command: 'function', subcommand: 'info', function: funcHandle },
      opts
    );
  });

  addGlobalOptions(
    fn
      .command('annotate [handle]')
      .description(
        'Show annotated source/assembly with timing data (e.g. f-123)'
      )
      .option('--function <handle>', 'Function handle')
      .option(
        '--mode <mode>',
        'Annotation mode: src, asm, or all (default: src)',
        'src'
      )
      .option(
        '--symbol-server <url>',
        'Symbol server URL for asm mode. Defaults to the ?symbolServer= value from the loaded URL, or the Mozilla symbol server.'
      )
      .option(
        '--context <context>',
        'Source context: number of lines around annotated lines, or "file" for the whole file (default: 2)',
        '2'
      )
  ).action(async (handleArg: string | undefined, opts) => {
    const funcHandle = handleArg ?? opts.function;
    await runCommand(
      sessionDir,
      {
        command: 'function',
        subcommand: 'annotate',
        function: funcHandle,
        annotateMode: opts.mode,
        symbolServerUrl: opts.symbolServer,
        annotateContext: opts.context,
      },
      opts
    );
  });
}
