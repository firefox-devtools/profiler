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

describe('profiler-theme-change event', function () {
  it('is dispatched when the theme changes', function () {
    resetForTest();
    // Initialize in light mode.
    isDarkMode();

    const listener = jest.fn();
    window.addEventListener('profiler-theme-change', listener);

    // Switch to dark via a storage event.
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => 'dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('profiler-theme-change', listener);
  });

  it('is not dispatched during initialization', function () {
    resetForTest();

    const listener = jest.fn();
    window.addEventListener('profiler-theme-change', listener);

    isDarkMode(); // triggers setup

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('profiler-theme-change', listener);
  });

  it('is not dispatched when the theme stays the same', function () {
    resetForTest();
    isDarkMode(); // initialize as light

    const listener = jest.fn();
    window.addEventListener('profiler-theme-change', listener);

    // Storage event fires but the resolved theme is still light.
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme' }));

    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('profiler-theme-change', listener);
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
