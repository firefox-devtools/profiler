/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli marker` command.
 */

import type { Command } from 'commander';
import { addGlobalOptions, runCommand } from './shared';
import { writeScreenshotFile } from '../utils/screenshot-file';
import { elideScreenshotData } from '../../../src/profile-query/screenshot';
import type { MarkerScreenshotJson, WithContext } from '../protocol';
import { sendCommand } from '../client';
import { formatOutput, formatJson } from '../output';

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
    await runCommand(
      sessionDir,
      { command: 'marker', subcommand: 'info', marker: markerHandle },
      opts
    );
  });

  addGlobalOptions(
    marker
      .command('screenshot [handle]')
      .description(
        "Extract one window's image from a CompositorScreenshot marker"
      )
      .option('--marker <handle>', 'Marker handle')
      .option(
        '-o, --output <path>',
        'File to write the image to, or a directory to write it into'
      )
  ).action(async (handleArg: string | undefined, opts) => {
    const markerHandle = handleArg ?? opts.marker;
    // Require an explicit destination rather than dropping a binary into
    // whatever the current working directory happens to be. `--json` does not
    // waive this: the image bytes are never inlined in the JSON either.
    if (opts.output === undefined) {
      console.error(
        'Error: -o/--output is required (a file path, or a directory to write into).'
      );
      process.exit(1);
    }
    const result = await sendCommand(
      sessionDir,
      { command: 'marker', subcommand: 'screenshot', marker: markerHandle },
      opts.session
    );

    if (typeof result === 'string' || result.type !== 'marker-screenshot') {
      // Unexpected shape: let the normal formatter report it.
      console.log(formatOutput(result, opts.json));
      return;
    }

    // `-o` applies whether or not `--json` was passed.
    const written = writeScreenshotFile(
      result.screenshot,
      opts.output,
      result.markerHandle
    );

    if (opts.json) {
      const payload: WithContext<MarkerScreenshotJson> = {
        ...result,
        screenshot: elideScreenshotData(result.screenshot),
        path: written.path,
        byteLength: written.byteLength,
      };
      console.log(formatJson(payload));
      return;
    }

    console.log(formatOutput(result, false));
    console.log(
      `\nWrote ${written.path} (${written.byteLength.toLocaleString('en-US')} bytes)`
    );
  });

  addGlobalOptions(
    marker
      .command('stack [handle]')
      .description('Show full stack trace for a marker (e.g. m-1234)')
      .option('--marker <handle>', 'Marker handle')
  ).action(async (handleArg: string | undefined, opts) => {
    const markerHandle = handleArg ?? opts.marker;
    await runCommand(
      sessionDir,
      { command: 'marker', subcommand: 'stack', marker: markerHandle },
      opts
    );
  });
}
