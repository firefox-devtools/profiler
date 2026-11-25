/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  parseEphemeralFilters,
  parseFilterSpec,
  parseFocusSelf,
} from '../../utils/parse';

describe('parseFocusSelf', function () {
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(function () {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    }) as unknown as jest.SpyInstance;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(function () {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('defaults to the combined implementation', function () {
    expect(parseFocusSelf('f-12')).toEqual({
      type: 'focus-self',
      funcIndex: 12,
      implementation: 'combined',
    });
  });

  it('accepts an implementation suffix', function () {
    expect(parseFocusSelf('f-12:js')).toEqual({
      type: 'focus-self',
      funcIndex: 12,
      implementation: 'js',
    });
    expect(parseFocusSelf('f-3:cpp')).toMatchObject({ implementation: 'cpp' });
  });

  it('rejects malformed values', function () {
    for (const value of ['12', 'f-12:java', 'f-1,f-2', 'f-12:']) {
      expect(() => parseFocusSelf(value)).toThrow(/process\.exit\(1\)/);
    }
  });

  it('is available as an ephemeral filter and in filter push', function () {
    expect(parseEphemeralFilters({ focusSelf: ['f-4:js'] })).toEqual([
      { type: 'focus-self', funcIndex: 4, implementation: 'js' },
    ]);
    expect(parseFilterSpec({ focusSelf: ['f-4'] })).toEqual({
      type: 'focus-self',
      funcIndex: 4,
      implementation: 'combined',
    });
  });
});
