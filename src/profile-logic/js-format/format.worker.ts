/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Web Worker entry point for formatting JS source code.
 *
 * Receives a FormatWorkerInput and posts a FormatWorkerOutput message after
 * each formatting step. The edits are transferred, not copied. The worker
 * never sends strings back: the main thread builds the formatted code from
 * the original code and the edits.
 *
 * Must be built as a separate esbuild bundle (see formatWorkerConfig) so
 * that npm dependencies are bundled into the worker output file.
 */

import { formatJsCodeIncrementally } from './formatter';
import type { FormatWorkerInput, FormatWorkerOutput } from './types';

// Override the `self` type: in the browser this file runs as a DedicatedWorker,
// but TypeScript's DOM lib types `self` as `Window & typeof globalThis`.
interface WorkerScope {
  onmessage: ((e: MessageEvent<FormatWorkerInput>) => void) | null;
  postMessage: (message: FormatWorkerOutput, transfer: Transferable[]) => void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e: MessageEvent<FormatWorkerInput>) => {
  const { code, dialect } = e.data;
  try {
    formatJsCodeIncrementally(code, dialect, (edits, formattedUpTo, isDone) => {
      scope.postMessage({ type: 'progress', edits, formattedUpTo, isDone }, [
        edits.buffer,
      ]);
    });
  } catch (error) {
    scope.postMessage(
      {
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      []
    );
  }
};
