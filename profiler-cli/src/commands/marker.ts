/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli marker` command.
 */

import type { Command } from 'commander';
import { expandMarkerHandleSpecs } from '../../../src/profile-query/marker-map';
import { addGlobalOptions, runCommand } from './shared';

export function registerMarkerCommand(
  program: Command,
  sessionDir: string
): void {
  const marker = program.command('marker').description('Marker-level commands');

  addGlobalOptions(
    marker
      .command('info [handles...]')
      .description(
        'Show detailed marker information for one or more markers ' +
          '(e.g. m-1234, m-1234 m-1240, m-1234..m-1240)'
      )
      .option(
        '--marker <handle,...>',
        'Marker handle(s) or range(s); a range covers at most 256 handles'
      )
  ).action(async (handleArgs: string[], opts) => {
    const specs = (handleArgs.length > 0 ? handleArgs : [opts.marker]).filter(
      (spec): spec is string => spec !== undefined
    );

    // Route on the expanded handles, not the raw text, so that every spelling
    // of one marker ("m-1,", "m-1..m-1") keeps the old single-marker `--json`
    // shape. Malformed specs are left for the daemon to report.
    let expanded: string[] | undefined;
    try {
      expanded = expandMarkerHandleSpecs(specs);
    } catch {
      expanded = undefined;
    }
    if (expanded && expanded.length === 1) {
      await runCommand(
        sessionDir,
        { command: 'marker', subcommand: 'info', marker: expanded[0] },
        opts
      );
      return;
    }

    const result = await runCommand(
      sessionDir,
      { command: 'marker', subcommand: 'info', markers: specs },
      opts
    );
    if (
      typeof result !== 'string' &&
      result.type === 'marker-info-multi' &&
      (result.errors.length > 0 || result.rangeSpansThreadsWarning)
    ) {
      process.exitCode = 1;
    }
  });

  addGlobalOptions(
    marker
      .command('stack [handle]')
      .description('Show full stack trace for a marker (e.g. m-1234)')
      .option('--marker <handle>', 'Marker handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const markerHandle = handleArg ?? opts.marker;
    // Without this, a range reaches the daemon and comes back as "Unknown
    // marker m-1..m-3", which reads like a bad handle, not bad syntax.
    if (typeof markerHandle === 'string' && /\.\.|,/.test(markerHandle)) {
      console.error(
        `Error: marker stack takes a single handle; ranges and lists are only supported by 'marker info'.`
      );
      process.exit(1);
    }
    await runCommand(
      sessionDir,
      { command: 'marker', subcommand: 'stack', marker: markerHandle },
      opts
    );
  });
}
