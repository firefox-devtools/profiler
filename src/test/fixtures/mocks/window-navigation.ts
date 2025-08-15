/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @ts-nocheck Complex window/history mock with extensive DOM API manipulation that requires intricate typing

/**
 * jsdom leaves the history in place after every test, so the history will
 * be dirty. Also its implementation for window.location is lacking severely.
 * So this file implements mocks for both window.history and
 * window.location. They work together so that history methods update the
 * location, and changing the location pushes a new state in the history.
 *
 * There are 2 exports:
 * - autoMockFullNavigation
 * - mockFullNavigation
 *
 * `autoMockFullNavigation` is the simplest: calling it in a test file (outside
 * any test) will register beforeEach and afterEach lifecycle functions to take
 * care of the cleanup automatically.`
 *
 * describe('SomeFile', () => {
 *   autoMockFullNavigation()
 *
 *   test('it supports history', () => {
 *     ...
 *   });
 * });
 *
 * If you want to start with a specific URL, you can use
 * `window.location.replace` or `window.history.replaceState` to replace the
 * default URL.`
 *
 * `mockFullNavigation` can be useful if you want more control over the process.
 * It takes the initial URL as a parameter and returns a cleanup function that
 * you _must_ call after your test ends.
 */

import { coerceMatchingShape } from '../../../utils/types';

// This symbol will be used in the mock for window.location so that the mock for
// window.history can change the inner location directly.
const internalLocationAssign = Symbol.for('internalLocationAssign');

// This symbol will be used in the mock for window.history so that we can reset
// it from tests.
const internalHistoryReset = Symbol.for('internalHistoryReset');

/**
 * This mock creates a location API that allows for assigning to the location,
 * which we need to be able to do for certain tests.
 */
function mockWindowLocation(location: string = 'http://localhost') {
  // This is the internal state.
  let url = new URL(location);

  function internalSetLocation(
    newUrl: string | { toString: () => string }
  ): void {
    url = new URL(newUrl.toString(), url);
  }

  const nativeLocation = Object.getOwnPropertyDescriptor(window, 'location');

  // It seems node v8 doesn't let us change the value unless we delete it before.
  delete window.location;

  const property = {
    get(): Partial<Location> {
      return {
        toString: () => url.toString(),
        ancestorOrigins: [],
        get href() {
          return url.toString();
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
        set href(newUrl) {
          this.assign(newUrl.toString());
        },
        set protocol(v) {
          const newUrl = new URL(url.toString());
          newUrl.protocol = v;
          this.assign(newUrl.toString());
        },
        set host(v) {
          const newUrl = new URL(url.toString());
          newUrl.host = v;
          this.assign(newUrl.toString());
        },
        set hostname(v) {
          const newUrl = new URL(url.toString());
          newUrl.hostname = v;
          this.assign(newUrl.toString());
        },
        set port(v) {
          const newUrl = new URL(url.toString());
          newUrl.port = v;
          this.assign(newUrl.toString());
        },
        set pathname(v) {
          const newUrl = new URL(url.toString());
          newUrl.pathname = v;
          this.assign(newUrl.toString());
        },
        set search(v) {
          const newUrl = new URL(url.toString());
          newUrl.search = v;
          this.assign(newUrl.toString());
        },
        set hash(v) {
          const newUrl = new URL(url.toString());
          newUrl.hash = v;
          this.assign(newUrl.toString());
        },
        // $FlowExpectError Flow doesn't know about symbol properties sadly.
        [internalLocationAssign]: internalSetLocation,
        assign: (newUrl: string) => window.history.pushState(null, '', newUrl),
        reload: jest.fn(),
        replace: (newUrl: string) =>
          window.history.replaceState(null, '', newUrl),
      };
    },
    configurable: true,
    set(newUrl: string) {
      window.history.pushState(null, '', newUrl);
    },
  };

  // $FlowExpectError because the value we pass isn't a proper Location object.
  Object.defineProperty(window, 'location', property);

  // Return a function that resets the mock.
  return () => {
    // This "delete" call doesn't seem to be necessary, but better do it so that
    // we don't have surprises in the future.
    delete window.location;
    // $FlowExpectError because nativeLocation doesn't match the type expected by Flow.
    Object.defineProperty(window, 'location', nativeLocation);
  };
}

/**
 * This mock creates a history API that can be thrown away after every use.
 */
function mockWindowHistory() {
  const originalHistory = Object.getOwnPropertyDescriptor(window, 'history');

  let states, urls, index;

  function reset() {
    states = [null];
    urls = [window.location.href];
    index = 0;
  }

  reset();

  const history = {
    get length() {
      return states.length;
    },
    scrollRestoration: 'auto',
    get state() {
      return states[index] ?? null;
    },
    back() {
      if (index <= 0) {
        return;
      }
      index--;
      // $FlowExpectError Flow doesn't know about this internal property.
      window.location[internalLocationAssign](urls[index]);
      window.dispatchEvent(new Event('popstate'));
    },
    forward() {
      if (index === states.length - 1) {
        return;
      }
      index++;

      // $FlowExpectError Flow doesn't know about this internal property.
      window.location[internalLocationAssign](urls[index]);
      window.dispatchEvent(new Event('popstate'));
    },
    go() {
      throw new Error('Not implemented.');
    },
    pushState(newState: any, _title: string, url?: string) {
      if (url) {
        // Let's assign the URL to the window.location mock. This should also
        // make the URL correct if it's relative, we'll get an absolute URL when
        // retrieving later through window.location.href.
        // $FlowExpectError Flow doesn't know about this internal property.
        window.location[internalLocationAssign](url);
      }

      urls = urls.slice(0, index + 1);
      urls.push(window.location.href);

      states = states.slice(0, index + 1);
      states.push(newState);
      index++;
    },
    replaceState(newState: any, _title: string, url?: string) {
      if (url) {
        // Let's assign the URL to the window.location mock.
        // $FlowExpectError Flow doesn't know about this internal property.
        window.location[internalLocationAssign](url);
        urls[index] = window.location.href;
      }

      states[index] = newState;
    },
    // $FlowExpectError Flow doesn't know about symbol properties sadly.
    [internalHistoryReset]: reset,
  };

  // This "delete" call doesn't seem to be necessary, but better do it so that
  // we don't have surprises in the future.
  delete window.history;
  Object.defineProperty(window, 'history', {
    value: coerceMatchingShape<History>(history),
    configurable: true,
  });

  // Return a function that resets the mock.
  return () => {
    // For unknown reasons, we can't assign back the old descriptor without
    // deleting the current one first... Not deleting would keep the mock
    // without throwing any error.
    delete window.history;
    // $FlowExpectError - Flow can't handle getOwnPropertyDescriptor being used on defineProperty.
    Object.defineProperty(window, 'history', originalHistory);
  };
}

// This mocks both window.location and window.history. See the top of the file
// for more information.
export function mockFullNavigation({
  initialUrl,
}: Partial<{ initialUrl: string }> = {}): () => void {
  const restoreLocation = mockWindowLocation(initialUrl);
  const restoreHistory = mockWindowHistory();

  return () => {
    restoreLocation();
    restoreHistory();
  };
}

// This registers lifecycle functions to mock both window.location and
// window.history for each test. Take a look at the top of this file for more
// information about how to use this.
export function autoMockFullNavigation() {
  let cleanup;
  beforeEach(() => {
    cleanup = mockFullNavigation();
  });

  afterEach(() => {
    if (cleanup) {
      cleanup();
      cleanup = null;
    }
  });
}

export function resetHistoryWithUrl(url: string = window.location.href) {
  // $FlowExpectError Flow doesn't know about this internal property.
  window.location[internalLocationAssign](url);
  // $FlowExpectError Flow doesn't know about this internal property.
  window.history[internalHistoryReset]();
}
