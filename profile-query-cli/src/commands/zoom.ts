/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli zoom` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { addGlobalOptions } from './shared';

export function registerZoomCommand(
  program: Command,
  sessionDir: string
): void {
  const zoom = program.command('zoom').description('Manage zoom ranges');

  addGlobalOptions(
    zoom
      .command('push <range>')
      .description(
        'Push a zoom range (e.g. 2.7,3.1 in seconds, 2700ms,3100ms in milliseconds, 10%,20% as percentage, or m-158 for a marker)'
      )
  ).action(async (range: string, opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'zoom', subcommand: 'push', range },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  addGlobalOptions(
    zoom.command('pop').description('Pop the most recent zoom range')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'zoom', subcommand: 'pop' },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  addGlobalOptions(
    zoom
      .command('clear')
      .description('Clear all zoom ranges (return to full profile)')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'zoom', subcommand: 'clear' },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
