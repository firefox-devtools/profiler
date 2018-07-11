/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
export function createImageMock() {
  function ImageMock() {
    instances.push(this);
  }
  const instances: Image[] = [];
  return { instances, Image: ImageMock };
}
