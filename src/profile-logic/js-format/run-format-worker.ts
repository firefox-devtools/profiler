/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {
  FormatRequest,
  FormatWorkerInput,
  FormatWorkerOutput,
} from './types';
import type { FunctionSource, FunctionSourceRequest } from './function-source';

/**
 * Starts a format worker for one request. Calls onOutput for each message from
 * the worker, and terminates the worker after the last message.
 */
function _runWorker(
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
    if (output.type !== 'progress' || output.isDone) {
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

/**
 * Formats JS code in a worker. Calls onOutput for each message from the
 * worker.
 *
 * Tests mock this module, because the worker needs to be bundled by esbuild.
 */
export function runFormatWorker(
  request: FormatRequest,
  onOutput: (
    output: Exclude<FormatWorkerOutput, { type: 'function-source' }>
  ) => void
): void {
  _runWorker({ type: 'format', ...request }, (output) => {
    if (output.type === 'function-source') {
      onOutput({ type: 'error', message: 'Unexpected function source' });
    } else {
      onOutput(output);
    }
  });
}

/**
 * Extracts the code of a function in a worker, because it needs to parse the
 * whole file. Resolves to null if there's no function at the position.
 */
export function extractFunctionSourceInWorker(
  request: FunctionSourceRequest
): Promise<FunctionSource | null> {
  return new Promise((resolve, reject) => {
    _runWorker({ type: 'extract-function', request }, (output) => {
      switch (output.type) {
        case 'function-source':
          resolve(output.functionSource);
          break;
        case 'error':
          reject(new Error(output.message));
          break;
        default:
          reject(new Error(`Unexpected output from the format worker`));
      }
    });
  });
}
