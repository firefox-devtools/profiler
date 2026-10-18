/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Extracts the code of a single function from a JS file, for example to show
 * the code of one function from a large bundle. This runs in the format
 * worker, because it needs to parse the whole file.
 */

import {
  getJsScopeTreeFromSyntaxTree,
  findInnermostFunctionScope,
  parserForDialect,
} from 'firefox-profiler/profile-logic/source-maps/scope-tree';
import {
  buildLineOffsets,
  lineColToOffset,
  offsetToLineCol,
} from 'firefox-profiler/utils/line-offsets';
import { computeFormatEdits } from './formatter';
import { applyFormatEdits } from './formatted-source';
import type { JsDialect } from './dialect';

/**
 * Whether the function code should be pretty-printed. 'auto' pretty-prints
 * the code if it looks minified, i.e. if it has very long lines.
 */
export type FunctionFormatMode = 'always' | 'never' | 'auto';

export type FunctionSourceRequest = {
  code: string;
  dialect: JsDialect;
  // The 1-based line and column of the function, relative to the start of
  // the code. Any position inside the function works, but the function's own
  // position is the most reliable one: with a position inside the body, a
  // nested function could be found instead.
  line: number;
  column: number;
  format: FunctionFormatMode;
};

export type FunctionSource = {
  // The lines of the function, with the common indentation removed.
  lines: string[];
  // The 1-based line in the code where the first line starts, or null if the
  // code was pretty-printed, because the lines don't correspond to lines in
  // the code then.
  firstLine: number | null;
};

// Lines longer than this are a sign of minified code.
const MINIFIED_LINE_LENGTH = 300;

function _hasLongLine(code: string, start: number, end: number): boolean {
  let lineStart = start;
  while (lineStart < end) {
    let lineEnd = code.indexOf('\n', lineStart);
    if (lineEnd === -1 || lineEnd > end) {
      lineEnd = end;
    }
    if (lineEnd - lineStart > MINIFIED_LINE_LENGTH) {
      return true;
    }
    lineStart = lineEnd + 1;
  }
  return false;
}

function _leadingWhitespaceLength(line: string): number {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
    i++;
  }
  return i;
}

/**
 * Removes the indentation that all non-blank lines in lines[from..] have in
 * common.
 */
function _dedent(lines: string[], from: number): string[] {
  let commonIndent = Infinity;
  for (let i = from; i < lines.length; i++) {
    const indent = _leadingWhitespaceLength(lines[i]);
    if (indent < lines[i].length) {
      commonIndent = Math.min(commonIndent, indent);
    }
  }
  if (commonIndent === Infinity || commonIndent === 0) {
    return lines;
  }
  return lines.map((line, i) => (i < from ? line : line.slice(commonIndent)));
}

/**
 * Returns the code of the innermost function at the given position, or null
 * if the position isn't inside a function.
 */
export function extractFunctionSource({
  code,
  dialect,
  line,
  column,
  format,
}: FunctionSourceRequest): FunctionSource | null {
  const tree = parserForDialect(dialect).parse(code);
  const scopes = getJsScopeTreeFromSyntaxTree(tree, code);
  const lineOffsets = buildLineOffsets(code);
  const lineIndex = Math.min(Math.max(line - 1, 0), lineOffsets.length - 1);
  const offset = lineColToOffset(
    lineIndex,
    Math.max(column - 1, 0),
    lineOffsets
  );
  const scopePath = findInnermostFunctionScope(scopes, offset);
  if (scopePath === null) {
    return null;
  }
  const { start, end } = scopePath[0];

  // Without formatting, whole lines are shown, so that the code before the
  // function on its first line is included, for example `const view = ` for
  // an arrow function.
  const firstLineStart = code.lastIndexOf('\n', start - 1) + 1;
  let lastLineEnd = code.indexOf('\n', end);
  if (lastLineEnd === -1) {
    lastLineEnd = code.length;
  }

  // Check the whole lines, not just the function: a short function in a
  // minified file would otherwise be shown with all the code around it.
  if (
    format === 'always' ||
    (format === 'auto' && _hasLongLine(code, firstLineStart, lastLineEnd))
  ) {
    // Only format the gaps inside the function. The gap before the function
    // ends at `start`, so it's excluded by starting the range at start + 1.
    const edits = computeFormatEdits(code, tree, start + 1, end);
    for (let i = 0; i < edits.length; i += 3) {
      edits[i] -= start;
      edits[i + 1] -= start;
    }
    const { lines } = applyFormatEdits(code.slice(start, end), edits);
    // The first line starts in the middle of a line, so it has no
    // indentation. The indentation of the other lines is relative to the
    // whole file.
    return { lines: _dedent(lines, 1), firstLine: null };
  }

  const lines = code.slice(firstLineStart, lastLineEnd).split(/\r?\n/);
  const firstLineIndex = offsetToLineCol(firstLineStart, lineOffsets).line;
  return { lines: _dedent(lines, 0), firstLine: firstLineIndex + 1 };
}
