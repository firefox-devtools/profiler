/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { initTheme, isDarkMode, resetForTest } from '../../utils/dark-mode';

describe('isDarkMode', function () {
  it('does not throw on access failure', function () {
    resetForTest();

    const getItem = jest.fn(() => {
      throw new Error('dummy error');
    });
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(getItem);

    // When localStorage throws, it should default to system preference
    expect(isDarkMode()).toBe(false);

    expect(getItem).toHaveBeenCalledWith('theme');
  });

  it('listens to storage event', function () {
    resetForTest();

    expect(isDarkMode()).toBe(false);

    // The value is cached.
    const getItem = jest.fn(() => 'dark');
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(getItem);
    expect(isDarkMode()).toBe(false);

    // Different key should be ignored.
    window.dispatchEvent(new StorageEvent('storage', { key: 'something' }));
    expect(isDarkMode()).toBe(false);

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
    expect(isDarkMode()).toBe(true);

    // The value is cached.
    const getItem2 = jest.fn(() => null);
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(getItem2);
    expect(isDarkMode()).toBe(true);

    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));
    expect(isDarkMode()).toBe(false);
  });
});

describe('initTheme', function () {
  it('sets the document element class', function () {
    resetForTest();

    const getItem = jest.fn();
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(getItem);

    initTheme();

    expect(getItem).toHaveBeenCalledWith('theme');
    expect(document.documentElement.className).toBe('');

    resetForTest();

    const getItem2 = jest.fn(() => 'dark');
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(getItem2);

    initTheme();

    expect(getItem).toHaveBeenCalledWith('theme');
    expect(document.documentElement.className).toBe('dark-mode');
  });
});
