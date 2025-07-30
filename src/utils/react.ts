/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This file contains some functions that might be interesting when debugging
// react code.

// This function keeps track of the props of a React component and logs the
// changes between two calls. This is best used in render() or
// componentDidUpdate() like this:
// import { logPropChanges } from 'firefox-profiler/utils/react';
// ...
// render() {
//   logPropChanges(this);
// }
export function logPropChanges(component: any) {
  if (!component.__DEBUG__oldProps) {
    component.__DEBUG__oldProps = component.props;
    return;
  }

  for (const [prop, value] of Object.entries(component.props)) {
    const oldValue = component.__DEBUG__oldProps[prop];
    if (oldValue !== value) {
      console.log(
        `prop "${prop}" changed: old value is`,
        oldValue,
        ', new value is',
        value
      );
    }
  }

  component.__DEBUG__oldProps = component.props;
}