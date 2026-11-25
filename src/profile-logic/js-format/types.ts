/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { JsDialect } from './dialect';
import type { FunctionSource, FunctionSourceRequest } from './function-source';

/**
 * Formatting JS source code ("pretty printing") only ever changes the
 * whitespace between tokens. So the result of formatting is described by a
 * list of "format edits" rather than by a new string. Each edit replaces the
 * whitespace gap [from, to) in the original code with new whitespace.
 *
 * The edits are stored in an Int32Array, with three consecutive entries per
 * edit: from, to, whitespace. The edits are sorted by position and don't
 * overlap. The whitespace value is encoded as follows:
 *  - FORMAT_WS_NONE: The gap is removed.
 *  - FORMAT_WS_SPACE: The gap is replaced with a single space.
 *  - Any positive value: The gap is replaced with
 *    `(value >> FORMAT_WS_NEWLINES_SHIFT)` newlines, followed by
 *    `(value & FORMAT_WS_INDENT_MASK)` levels of indentation.
 *
 * Gaps whose whitespace stays the same don't have an edit.
 */
export type FormatEdits = Int32Array<ArrayBuffer>;

export const FORMAT_WS_NONE = 0;
export const FORMAT_WS_SPACE = -1;
export const FORMAT_WS_NEWLINES_SHIFT = 16;
export const FORMAT_WS_INDENT_MASK = 0xffff;

// The string for one level of indentation.
export const FORMAT_INDENT = '  ';

export type FormatRequest = {
  code: string;
  dialect: JsDialect;
};

/**
 * The worker either formats a whole file, or extracts the code of a single
 * function from a file, see function-source.ts.
 */
export type FormatWorkerInput =
  | ({ type: 'format' } & FormatRequest)
  | { type: 'extract-function'; request: FunctionSourceRequest };

/**
 * For a 'format' request, the worker formats the code from front to back and
 * sends a 'progress' message after each step, so that the source view can
 * show partially-formatted code while the worker is busy. The code before `formattedUpTo` is formatted; the code
 * after it is still unformatted.
 *
 * A step can correct the edits of earlier steps. So each message says how
 * many of the edits from earlier messages are still valid, and contains the
 * edits which come after them; see updateFormatEdits. After the last
 * message, the edits are final.
 *
 * For an 'extract-function' request, the worker sends a single
 * 'function-source' message.
 */
export type FormatWorkerOutput =
  | {
      type: 'progress';
      keptEditCount: number;
      edits: FormatEdits;
      formattedUpTo: number;
      isDone: boolean;
    }
  | {
      type: 'function-source';
      // Null if there's no function at the requested position.
      functionSource: FunctionSource | null;
    }
  | {
      type: 'error';
      message: string;
    };
