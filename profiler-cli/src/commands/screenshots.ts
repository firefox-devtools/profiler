/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * `profiler-cli screenshots` command.
 */

import type { Command } from 'commander';
import { addGlobalOptions } from './shared';
import { sendCommand } from '../client';
import { formatOutput, formatJson } from '../output';
import { writeScreenshots } from '../utils/screenshot-file';
import { elideScreenshotData } from '../../../src/profile-query/screenshot';
import type { ScreenshotsJson, WithContext } from '../protocol';

export function registerScreenshotsCommand(
  program: Command,
  sessionDir: string
): void {
  addGlobalOptions(
    program
      .command('screenshots')
      .description(
        'Write one CompositorScreenshot image per window, at a time or over a range'
      )
      .option(
        '--at <time>',
        'Instant, e.g. 11.287, 11287ms, 10% or a ts- handle'
      )
      .option('--range <start,end>', 'Range to look up, e.g. 11.2,11.4')
      .option('-o, --output <dir>', 'Directory to write the images into')
  ).action(async (opts) => {
    const result = await sendCommand(
      sessionDir,
      { command: 'screenshots', at: opts.at, range: opts.range },
      opts.session
    );

    if (typeof result === 'string' || result.type !== 'screenshots') {
      // Unexpected shape: let the normal formatter report it.
      console.log(formatOutput(result, opts.json));
      return;
    }

    // `-o` applies whether or not `--json` was passed: a flag that is accepted
    // and silently ignored is worse than one that errors.
    const written = writeScreenshots(result, opts.output);

    if (opts.json) {
      // Never inline the image bytes. With `-o` they are on disk and `path`
      // points at them; without it, `marker screenshot <handle> -o` fetches any
      // single frame.
      const payload: WithContext<ScreenshotsJson> = {
        ...result,
        screenshots: result.screenshots.map((entry, index) => ({
          ...entry,
          screenshot: elideScreenshotData(entry.screenshot),
          path: written[index]?.path,
          byteLength: written[index]?.byteLength,
        })),
        written: written.map((file) => file.path),
      };
      console.log(formatJson(payload));
      return;
    }

    console.log(formatOutput(result, false));

    if (written.length === 0) {
      return;
    }
    console.log(`\nWrote ${written.length} image(s):`);
    console.log(
      written
        .map(
          (file) =>
            `  ${file.path} (${file.byteLength.toLocaleString('en-US')} bytes)`
        )
        .join('\n')
    );
  });
}
