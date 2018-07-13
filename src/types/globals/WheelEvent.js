/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

declare class WheelEvent extends MouseEvent {
  deltaX: number; // readonly
  deltaY: number; // readonly
  deltaZ: number; // readonly
  deltaMode: 0x00 | 0x01 | 0x02; // readonly
  DOM_DELTA_PIXEL: 0x00; // readonly
  DOM_DELTA_PAGE: 0x01; // readonly
  DOM_DELTA_LINE: 0x02; // readonly
}
