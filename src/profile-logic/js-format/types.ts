/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type { JsDialect } from './dialect';

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

export type FormatWorkerInput = {
  code: string;
  dialect: JsDialect;
};

/**
 * The worker formats the code from front to back and sends a message after
 * each step, so that the source view can show partially-formatted code while
 * the worker is busy. Each message contains only the edits of this step, and
 * these edits come after all the edits of earlier messages. The code before
 * `formattedUpTo` is final; the code after it is still unformatted.
 */
export type FormatWorkerOutput =
  | {
      type: 'progress';
      edits: FormatEdits;
      formattedUpTo: number;
      isDone: boolean;
    }
  | {
      type: 'error';
      message: string;
    };
