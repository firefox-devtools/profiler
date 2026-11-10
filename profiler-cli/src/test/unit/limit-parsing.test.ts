/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for `--limit`-style argument parsing.
 *
 * These pin the sentinel contract itself, which is easy to get subtly wrong
 * because two conventions are in play. The end-to-end consequences are covered
 * in basic.test.ts against src/test/fixtures/limit-boundaries.json:
 *
 *   - markers / functions / logs treat `undefined` as "no limit";
 *   - network / page-load have a non-zero *default*, so for them "no limit"
 *     has to travel as `0` (an unset value means "apply the default").
 */

import { parseLimitArg } from '../../utils/parse';

describe('parseLimitArg', function () {
  let exitSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(function () {
    // `process.exit` is typed as returning `never`; throwing keeps the control
    // flow honest so a non-exiting parser cannot silently pass these tests.
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    }) as unknown as jest.SpyInstance;
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(function () {
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('maps 0 to "no limit" rather than to a zero-length window', function () {
    // The whole point of item B: 0 must not survive as the number 0, which
    // every `slice(0, limit)` downstream would read as "show nothing".
    expect(parseLimitArg('--limit', '0')).toBeUndefined();
  });

  it('leaves an omitted value alone so defaults still apply', function () {
    expect(parseLimitArg('--limit', undefined)).toBeUndefined();
  });

  it('passes positive limits through unchanged', function () {
    expect(parseLimitArg('--limit', '1')).toBe(1);
    expect(parseLimitArg('--limit', '20')).toBe(20);
    expect(parseLimitArg('--limit', '5000')).toBe(5000);
  });

  it('rejects negative and non-numeric values, naming the 0 case', function () {
    for (const value of ['-1', '-100', 'abc', '']) {
      expect(() => parseLimitArg('--limit', value)).toThrow(
        /process\.exit\(1\)/
      );
    }
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: --limit must be a non-negative integer (0 = no limit)'
    );
  });

  it('names the flag it was given in the error message', function () {
    expect(() => parseLimitArg('--jank-limit', '-1')).toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      'Error: --jank-limit must be a non-negative integer (0 = no limit)'
    );
  });

  describe('the `?? 0` sentinel used by flags with a non-zero default', function () {
    // `thread network --limit` and `thread page-load --jank-limit` keep their
    // default in the CLI, so an explicit 0 has to be forwarded as something
    // other than "unset". Only `jankLimit` is actually load-bearing:
    // `collectPageLoad` does `jankLimit ?? 10`, so dropping its `?? 0` silently
    // reinstates the default of 10. `collectThreadNetwork` reads 0 and
    // `undefined` identically, so its `?? 0` is defensive. The end-to-end
    // consequence of the load-bearing one is asserted in basic.test.ts.
    it('turns an explicit 0 back into the 0 those queries expect', function () {
      expect(parseLimitArg('--limit', '0') ?? 0).toBe(0);
      expect(parseLimitArg('--jank-limit', '0') ?? 0).toBe(0);
    });

    it('does not disturb an explicit positive limit', function () {
      expect(parseLimitArg('--limit', '5') ?? 0).toBe(5);
      expect(parseLimitArg('--jank-limit', '3') ?? 0).toBe(3);
    });
  });
});
