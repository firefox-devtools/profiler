/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let _isReducedMotionSetup = false;
let _isReducedMotion = false;

export function isReducedMotion() {
  if (!_isReducedMotionSetup) {
    if (window.matchMedia) {
      const result = window.matchMedia(
        '(prefers-reduced-motion: no-preference)'
      );
      _isReducedMotion = !result.matches;
      result.onchange = (event) => {
        _isReducedMotion = !event.matches;
      };
    }
    _isReducedMotionSetup = true;
  }

  return _isReducedMotion;
}

export function resetIsReducedMotionSetupForTest() {
  _isReducedMotionSetup = false;
}
