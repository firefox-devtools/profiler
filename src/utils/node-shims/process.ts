/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Minimal browser stand-in for `node:process`, covering what commander reads
 * when it is parsing with `{ from: 'user' }`, `exitOverride()` and
 * `configureOutput()`.
 */

function unavailable(name: string): never {
  throw new Error(`process.${name} is not available in the browser`);
}

const stream = {
  isTTY: false,
  columns: undefined,
  write: () => unavailable('stdout.write'),
};

export default {
  argv: [] as string[],
  execArgv: [] as string[],
  env: {} as Record<string, string | undefined>,
  platform: 'browser',
  versions: {} as Record<string, string>,
  stdout: stream,
  stderr: stream,
  exit: (): never => unavailable('exit'),
  on: () => {},
};
