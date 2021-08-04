/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

// You can use this function if you want to run some code after paint occurred.
// By using this double-requestAnimationFrame we're sure we're running after at
// least one paint operation occurred. Be careful though, as this may delay your
// operation by 32ms.
export function yieldPaint(): Promise<void> {
  return new Promise(resolve =>
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve();
      });
    })
  );
}
