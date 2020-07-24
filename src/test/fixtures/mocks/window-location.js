/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/**
 * jsdom doesn't really know about this API.
 */
export function mockWindowLocation(location: string = 'http://localhost') {
  // This is the internal state.
  let url = new URL(location);
  function setLocation(newUrl: string | { toString: () => string }): void {
    location = newUrl.toString();
    url = new URL(location);
  }

  const nativeLocation = Object.getOwnPropertyDescriptor(window, 'location');

  // It seems node v8 doesn't let us change the value unless we delete it before.
  delete window.location;
  // $FlowExpectError because the value we pass isn't a proper Location object.
  Object.defineProperty(window, 'location', {
    get() {
      return {
        ancestorOrigins: [],
        href: location,
        origin: url.origin,
        protocol: url.protocol,
        host: url.host,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        assign: setLocation,
        reload: jest.fn(),
        replace: jest.fn(setLocation),
        toString: () => location,
      };
    },
    configurable: true,
    set: setLocation,
  });

  // Return a function that resets the mock.
  return () => {
    // $FlowExpectError because nativeLocation doesn't match the type expected by Flow.
    Object.defineProperty(window, 'location', nativeLocation);
  };
}
