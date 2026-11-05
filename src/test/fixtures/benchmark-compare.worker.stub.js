/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test-only stub for src/profile-logic/benchmark/benchmark-compare.worker.ts,
// which is a separate esbuild bundle and so cannot be loaded from source by the
// node-worker fixture.
//
// Nothing should reach it: `runBenchmarkComparison` takes the table runner as an
// argument and defaults to the in-process one, so a test exercises the comparison
// without any worker at all, and the pool's own protocol is tested against a fake
// Worker (see benchmark-compare-worker-pool.test.ts). This is here so that a
// dispatch which does slip through fails loudly instead of hanging.

onmessage = (e) => {
  const message = e.data;
  if (message && message.type === 'job') {
    postMessage({
      type: 'error',
      requestId: message.requestId,
      message:
        'The benchmark compare worker is stubbed in tests. Pass a table ' +
        'runner to runBenchmarkComparison instead of spawning one.',
    });
  }
};
