/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare module 'util' {
  declare module.exports: {
    TextDecoder: Class<TextDecoder>,
    TextEncoder: Class<TextEncoder>,
    // See: https://github.com/facebook/flow/issues/8298
    // eslint-disable-next-line flowtype/no-weak-types
    promisify: (f: Function) => Function,
  };
}
