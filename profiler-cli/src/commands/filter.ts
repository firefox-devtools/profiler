/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli filter` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { parseFilterSpec } from '../utils/parse';
import {
  addGlobalOptions,
  addSampleFilterOptions,
  parseIntArg,
  wasExplicit,
} from './shared';

export function registerFilterCommand(
  program: Command,
  sessionDir: string
): void {
  const filter = program
    .command('filter')
    .description('Manage sticky sample filters');

  addSampleFilterOptions(
    addGlobalOptions(
      filter
        .command('push')
        .description('Push a sticky sample filter')
        .option('--thread <handle>', 'Thread handle')
    )
  ).action(async (opts) => {
    const spec = parseFilterSpec({
      excludesFunction: opts.excludesFunction,
      merge: opts.merge,
      rootAt: opts.rootAt,
      includesFunction: opts.includesFunction,
      includesPrefix: opts.includesPrefix,
      includesSuffix: opts.includesSuffix,
      duringMarker: opts.duringMarker,
      outsideMarker: opts.outsideMarker,
      search: opts.search,
    });
    const result = await sendCommand(
      sessionDir,
      { command: 'filter', subcommand: 'push', thread: opts.thread, spec },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  addGlobalOptions(
    filter
      .command('pop [count]')
      .description('Pop the last N filters (default: 1)')
      .option('--count <n>', 'Number of filters to pop')
      .option('--thread <handle>', 'Thread handle')
  ).action(async (countArg: string | undefined, opts) => {
    const raw = countArg ?? opts.count ?? '1';
    const count = parseIntArg(
      'count',
      String(raw),
      1,
      'Error: count must be a positive integer'
    );
    const result = await sendCommand(
      sessionDir,
      { command: 'filter', subcommand: 'pop', thread: opts.thread, count },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  addGlobalOptions(
    filter
      .command('list', { isDefault: true })
      .description('List active filters for current thread')
      .option('--thread <handle>', 'Thread handle')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'filter', subcommand: 'list', thread: opts.thread },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));

    if (!wasExplicit('filter', 'list')) {
      console.log(
        '\nOther subcommands: profiler-cli filter <push|pop|clear> [options]'
      );
    }
  });

  addGlobalOptions(
    filter
      .command('clear')
      .description('Remove all filters for current thread')
      .option('--thread <handle>', 'Thread handle')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'filter', subcommand: 'clear', thread: opts.thread },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
