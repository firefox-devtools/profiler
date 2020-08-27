/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
//
import { coerceMatchingShape } from '../../../utils/flow';

/**
 * jsdom's implementation of this API doesn't allow for assigning to the location, which
 * we need to be able to do for certain tests.
 */
export function mockWindowLocation(location: string = 'http://localhost') {
  // This is the internal state.
  let url = new URL(location);
  function setLocation(newUrl: string | { toString: () => string }): void {
    location = newUrl.toString();
    url = new URL(location);
  }

  const nativeLocation = Object.getOwnPropertyDescriptor(window, 'location');
  function accessError() {
    throw new Error(
      'Setting properties for the window.location object is not supported with this mock.'
    );
  }

  // It seems node v8 doesn't let us change the value unless we delete it before.
  delete window.location;

  const property = {
    get(): $Shape<Location> {
      return {
        ancestorOrigins: [],
        get href() {
          return location;
        },
        get origin() {
          return url.origin;
        },
        get protocol() {
          return url.protocol;
        },
        get host() {
          return url.host;
        },
        get hostname() {
          return url.hostname;
        },
        get port() {
          return url.port;
        },
        get pathname() {
          return url.pathname;
        },
        get search() {
          return url.search;
        },
        get hash() {
          return url.hash;
        },
        set href(v) {
          accessError();
        },
        set origin(v) {
          accessError();
        },
        set protocol(v) {
          accessError();
        },
        set host(v) {
          accessError();
        },
        set hostname(v) {
          accessError();
        },
        set port(v) {
          accessError();
        },
        set pathname(v) {
          accessError();
        },
        set search(v) {
          accessError();
        },
        set hash(v) {
          accessError();
        },
        assign: setLocation,
        reload: jest.fn(),
        replace: jest.fn(setLocation),
        toString: () => location,
      };
    },
    configurable: true,
    set: setLocation,
  };

  // $FlowExpectError because the value we pass isn't a proper Location object.
  Object.defineProperty(window, 'location', property);

  // Return a function that resets the mock.
  return () => {
    // $FlowExpectError because nativeLocation doesn't match the type expected by Flow.
    Object.defineProperty(window, 'location', nativeLocation);
  };
}

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
