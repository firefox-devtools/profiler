/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

export function timeCode(label: string, codeAsACallback: any => any): any {
  if (typeof performance !== 'undefined' &&
      process.env.NODE_ENV === 'development') {
    const start = performance.now();
    const result = codeAsACallback();
    const elapsed = Math.round(performance.now() - start);
    console.log(`${label} took ${elapsed}ms to execute.`);
    return result;
  }
  return codeAsACallback();
}
