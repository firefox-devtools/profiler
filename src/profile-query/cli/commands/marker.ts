/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli marker` command.
 */

import type { Command } from 'commander';
import { expandMarkerHandleSpecs } from 'firefox-profiler/profile-query/marker-map';
import { CliUsageError } from 'firefox-profiler/profile-query/cli/parse';
import { addGlobalOptions, type CommandContext } from './shared';

export function registerMarkerCommand(
  program: Command,
  ctx: CommandContext
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

    const result = await ctx.run(
      { command: 'marker', subcommand: 'info', markers: specs },
      opts
    );
    if (
      typeof result !== 'string' &&
      result.type === 'marker-info-multi' &&
      (result.errors.length > 0 || result.rangeSpansThreadsWarning)
    ) {
      ctx.setFailed();
    }
  });

  addGlobalOptions(
    marker
      .command('stack [handle]')
      .description('Show full stack trace for a marker (e.g. m-1234)')
      .option('--marker <handle>', 'Marker handle')
  ).action(async (handleArg: string | undefined, opts) => {
    let markerHandle = handleArg ?? opts.marker;
    // Expanding with the real grammar keeps this from being a second, drifting
    // definition of it. A range reaching the daemon would come back as "Unknown
    // marker m-1..m-3", which reads like a bad handle rather than bad syntax.
    // The expansion is also what gets sent on, so spellings that normalise to
    // one handle (`m-2..m-2`, `m-2,`) work rather than failing as unknown.
    if (typeof markerHandle === 'string') {
      let expanded: string[];
      try {
        expanded = expandMarkerHandleSpecs([markerHandle]);
      } catch (error) {
        throw new CliUsageError(
          error instanceof Error ? error.message : String(error)
        );
      }
      if (expanded.length !== 1) {
        throw new CliUsageError(
          expanded.length === 0
            ? `marker stack requires a marker handle.`
            : `marker stack takes a single handle; ranges and lists are only supported by 'marker info'.`
        );
      }
      markerHandle = expanded[0];
    }
    await ctx.run(
      { command: 'marker', subcommand: 'stack', marker: markerHandle },
      opts
    );
  });
}
