/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Browser stand-in for Node modules that commander only touches when it spawns
 * executable subcommands (`node:fs`, `node:path`, `node:child_process`).
 * Any access throws.
 */

export default new Proxy(
  {},
  {
    get(_target, name) {
      return () => {
        throw new Error(`${String(name)} is not available in the browser`);
      };
    },
  }
);
