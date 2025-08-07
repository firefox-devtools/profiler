/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import { getSourceCodeCacheKey } from '../../utils/fetch-source';

describe('getSourceCodeCacheKey', function () {
  it('should return the file path when globalJSSourceId is null', function () {
    const file = 'test-file.js';
    const result = getSourceCodeCacheKey(file, null);
    expect(result).toBe('test-file.js');
  });

  it('should return a combined key when globalJSSourceId is provided', function () {
    const file = 'test-file.js';
    const globalJSSourceId = { pid: '123', sourceId: 42 };
    const result = getSourceCodeCacheKey(file, globalJSSourceId);
    expect(result).toBe('test-file.js-123-42');
  });

  it('should handle different pids and sourceIds correctly', function () {
    const file = 'script.js';

    const result1 = getSourceCodeCacheKey(file, { pid: '111', sourceId: 1 });
    const result2 = getSourceCodeCacheKey(file, { pid: '222', sourceId: 2 });

    expect(result1).toBe('script.js-111-1');
    expect(result2).toBe('script.js-222-2');
    expect(result1).not.toBe(result2);
  });

  it('should handle complex file paths', function () {
    const file = 'https://example.com/path/to/complex-file-name.min.js';
    const globalJSSourceId = { pid: '456', sourceId: 789 };
    const result = getSourceCodeCacheKey(file, globalJSSourceId);
    expect(result).toBe(
      'https://example.com/path/to/complex-file-name.min.js-456-789'
    );
  });
});
