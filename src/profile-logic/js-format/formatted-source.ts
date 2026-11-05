/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Applies format edits on the main thread. The formatted code is never built
 * as one string: it's built as an array of lines, and most lines are slices
 * of the original code. JS engines can usually represent such slices without
 * copying the characters. The source view passes the lines to CodeMirror,
 * which stores them in a tree of lines.
 */

import { bisectionRight } from 'firefox-profiler/utils/bisect';
import type { PositionToLineMapper } from 'firefox-profiler/profile-logic/line-timings';
import type { SourceFormattingStatus } from 'firefox-profiler/types';
import type { FormatEdits } from './types';
import {
  FORMAT_INDENT,
  FORMAT_WS_NONE,
  FORMAT_WS_SPACE,
  FORMAT_WS_NEWLINES_SHIFT,
  FORMAT_WS_INDENT_MASK,
} from './types';

export type FormattedSource = {
  // The lines of the formatted code, without the line break characters.
  readonly lines: string[];
  // Returns the 1-based line in the formatted code for a 1-based line and
  // column in the original code. The line and column are relative to the
  // start of the code, like in the source view. If the column is null, this
  // returns the formatted line for the start of the original line.
  getFormattedLine(line: number, column: number | null): number;
};

/**
 * Finds the line breaks in a string, in the same way as CodeMirror does:
 * "\r\n", "\r" and "\n" are line breaks. The positions of the next "\r" and
 * "\n" are cached, so that searching through the string from front to back
 * is linear even if there are few line breaks.
 */
class LineBreakFinder {
  _code: string;
  _nextLF: number;
  _nextCR: number;

  constructor(code: string) {
    this._code = code;
    this._nextLF = code.indexOf('\n');
    this._nextCR = code.indexOf('\r');
  }

  // Returns the position of the first line break at or after `pos`, or -1.
  next(pos: number): number {
    if (this._nextLF !== -1 && this._nextLF < pos) {
      this._nextLF = this._code.indexOf('\n', pos);
    }
    if (this._nextCR !== -1 && this._nextCR < pos) {
      this._nextCR = this._code.indexOf('\r', pos);
    }
    if (this._nextCR === -1) {
      return this._nextLF;
    }
    if (this._nextLF === -1) {
      return this._nextCR;
    }
    return Math.min(this._nextLF, this._nextCR);
  }

  // Returns the length of the line break at `pos`.
  lengthAt(pos: number): number {
    return this._code.charCodeAt(pos) === 13 &&
      this._code.charCodeAt(pos + 1) === 10
      ? 2
      : 1;
  }
}

// The offsets of the line starts in `code`, including the first line.
function _getLineStarts(code: string): number[] {
  const lineStarts = [0];
  const finder = new LineBreakFinder(code);
  let pos = 0;
  for (;;) {
    const lineBreak = finder.next(pos);
    if (lineBreak === -1) {
      return lineStarts;
    }
    pos = lineBreak + finder.lengthAt(lineBreak);
    lineStarts.push(pos);
  }
}

// Computing the line starts of the original code takes a few milliseconds for
// a large bundle. Cache the result for the most recent code, because the
// formatted source is recomputed for each progress update of the formatting.
let _lineStartsCache: { code: string; lineStarts: number[] } | null = null;

function _getCachedLineStarts(code: string): number[] {
  if (_lineStartsCache === null || _lineStartsCache.code !== code) {
    _lineStartsCache = { code, lineStarts: _getLineStarts(code) };
  }
  return _lineStartsCache.lineStarts;
}

const _whitespaceStrings: Map<number, string> = new Map();

function _getWhitespaceString(ws: number): string {
  let str = _whitespaceStrings.get(ws);
  if (str === undefined) {
    str = FORMAT_INDENT.repeat(ws & FORMAT_WS_INDENT_MASK);
    _whitespaceStrings.set(ws, str);
  }
  return str;
}

export function applyFormatEdits(
  code: string,
  edits: FormatEdits
): FormattedSource {
  const lines: string[] = [];
  // The offset in the original code where each formatted line starts, for all
  // lines after the first one. Lines which start with indentation from an
  // edit start at the end of the edited gap.
  const formattedLineStarts: number[] = [];
  const finder = new LineBreakFinder(code);
  let currentLine = '';

  // Append code[from, to), which may contain original line breaks.
  function appendOriginal(from: number, to: number) {
    let pos = from;
    for (;;) {
      const lineBreak = finder.next(pos);
      if (lineBreak === -1 || lineBreak >= to) {
        currentLine += code.slice(pos, to);
        return;
      }
      lines.push(currentLine + code.slice(pos, lineBreak));
      pos = lineBreak + finder.lengthAt(lineBreak);
      formattedLineStarts.push(pos);
      currentLine = '';
    }
  }

  let pos = 0;
  for (let i = 0; i < edits.length; i += 3) {
    const from = edits[i];
    const to = edits[i + 1];
    const ws = edits[i + 2];
    appendOriginal(pos, from);
    if (ws === FORMAT_WS_SPACE) {
      currentLine += ' ';
    } else if (ws !== FORMAT_WS_NONE) {
      const lineBreaks = ws >> FORMAT_WS_NEWLINES_SHIFT;
      for (let j = 0; j < lineBreaks; j++) {
        lines.push(currentLine);
        formattedLineStarts.push(to);
        currentLine = '';
      }
      currentLine = _getWhitespaceString(ws);
    }
    pos = to;
  }
  appendOriginal(pos, code.length);
  lines.push(currentLine);

  const originalLineStarts = _getCachedLineStarts(code);
  return {
    lines,
    getFormattedLine(line: number, column: number | null): number {
      const lineIndex = Math.min(
        Math.max(line - 1, 0),
        originalLineStarts.length - 1
      );
      let offset = originalLineStarts[lineIndex];
      if (column !== null) {
        const lineEnd =
          lineIndex + 1 < originalLineStarts.length
            ? originalLineStarts[lineIndex + 1] - 1
            : code.length;
        offset = Math.min(offset + Math.max(column - 1, 0), lineEnd);
      }
      return 1 + bisectionRight(formattedLineStarts, offset);
    },
  };
}

/**
 * What the source view needs to show pretty-printed code.
 */
export type SourceViewFormatting = {
  // The lines of the formatted code.
  readonly lines: string[];
  // False while the format worker is busy. Then only the start of the code is
  // formatted.
  readonly isDone: boolean;
  // Maps a line and column from the profile to the line in the formatted
  // code. Unlike FormattedSource.getFormattedLine, this accepts the line and
  // column numbers from the profile, which are relative to the start of the
  // file, not to the start of the source. This matters for inline scripts.
  readonly mapPositionToLine: PositionToLineMapper;
};

export function createSourceViewFormatting(
  code: string,
  status: SourceFormattingStatus,
  startLine: number,
  startColumn: number
): SourceViewFormatting {
  const formattedSource = applyFormatEdits(code, status.edits);
  return {
    lines: formattedSource.lines,
    isDone: status.isDone,
    mapPositionToLine: (line, column) => {
      const relativeLine = line - startLine + 1;
      const relativeColumn =
        column !== null && relativeLine === 1
          ? column - startColumn + 1
          : column;
      return formattedSource.getFormattedLine(relativeLine, relativeColumn);
    },
  };
}
