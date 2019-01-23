/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import { oneLine } from 'common-tags';

type SpyReference = {| +methodName: string, +prototype: Object |};
let _spies: SpyReference[] = [];

/**
 * We have run into issues with Jest's mocking of prototypes. The prototypes of jsdom
 * are shared between various test runs, which all run in parallel. This means that if
 * the mocks for prototypes aren't cleaned up properly, then it can cause intermittent
 * failures. This was happening in our test suite.
 *
 * This function caches the spies on the prototype object itself, and then checks before
 * adding a new one that any previous spies have been properly cleaned up.
 */
export function mockPrototype<Prototype: Object, MockImplementation: Function>(
  prototype: Prototype,
  methodName: string,
  mockImplementation: MockImplementation,
  getterSetter?: 'get' | 'set'
) {
  const spyKey = _getSpyKey(methodName);

  if (prototype[spyKey]) {
    const prototypeName = `${
      HTMLElement.prototype.constructor.name
    }.${methodName}`;
    throw new Error(
      oneLine`
        A spy existed already on ${prototypeName}. Either a test is mistakenly adding
        a mock multiple times to the prototype, or is an error in the parallel runner
        of jest.
      `
    );
  }

  const spy = getterSetter
    ? jest
        .spyOn(prototype, methodName, 'get')
        .mockImplementation(mockImplementation)
    : jest.spyOn(prototype, methodName).mockImplementation(mockImplementation);

  prototype[spyKey] = spy;
  _spies.push({ methodName, prototype });
}

/**
 * Go through the spy references, and clean them all up. This needs to be run after each
 * test using the afterEach mechanism in src/test/setup.js file.
 */
export function cleanupPrototypeSpies() {
  for (const { methodName, prototype } of _spies) {
    const spyKey = _getSpyKey(methodName);
    prototype[spyKey].mockRestore();
    delete prototype[spyKey];
  }
  _spies = [];
}

function _getSpyKey(methodName: string) {
  return `__perfHtmlSpy_${methodName}`;
}
