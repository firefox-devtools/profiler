/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
//
import { TestEnvironment } from 'jest-environment-jsdom';
import { TextDecoder, TextEncoder } from 'util';

// This class registers various globals coming from node in test environments.
export default class CustomTestEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();

    // Register TextDecoder and TextEncoder with the global scope.
    // These are now available globally in nodejs, but not when running with jsdom
    // in jest apparently.
    // Still let's double check that they're from the global scope as expected, so
    // that this can be removed once it's implemented.
    if ('TextDecoder' in this.global) {
      throw new Error(
        'TextDecoder is already present in the global scope, please update custom-environment.js.'
      );
    }

    this.global.TextDecoder = TextDecoder;
    this.global.TextEncoder = TextEncoder;

    // Register Request and friends with the global scope.
    // These are now available globally in nodejs, but not when running with jsdom
    // in jest apparently.
    // Still let's double check that they're from the global scope as expected, so
    // that this can be removed once it's implemented.
    if ('Request' in this.global) {
      throw new Error(
        'Request is already present in the global scope, please update custom-environment.js.'
      );
    }

    this.global.fetch = fetch;
    this.global.Request = Request;
    this.global.Response = Response;
    this.global.ReadableStream = ReadableStream;
  }
}
