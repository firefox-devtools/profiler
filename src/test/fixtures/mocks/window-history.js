/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { coerceMatchingShape } from '../../../utils/flow';

/**
 * jsdom leaves the history in place after every test, so the history will be dirty.
 * This mock creates a history API that can be thrown away after every use.
 */
export function mockWindowHistory() {
  const originalHistory = Object.getOwnPropertyDescriptor(window, 'history');

  let states = [null];
  let index = 0;
  const history = {
    get length() {
      return states.length;
    },
    scrollRestoration: 'auto',
    state: null,
    back() {
      if (index <= 0) {
        return;
      }
      index--;
      history.state = states[index];
      window.dispatchEvent(new Event('popstate'));
    },
    forward() {
      if (index === states.length - 1) {
        return;
      }
      index++;

      history.state = states[index];
      window.dispatchEvent(new Event('popstate'));
    },
    go() {
      throw new Error('Not implemented.');
    },
    pushState(newState: any, _title: string, _url?: string) {
      // The title and URL are ignored.
      states = states.slice(0, index + 1);
      states.push(newState);
      index++;
    },
    replaceState(newState: any, _title: string, _url?: string) {
      // The title and URL are ignored.
      states[index] = newState;
    },
  };

  Object.defineProperty(window, 'history', {
    value: coerceMatchingShape<History>(history),
    configurable: true,
  });

  // Return a function that resets the mock.
  return () => {
    // $FlowExpectError - Flow can't handle getOwnPropertyDescriptor being used on defineProperty.
    Object.defineProperty(window, 'history', originalHistory);
  };
}
