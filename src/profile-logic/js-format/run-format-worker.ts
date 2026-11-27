/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { FormatWorkerInput, FormatWorkerOutput } from './types';

/**
 * Formats JS code in a worker. Calls onOutput for each message from the
 * worker, and terminates the worker after the last message.
 *
 * Tests mock this module, because the worker needs to be bundled by esbuild.
 */
export function runFormatWorker(
  input: FormatWorkerInput,
  onOutput: (output: FormatWorkerOutput) => void
): void {
  let worker: Worker;
  try {
    worker = new Worker(FORMAT_WORKER_PATH);
  } catch (error) {
    onOutput({ type: 'error', message: String(error) });
    return;
  }

  worker.onmessage = (e: MessageEvent<FormatWorkerOutput>) => {
    const output = e.data;
    onOutput(output);
    if (output.type === 'error' || output.isDone) {
      worker.terminate();
    }
  };
  worker.onerror = (e: ErrorEvent) => {
    onOutput({
      type: 'error',
      message: e.error?.message ?? e.message ?? 'The format worker failed',
    });
    worker.terminate();
  };
  worker.postMessage(input);
}
