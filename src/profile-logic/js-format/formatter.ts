/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A JS formatter ("pretty printer") for minified code, based on the Lezer
 * syntax tree.
 *
 * The formatter never changes, adds or removes tokens. It only replaces the
 * whitespace between tokens, and it describes the result as a list of format
 * edits; see FormatEdits. This keeps the mapping between the original and the
 * formatted code simple, so that we can attribute the samples, which refer
 * to positions in the original code, to the lines of the formatted code.
 *
 * The rules:
 *  - Statements, class members, object properties and switch cases go on
 *    their own lines, indented by their nesting depth.
 *  - A statement body without braces, e.g. in `if (a) b();`, goes on its own
 *    line.
 *  - Declarations with multiple variables, and comma sequences used as
 *    statements, such as `a(), b(), c()`, get one line per item, because
 *    minifiers use these to replace multiple statements.
 *  - Existing line breaks are kept, with at most one blank line.
 *  - Spaces are added around binary operators, after commas, and after
 *    keywords.
 *  - Strings, template strings, regular expressions, comments and JSX are
 *    kept as they are.
 *
 * This module imports @lezer/javascript, so it should only be used in the
 * format worker and in tests.
 */

import { TreeFragment } from '@lezer/common';
import type { Tree, TreeCursor } from '@lezer/common';

import { parserForDialect } from 'firefox-profiler/profile-logic/source-maps/scope-tree';
import type { JsDialect } from './dialect';
import type { FormatEdits } from './types';
import {
  FORMAT_INDENT,
  FORMAT_WS_NONE,
  FORMAT_WS_SPACE,
  FORMAT_WS_NEWLINES_SHIFT,
} from './types';

// Nodes whose children each go on their own line.
const BLOCK_LIKE = new Set([
  'Script',
  'Block',
  'ClassBody',
  'SwitchBody',
  'ObjectExpression',
  'EnumBody',
  'ObjectType',
]);

// Statements with a body statement, which goes on its own line if it's not a
// block.
const BODY_PARENTS = new Set([
  'IfStatement',
  'ForStatement',
  'WhileStatement',
  'DoStatement',
  'WithStatement',
]);

const FOR_SPECS = new Set(['ForSpec', 'ForInSpec', 'ForOfSpec']);

// Nodes which are copied verbatim, without looking at their children.
const ATOMIC = new Set([
  'String',
  'TemplateString',
  'RegExp',
  'BlockComment',
  'LineComment',
  'JSXElement',
  'Hashbang',
]);

const COMMENTS = new Set(['BlockComment', 'LineComment']);

const OPERATORS = new Set([
  'ArithOp',
  'LogicOp',
  'BitOp',
  'CompareOp',
  'Equals',
  'UpdateOp',
  'Arrow',
]);
const UNSPACED_OPERATOR_PARENTS = new Set([
  'UnaryExpression',
  'PostfixExpression',
]);

const SPACE_AFTER_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'with',
  'return',
  'else',
  'try',
  'do',
  'finally',
  'typeof',
  'void',
  'delete',
  'throw',
  'case',
  'in',
  'of',
  'instanceof',
  'extends',
  'yield',
  'await',
  'const',
  'let',
  'var',
  'new',
  'export',
  'async',
]);
const SPACE_BEFORE_KEYWORDS = new Set(['in', 'of', 'instanceof', 'as']);
const NO_SPACE_BEFORE = new Set([';', ')', ']', '}', ',', '.', ':', '?.']);
const SPACE_AFTER_CLOSING_BRACE_KEYWORDS = new Set([
  'else',
  'catch',
  'finally',
  'while',
]);
const BRACE_SPACE_PARENTS = new Set(['Block', 'ClassBody', 'SwitchBody']);
const NO_SPACE_AFTER = new Set(['(', '[', '{', '!', '.', '?.', 'Spread']);

const NO_BREAK = -1;

type Frame = {
  name: string;
  from: number;
  // The indentation of the line on which this node starts.
  lineIndent: number;
  // For block-like nodes: whether the node has children other than
  // punctuation and comments. The closing brace only goes on its own line if
  // the node has content.
  hasContent: boolean;
  // The name of the previous child that was visited.
  lastChild: string | null;
};

class FormatEditsBuilder {
  _buffer: FormatEdits = new Int32Array(3 * 1024);
  _length = 0;

  push(from: number, to: number, ws: number) {
    if (this._length + 3 > this._buffer.length) {
      const newBuffer = new Int32Array(this._buffer.length * 2);
      newBuffer.set(this._buffer);
      this._buffer = newBuffer;
    }
    this._buffer[this._length++] = from;
    this._buffer[this._length++] = to;
    this._buffer[this._length++] = ws;
  }

  finish(): FormatEdits {
    return this._buffer.slice(0, this._length);
  }
}

function _isWhitespace(charCode: number): boolean {
  return (
    charCode <= 32 ||
    charCode === 0xa0 ||
    charCode === 0xfeff ||
    charCode === 0x1680 ||
    (charCode >= 0x2000 && charCode <= 0x200a) ||
    charCode === 0x2028 ||
    charCode === 0x2029 ||
    charCode === 0x202f ||
    charCode === 0x205f ||
    charCode === 0x3000
  );
}

/**
 * Returns the number of line breaks in code[from, to), or -1 if this range
 * contains anything other than whitespace. Line breaks are counted in the same
 * way as CodeMirror does: "\r\n", "\r" and "\n" are line breaks.
 */
function _countLineBreaksInGap(code: string, from: number, to: number): number {
  let lineBreaks = 0;
  for (let i = from; i < to; i++) {
    const charCode = code.charCodeAt(i);
    if (charCode === 10) {
      if (i === from || code.charCodeAt(i - 1) !== 13) {
        lineBreaks++;
      }
    } else if (charCode === 13) {
      lineBreaks++;
    } else if (!_isWhitespace(charCode)) {
      return -1;
    }
  }
  return lineBreaks;
}

function _isSpacedOperator(name: string, parentName: string): boolean {
  return OPERATORS.has(name) && !UNSPACED_OPERATOR_PARENTS.has(parentName);
}

// Whether a space should be added between two tokens on the same line, when
// there wasn't any whitespace between them in the original code.
function _needsSpace(
  prevName: string,
  prevParentName: string,
  name: string,
  parentName: string
): boolean {
  if (prevName === ',') {
    return name !== ')' && name !== ']' && name !== ',';
  }
  if (prevName === ';') {
    // This is a `for (;;)` header, or a comment after a statement.
    return name !== ')' && name !== ';';
  }
  if (
    _isSpacedOperator(name, parentName) ||
    _isSpacedOperator(prevName, prevParentName)
  ) {
    return true;
  }
  if (prevName === ':') {
    // Object properties, destructuring, labels and type annotations.
    return true;
  }
  if (SPACE_AFTER_KEYWORDS.has(prevName)) {
    return !NO_SPACE_BEFORE.has(name);
  }
  if (SPACE_BEFORE_KEYWORDS.has(name)) {
    // For example `for (let [a, b] of c)`.
    return !NO_SPACE_AFTER.has(prevName);
  }
  if (prevName === '}' && SPACE_AFTER_CLOSING_BRACE_KEYWORDS.has(name)) {
    return true;
  }
  if (name === '{' && BRACE_SPACE_PARENTS.has(parentName)) {
    return !NO_SPACE_AFTER.has(prevName);
  }
  return false;
}

/**
 * Computes the format edits for `code`, using the syntax tree `tree`. Only
 * the edits for the gaps which end in [rangeStart, rangeEnd) are returned.
 * The tree can be a partial tree which only covers the code up to some
 * position; then rangeEnd needs to be a bit before the end of the tree,
 * because the nodes at the end of a partial tree can be incomplete.
 */
export function computeFormatEdits(
  code: string,
  tree: Tree,
  rangeStart: number,
  rangeEnd: number
): FormatEdits {
  const edits = new FormatEditsBuilder();
  const cursor: TreeCursor = tree.cursor();
  const stack: Frame[] = [
    {
      name: cursor.name,
      from: cursor.from,
      lineIndent: 0,
      hasContent: false,
      lastChild: null,
    },
  ];

  // The end of the previous token. The gap between this position and the
  // start of the next token is the whitespace that we may replace.
  let prevEnd = 0;
  let prevName = '';
  let prevParentName = '';
  let hasEmittedToken = false;
  // Whether the whitespace in the current gap has already been decided, by
  // an ancestor of the current node which starts at the same position.
  let isGapDecided = false;
  // The indentation of the current line of the formatted code.
  let currentLineIndent = 0;

  function pushWhitespace(from: number, to: number, ws: number) {
    if (to < rangeStart || to >= rangeEnd) {
      return;
    }
    // Only push an edit if the whitespace changes.
    if (ws === FORMAT_WS_NONE) {
      if (to === from) {
        return;
      }
    } else if (ws === FORMAT_WS_SPACE) {
      if (to - from === 1 && code.charCodeAt(from) === 32) {
        return;
      }
    } else {
      const lineBreaks = ws >> FORMAT_WS_NEWLINES_SHIFT;
      const indent = ws & 0xffff;
      const expected = '\n'.repeat(lineBreaks) + FORMAT_INDENT.repeat(indent);
      if (to - from === expected.length && code.slice(from, to) === expected) {
        return;
      }
    }
    edits.push(from, to, ws);
  }

  // The indentation for the children of a block-like node.
  function contentIndent(parent: Frame, name: string): number {
    switch (parent.name) {
      case 'Script':
        return 0;
      case 'SwitchBody':
        return (
          parent.lineIndent +
          (name === 'CaseLabel' || name === 'DefaultLabel' ? 1 : 2)
        );
      default:
        return parent.lineIndent + 1;
    }
  }

  // Returns the indentation if the node needs to start on a new line, or
  // NO_BREAK if it doesn't.
  function getBreakRule(name: string, parent: Frame): number {
    if (COMMENTS.has(name)) {
      return NO_BREAK;
    }
    const parentName = parent.name;
    if (BLOCK_LIKE.has(parentName)) {
      if (name === '{' || name === ',' || name === ';') {
        return NO_BREAK;
      }
      if (name === '}') {
        return parent.hasContent ? parent.lineIndent : NO_BREAK;
      }
      parent.hasContent = true;
      return contentIndent(parent, name);
    }
    if (BODY_PARENTS.has(parentName)) {
      if (
        (name === 'else' && parentName === 'IfStatement') ||
        (name === 'while' && parentName === 'DoStatement')
      ) {
        // Keep `} else` together, but put `else` on its own line after a
        // body without braces.
        return parent.lastChild !== 'Block' ? parent.lineIndent : NO_BREAK;
      }
      if (
        name !== 'Block' &&
        name !== ';' &&
        cursor.type.is('Statement') &&
        !(name === 'IfStatement' && parent.lastChild === 'else')
      ) {
        return parent.lineIndent + 1;
      }
      return NO_BREAK;
    }
    if (parent.lastChild === ',') {
      const grandparentName = stack[stack.length - 2]?.name;
      if (
        parentName === 'VariableDeclaration' &&
        !FOR_SPECS.has(grandparentName)
      ) {
        return parent.lineIndent + 1;
      }
      if (parentName === 'SequenceExpression') {
        if (
          grandparentName === 'ExpressionStatement' ||
          grandparentName === 'ReturnStatement' ||
          grandparentName === 'ThrowStatement' ||
          (grandparentName === 'ParenthesizedExpression' &&
            stack[stack.length - 3]?.name === 'ArrowFunction')
        ) {
          return parent.lineIndent + 1;
        }
      }
    }
    return NO_BREAK;
  }

  // The indentation for a line break which was in the original code.
  function continuationIndent(name: string, parent: Frame): number {
    if (name === ')' || name === ']' || name === '}') {
      return parent.lineIndent;
    }
    if (BLOCK_LIKE.has(parent.name)) {
      return contentIndent(parent, name);
    }
    return parent.lineIndent + 1;
  }

  // Decide whether there's a line break before the node at the cursor.
  function handleLineBreakBefore(name: string, from: number, parent: Frame) {
    const breakIndent = getBreakRule(name, parent);
    if (isGapDecided) {
      return;
    }
    const lineBreaks = _countLineBreaksInGap(code, prevEnd, from);
    if (lineBreaks === -1) {
      // There's something other than whitespace in this gap. This happens
      // for code that isn't covered by the syntax tree. Leave it alone.
      isGapDecided = true;
      return;
    }
    if (!hasEmittedToken) {
      // Remove whitespace at the start of the code.
      pushWhitespace(prevEnd, from, FORMAT_WS_NONE);
      isGapDecided = true;
      return;
    }
    let indent = breakIndent;
    if (indent === NO_BREAK && lineBreaks > 0) {
      indent = continuationIndent(name, parent);
    }
    if (indent === NO_BREAK) {
      return;
    }
    const newLineBreaks = Math.min(Math.max(lineBreaks, 1), 2);
    pushWhitespace(
      prevEnd,
      from,
      (newLineBreaks << FORMAT_WS_NEWLINES_SHIFT) | indent
    );
    isGapDecided = true;
    currentLineIndent = indent;
    // Ancestors which start at the same position start on this line, too.
    for (let i = stack.length - 1; i >= 0 && stack[i].from === from; i--) {
      stack[i].lineIndent = indent;
    }
  }

  function emitToken(name: string, from: number, to: number, parent: Frame) {
    if (!isGapDecided) {
      const ws =
        from > prevEnd ||
        _needsSpace(prevName, prevParentName, name, parent.name)
          ? FORMAT_WS_SPACE
          : FORMAT_WS_NONE;
      pushWhitespace(prevEnd, from, ws);
    }
    prevEnd = to;
    prevName = name;
    prevParentName = parent.name;
    hasEmittedToken = true;
    isGapDecided = false;
  }

  if (!cursor.firstChild()) {
    return edits.finish();
  }
  outer: for (;;) {
    const { name, from, to } = cursor;
    if (from >= rangeEnd) {
      break;
    }
    const parent = stack[stack.length - 1];
    // Skip empty nodes, such as the error nodes that Lezer inserts.
    if (to > from) {
      handleLineBreakBefore(name, from, parent);
      if (!ATOMIC.has(name) && cursor.firstChild()) {
        stack.push({
          name,
          from,
          lineIndent: currentLineIndent,
          hasContent: false,
          lastChild: null,
        });
        continue;
      }
      emitToken(name, from, to, parent);
      parent.lastChild = name;
    }
    while (!cursor.nextSibling()) {
      cursor.parent();
      const frame = stack.pop();
      if (stack.length === 0 || frame === undefined) {
        break outer;
      }
      stack[stack.length - 1].lastChild = frame.name;
    }
  }
  return edits.finish();
}

/**
 * Formats the code in one go. This is used by tests.
 */
export function formatJsCode(code: string, dialect: JsDialect): FormatEdits {
  const tree = parserForDialect(dialect).parse(code);
  return computeFormatEdits(code, tree, 0, code.length + 1);
}

// How much code before the end of a partial syntax tree is considered unsafe
// to format, because the nodes there might still change once more code is
// parsed.
const PARTIAL_TREE_MARGIN = 2000;

// The minimum time to parse before reporting progress, in milliseconds.
const MIN_STEP_DURATION = 50;

/**
 * Formats the code in steps, and calls onProgress after each step with the
 * edits of that step. The code is parsed incrementally. After each step, the
 * format edits are computed by walking the partial syntax tree from the
 * start, because the formatting state depends on all the code before it. To
 * keep this overhead low, each step parses for at least four times as long
 * as the last walk took.
 */
export function formatJsCodeIncrementally(
  code: string,
  dialect: JsDialect,
  onProgress: (
    edits: FormatEdits,
    formattedUpTo: number,
    isDone: boolean
  ) => void
) {
  const parser = parserForDialect(dialect);
  let fragments: readonly TreeFragment[] = [];
  let formattedUpTo = 0;
  let stepDuration = MIN_STEP_DURATION;
  for (;;) {
    const parse = parser.startParse(code, fragments);
    const stepStart = performance.now();
    let tree: Tree | null;
    while ((tree = parse.advance()) === null) {
      if (
        parse.stoppedAt === null &&
        performance.now() - stepStart > stepDuration
      ) {
        parse.stopAt(parse.parsedPos);
      }
    }
    const isDone = parse.stoppedAt === null;
    const rangeEnd = isDone
      ? code.length + 1
      : Math.max(formattedUpTo, tree.length - PARTIAL_TREE_MARGIN);
    if (isDone || rangeEnd > formattedUpTo) {
      const walkStart = performance.now();
      const edits = computeFormatEdits(code, tree, formattedUpTo, rangeEnd);
      const walkDuration = performance.now() - walkStart;
      stepDuration = Math.max(MIN_STEP_DURATION, walkDuration * 4);
      formattedUpTo = Math.min(rangeEnd, code.length);
      onProgress(edits, formattedUpTo, isDone);
    }
    if (isDone) {
      return;
    }
    fragments = TreeFragment.addTree(tree, fragments, true);
  }
}
