/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Writing extracted screenshot images to disk.
 *
 * Kept free of any daemon/client imports so it can be unit-tested without the
 * build-time constants those modules need.
 */

import * as fs from 'fs';
import * as path from 'path';
import { screenshotFileExtension } from '../../../src/profile-query/screenshot';
import type {
  ScreenshotData,
  ScreenshotsResult,
} from '../../../src/profile-query/types';

/**
 * Decode a screenshot's base64 data URL and write it to `outputPath`.
 *
 * When `outputPath` names an existing directory, or ends with a path separator,
 * the file is written inside it using a name derived from the marker handle.
 * Parent directories are created as needed. Returns the resolved path and the
 * number of bytes written.
 */
export function writeScreenshotFile(
  screenshot: ScreenshotData,
  outputPath: string | undefined,
  markerHandle: string
): { path: string; byteLength: number } {
  if (!screenshot.base64) {
    throw new Error(
      `Screenshot for ${markerHandle} is not a base64 data URL, so it cannot be written to a file.`
    );
  }

  const extension = screenshotFileExtension(screenshot);
  const defaultName = `screenshot-${markerHandle}.${extension}`;

  let resolved: string;
  if (outputPath === undefined) {
    resolved = path.resolve(defaultName);
  } else {
    const isDirectory =
      outputPath.endsWith(path.sep) ||
      outputPath.endsWith('/') ||
      (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory());
    resolved = isDirectory
      ? path.resolve(outputPath, defaultName)
      : path.resolve(outputPath);
  }

  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const buffer = Buffer.from(screenshot.base64, 'base64');
  fs.writeFileSync(resolved, buffer);
  return { path: resolved, byteLength: buffer.byteLength };
}

/**
 * Write every screenshot of a `screenshots` result into the `-o` directory, in
 * result order so callers can zip the returned files back onto the entries.
 * Returns an empty array when no `-o` was given.
 *
 * This runs for `--json` too: `-o` is honoured whichever output mode is in use,
 * since a flag that is accepted and silently ignored is worse than one that
 * errors.
 */
export function writeScreenshots(
  result: ScreenshotsResult,
  outputDir: string | undefined
): Array<{ path: string; byteLength: number }> {
  if (outputDir === undefined || result.screenshots.length === 0) {
    return [];
  }
  // Always treat -o as a directory for this command, which emits one image per
  // window.
  const directory = outputDir.endsWith(path.sep)
    ? outputDir
    : outputDir + path.sep;
  return result.screenshots.map((entry) =>
    writeScreenshotFile(entry.screenshot, directory, entry.markerHandle)
  );
}
