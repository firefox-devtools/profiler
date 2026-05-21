/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli marker` command.
 */

import type { Command } from 'commander';
import { sendCommand } from '../client';
import { formatOutput } from '../output';
import { addGlobalOptions } from './shared';

export function registerMarkerCommand(
  program: Command,
  sessionDir: string
): void {
  const marker = program.command('marker').description('Marker-level commands');

  addGlobalOptions(
    marker
      .command('info [handle]')
      .description('Show detailed marker information (e.g. m-1234)')
      .option('--marker <handle>', 'Marker handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const markerHandle = handleArg ?? opts.marker;
    const result = await sendCommand(
      sessionDir,
      { command: 'marker', subcommand: 'info', marker: markerHandle },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });

  addGlobalOptions(
    marker
      .command('stack [handle]')
      .description('Show full stack trace for a marker (e.g. m-1234)')
      .option('--marker <handle>', 'Marker handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const markerHandle = handleArg ?? opts.marker;
    const result = await sendCommand(
      sessionDir,
      { command: 'marker', subcommand: 'stack', marker: markerHandle },
      opts.session
    );
    console.log(formatOutput(result, opts.json ?? false));
  });
}
