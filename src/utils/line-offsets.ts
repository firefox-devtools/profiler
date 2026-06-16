/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { bisectionRight } from './bisect';

/**
 * Build a line-offset table for binary search.
 * `lineOffsets[i]` is the character offset of the start of line `i` (0-based).
 */
export function buildLineOffsets(text: string): number[] {
  const offsets = [0];
  let pos = 0;
  for (;;) {
    const next = text.indexOf('\n', pos);
    if (next === -1) {
      break;
    }
    offsets.push(next + 1);
    pos = next + 1;
  }
  return offsets;
}

/**
 * Convert a character offset to a 0-based { line, col } position.
 * Uses binary search over the line-offset table.
 */
export function offsetToLineCol(
  offset: number,
  lineOffsets: number[]
): { line: number; col: number } {
  const line = bisectionRight(lineOffsets, offset) - 1;
  return { line, col: offset - lineOffsets[line] };
}

/**
 * Convert a 0-based { line, col } position back to a character offset.
 */
export function lineColToOffset(
  line: number,
  col: number,
  lineOffsets: number[]
): number {
  return lineOffsets[line] + col;
}
