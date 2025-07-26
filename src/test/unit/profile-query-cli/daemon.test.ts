/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Unit tests for profile-query-cli daemon.
 *
 * NOTE: This file intentionally contains no tests.
 *
 * The daemon.ts module handles cross-process communication via Unix sockets,
 * spawns background processes, and manages long-lived server state. This is
 * too complex to manage reliably in Jest unit tests.
 *
 * Instead, daemon functionality is tested through integration tests in bash
 * scripts:
 * - bin/pq-test: Basic daemon lifecycle (start, connect, stop)
 * - bin/pq-test-multi: Multiple concurrent daemon sessions
 *
 * Do not add unit tests here. If you need to test pure utility functions from
 * daemon.ts, extract them to a separate module and test that module instead.
 */

describe('profile-query-cli daemon', function () {
  it('has no unit tests (see comment above)', function () {
    // This test exists only to prevent Jest from complaining about an empty suite
    expect(true).toBe(true);
  });
});
