/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/*
 * --- TL;DR ---
 *
 * it('should return a fixed date', () => {
 *   mockDate('2020-08-17');
 *   expect(new Date()).toEqual(new Date('2020-08-17'));
 *   expect(Date.now()).toEqual(+new Date('2020-08-17'));
 * });
 *
 * -------------
 *
 * This function makes it possible to mock the Date object to return a specific
 * date when it's not specified.
 *
 * It returns a function that will restore the mock, but it's also possible to
 * call directly `restoreDate`.
 * Also note that this will be restored automatically after a test, so there's
 * no need to restore it manually except in specific cases.
 */

export function mockDate(dateOrTimestamp: string | number): () => void {
  const originalDate = global.Date;

  // This spy returns real Date objects.
  // When called without args it will return a Date object at the fixed
  // specified time. Otherwise it will just defer the call to the real Date
  // object.
  jest.spyOn(global, 'Date').mockImplementation(function (...args) {
    if (!args.length) {
      return new originalDate(dateOrTimestamp);
    }
    return new originalDate(...args);
  });

  // Now the global.Date object is the spy function, so we need to implement all
  // static methods too.

  // We need to define the hasInstance well-known symbol, because global.Date is
  // a function (a jest mock) otherwise. By defining this property, we support
  // the `instanceof` operator that some of our code uses (especially
  // fake-indexeddb).
  Object.defineProperty(global.Date, Symbol.hasInstance, {
    value: function (val: any) {
      return val instanceof originalDate;
    },
  });

  // Date.now is also mocked to return the specified fixed date.
  global.Date.now = jest
    .fn()
    .mockImplementation(() => new originalDate(dateOrTimestamp).valueOf());
  // Other static methods just defer to the real implementation.
  global.Date.UTC = originalDate.UTC;
  global.Date.parse = originalDate.parse;

  return restoreDate;
}

// This restores the real Date object. This is automatically called after a test.
export function restoreDate() {
  if (typeof (Date as any).mockRestore === 'function') {
    (Date as any).mockRestore();
  }
}
