/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Jest transform that mirrors esbuild's "text" loader: a .txt file's default
// export is its contents.
module.exports = {
  process(sourceText) {
    return {
      code: `module.exports = { __esModule: true, default: ${JSON.stringify(sourceText)} };`,
    };
  },
};
