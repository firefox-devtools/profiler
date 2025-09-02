/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// This file tests the mock for date objects, because it's untrivial.
import { mockDate, restoreDate } from './date';

// Using this small wait will ensure that some time passes, which makes our
// tests always green.
//
function wait() {
  return new Promise((resolve) => setTimeout(resolve, 50));
}

describe('Date mock', function () {
  it('can mock a date with a string', async () => {
    const earlierNow = new Date();
    const someDateString = '2019-07-04';
    const someDate = new Date(someDateString);

    // Now mock the Date object.
    const restore = mockDate(someDateString);
    const mockedDateResult = new Date();
    expect(mockedDateResult).toEqual(someDate);
    expect(mockedDateResult).not.toEqual(earlierNow);
    expect(Date.now()).toEqual(+someDate);

    // After restore this works as before.
    restore();

    await wait(); // To avoid intermittent failures.
    const laterNow = new Date();
    expect(laterNow).not.toEqual(earlierNow);
    expect(laterNow).not.toEqual(someDate);
    expect(Date.now()).not.toEqual(+earlierNow);
    expect(Date.now()).not.toEqual(+someDate);
  });

  it('can mock a date with a timestamp', async () => {
    const earlierNow = new Date();
    const someDateString = '2019-07-04';
    const someDate = new Date(someDateString);
    const someDateTimestamp = +someDate;

    // Now mock the Date object.
    mockDate(someDateTimestamp);
    const mockedDateResult = new Date();
    expect(mockedDateResult).toEqual(someDate);
    expect(mockedDateResult).not.toEqual(earlierNow);
    expect(Date.now()).toEqual(+someDate);

    // After restore this works as before.
    // We use another method to restore in this test.
    restoreDate();

    await wait(); // To avoid intermittent failures.
    const laterNow = new Date();
    expect(laterNow).not.toEqual(earlierNow);
    expect(laterNow).not.toEqual(someDate);
    expect(Date.now()).not.toEqual(+earlierNow);
    expect(Date.now()).not.toEqual(+someDate);
  });

  it('returns other date values when specified', () => {
    const bastilleDayString = '1789-07-14';
    const bastilleDay = new Date(bastilleDayString);

    const someDateString = '2019-07-04';

    // Now mock the Date object.
    mockDate(someDateString);

    // and pass some arguments to the constructor.
    expect(new Date(bastilleDayString)).toEqual(bastilleDay);
    expect(new Date(Date.UTC(1789, 6, 14))).toEqual(bastilleDay);
  });

  it('supports intanceof Date', () => {
    mockDate('2019-07-04');
    expect(new Date() instanceof Date).toBe(true);
    expect(new Date('2015-01-09') instanceof Date).toBe(true);
  });

  describe('automatic mock restore', () => {
    // eslint-disable-next-line jest/expect-expect
    it('initializes mocks', () => {
      mockDate('2020-01-01');
    });

    it('will be restored after tests automatically', () => {
      const now = new Date();
      const someDateString = '2019-07-04';
      const someDate = new Date(someDateString);
      expect(now).not.toEqual(someDate);
    });
  });
});
