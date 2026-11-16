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
 *  - Argument lists, arrays, parenthesized expressions, comma sequences and
 *    conditional expressions which would make the line longer than
 *    MAX_LINE_LENGTH get one line per item, or per `?` and `:` branch. The
 *    length is estimated from the original code, up to the first `{`,
 *    because objects and blocks are already split into multiple lines.
 *  - Existing line breaks are kept, with at most one blank line.
 *  - Spaces are added around binary operators, after commas, and after
 *    keywords.
 *  - Strings, template strings, regular expressions, comments and JSX are
 *    kept as they are.
 *
 * This module imports @lezer/javascript, so the main bundle must not import
 * it.
 */

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
  'import',
  'from',
  'async',
]);
const SPACE_BEFORE_KEYWORDS = new Set(['in', 'of', 'instanceof', 'as', 'from']);
const NO_SPACE_BEFORE = new Set([';', ')', ']', '}', ',', '.', ':', '?.']);
const SPACE_AFTER_CLOSING_BRACE_KEYWORDS = new Set([
  'else',
  'catch',
  'finally',
  'while',
]);
const BRACE_SPACE_PARENTS = new Set(['Block', 'ClassBody', 'SwitchBody']);
const NO_SPACE_AFTER = new Set(['(', '[', '{', '!', '.', '?.', 'Spread']);

// Nodes which get one line per item if they would make the line too long.
const WRAPPABLE = new Set([
  'ArgList',
  'ParamList',
  'ArrayExpression',
  'ArrayPattern',
  'ObjectPattern',
  'ImportGroup',
  'ExportGroup',
  'ParenthesizedExpression',
  'SequenceExpression',
  'ConditionalExpression',
]);
// The nodes which can stay on the line of a logical operator if they are its
// last operand, because they are split into lines by themselves.
const BRACKETED_OPERANDS = new Set([
  'ParenthesizedExpression',
  'ObjectExpression',
  'ArrayExpression',
  'ArrowFunction',
  'FunctionExpression',
]);
const OPENING_BRACKETS = new Set(['(', '[', '{']);
const CLOSING_BRACKETS = new Set([')', ']', '}']);

// The line length above which wrappable nodes are wrapped.
const MAX_LINE_LENGTH = 100;
// Shorter nodes aren't wrapped, because wrapping them doesn't save much.
const MIN_WRAPPED_LENGTH = 20;

const NO_BREAK = -1;

type Frame = {
  name: string;
  from: number;
  // The indentation of the line on which this node starts.
  lineIndent: number;
  // Whether this node is at the start of that line.
  startsLine: boolean;
  // For block-like nodes: whether the node has children other than
  // punctuation and comments. The closing brace only goes on its own line if
  // the node has content.
  hasContent: boolean;
  // The name of the previous child that was visited.
  lastChild: string | null;
  // For wrappable nodes: whether each item goes on its own line.
  isWrapped: boolean;
  // For binary expressions with a logical operator: the operator, such as
  // `||`. Otherwise ''.
  operator: string;
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

/**
 * Returns the column after code[from, to), if the column before it is
 * `column`. Only call this for short ranges or ranges which can contain line
 * breaks, because it looks at every character.
 */
function _columnAfter(
  code: string,
  from: number,
  to: number,
  column: number
): number {
  for (let i = to - 1; i >= from; i--) {
    const charCode = code.charCodeAt(i);
    if (charCode === 10 || charCode === 13) {
      return to - i - 1;
    }
  }
  return column + (to - from);
}

// The characters of operators, around which the formatter usually adds
// spaces.
const OPERATOR_CHARS = new Uint8Array(128);
for (const char of '=|&?:+-<>') {
  OPERATOR_CHARS[char.charCodeAt(0)] = 1;
}

/**
 * Estimates the length of code[from, to) in the formatted code, up to the
 * first `{` which isn't followed by `}`. Objects and blocks are split into
 * lines, so the code after such a `{` doesn't count towards the length of the
 * line. If untilBrace is false, such a `{` gives Infinity instead, because the
 * code doesn't fit on one line. A `{` at `from` is the opening brace of an
 * object pattern, which isn't split into lines, so it doesn't count. Stops
 * once the estimate exceeds maxLength.
 *
 * The estimate assumes a space after each comma and around each operator, and
 * counts whitespace in the code as a single space.
 */
function _estimateLength(
  code: string,
  from: number,
  to: number,
  maxLength: number,
  untilBrace: boolean
): number {
  let length = 0;
  let i = from;
  if (code.charCodeAt(i) === 123 /* { */) {
    length++;
    i++;
  }
  // Whether there's a space before the next character, and whether the
  // previous character was part of an operator.
  let hasSpace = false;
  let isInOperator = false;
  for (; i < to && length <= maxLength; i++) {
    const charCode = code.charCodeAt(i);
    if (charCode === 123 /* { */ && code.charCodeAt(i + 1) !== 125 /* } */) {
      return untilBrace ? length : Infinity;
    }
    if (_isWhitespace(charCode)) {
      hasSpace = true;
      isInOperator = false;
    } else if (charCode < 128 && OPERATOR_CHARS[charCode] === 1) {
      // The space before the operator, unless this continues the operator.
      if (!isInOperator) {
        length++;
      }
      length++;
      hasSpace = true;
      isInOperator = true;
    } else {
      if (hasSpace && charCode !== 44 /* , */) {
        length++;
      }
      length++;
      hasSpace = charCode === 44; /* , */
      isInOperator = false;
    }
  }
  return length;
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
    // No space in `import(`, for dynamic imports.
    return (
      !NO_SPACE_BEFORE.has(name) && !(prevName === 'import' && name === '(')
    );
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
 * Computes the format edits for `code`, using the syntax tree `tree`.
 */
export function computeFormatEdits(code: string, tree: Tree): FormatEdits {
  const edits = new FormatEditsBuilder();
  const cursor: TreeCursor = tree.cursor();
  const stack: Frame[] = [
    {
      name: cursor.name,
      from: cursor.from,
      lineIndent: 0,
      startsLine: true,
      hasContent: false,
      lastChild: null,
      isWrapped: false,
      operator: '',
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
  // The indentation of the nodes which start on the current line of the
  // formatted code.
  let currentLineIndent = 0;
  // The column in the formatted code after the previous token.
  let column = 0;

  function pushWhitespace(from: number, to: number, ws: number) {
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

  // Whether a sequence expression whose parent is stack[parentIndex] replaces
  // statements, for example in `return a(), b`. Minifiers create these from
  // multiple statements.
  function replacesStatements(parentIndex: number): boolean {
    const parentName = stack[parentIndex]?.name;
    return (
      parentName === 'ReturnStatement' ||
      parentName === 'ThrowStatement' ||
      (parentName === 'ParenthesizedExpression' &&
        stack[parentIndex - 1]?.name === 'ArrowFunction')
    );
  }

  // The start and the name of the right operand of the binary expression for
  // which getLogicalOperator was last called.
  let rightOperandFrom = 0;
  let rightOperandName = '';

  // Returns the logical operator (`||`, `&&` or `??`) of the binary
  // expression whose first child is at the cursor, or '' for other operators.
  // Sets rightOperandFrom. The cursor stays at the first child.
  function getLogicalOperator(): string {
    if (!cursor.nextSibling()) {
      return '';
    }
    let operator = '';
    if (cursor.name === 'LogicOp' && cursor.nextSibling()) {
      rightOperandFrom = cursor.from;
      rightOperandName = cursor.name;
      cursor.prevSibling();
      operator = code.slice(cursor.from, cursor.to);
    }
    cursor.prevSibling();
    return operator;
  }

  // Whether the wrappable node `name` in code[from, to), which starts at the
  // current column, gets one line per item. For a binary expression,
  // `operator` is its logical operator.
  function isWrappedNode(
    name: string,
    from: number,
    to: number,
    operator: string
  ): boolean {
    const maxLength = MAX_LINE_LENGTH - column;
    if (operator !== '') {
      const parent = stack[stack.length - 1];
      if (parent.operator === operator && parent.from === from) {
        // This continues the chain of its parent, such as `a || b` in
        // `a || b || c`, so it's wrapped in the same way.
        return parent.isWrapped;
      }
      // If the last operand has brackets and is long enough to be split into
      // lines by itself, it doesn't count, so that it can stay on the line
      // of the operator, as in `a && (`.
      const end =
        BRACKETED_OPERANDS.has(rightOperandName) &&
        to - rightOperandFrom >= MIN_WRAPPED_LENGTH
          ? rightOperandFrom
          : to;
      const length = end - from;
      return (
        length >= MIN_WRAPPED_LENGTH &&
        column + 2 * length > MAX_LINE_LENGTH &&
        _estimateLength(code, from, end, maxLength, true) > maxLength
      );
    }
    if (name === 'SequenceExpression' && replacesStatements(stack.length - 1)) {
      // A sequence which replaces statements is split unless it has two items
      // and fits on one line, so that `s => (a = s, a)` stays on one line,
      // but the parts of `return a(), b(), c` and `return a = {x: 1}, b(a)`
      // go on their own lines. The cursor is at the first item.
      return (
        cursor.node.parent?.getChildren(',').length !== 1 ||
        _estimateLength(code, from, to, maxLength, false) > maxLength
      );
    }
    const length = to - from;
    if (
      !WRAPPABLE.has(name) ||
      length < MIN_WRAPPED_LENGTH ||
      // The estimate is at most twice the length, so this check avoids the
      // estimate for most nodes.
      column + 2 * length <= MAX_LINE_LENGTH
    ) {
      return false;
    }
    return _estimateLength(code, from, to, maxLength, true) > maxLength;
  }

  // The indentation of the items of the wrapped node stack[index], which has
  // no brackets around its items, such as `return a, b` or `a || b`. The
  // items after the first one are indented one level further, unless the
  // node is an item of a wrapped node and starts a line, as in:
  //
  //   if (
  //     a ||
  //     b
  //   )
  function itemIndent(index: number): number {
    const frame = stack[index];
    return frame.startsLine && stack[index - 1].isWrapped
      ? frame.lineIndent
      : frame.lineIndent + 1;
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
        if (grandparentName === 'ExpressionStatement') {
          // These replace statements, so they are aligned like statements.
          return parent.lineIndent;
        }
        if (replacesStatements(stack.length - 2)) {
          return parent.isWrapped ? itemIndent(stack.length - 1) : NO_BREAK;
        }
      }
    }
    if (parent.isWrapped) {
      if (parentName === 'SequenceExpression') {
        return parent.lastChild === ',' ? parent.lineIndent : NO_BREAK;
      }
      if (parentName === 'BinaryExpression') {
        if (parent.lastChild !== 'LogicOp') {
          return NO_BREAK;
        }
        // Break after each operator of a chain such as `a || b || c`, with
        // the indentation of the outermost node of the chain.
        let index = stack.length - 1;
        while (
          stack[index - 1].operator === parent.operator &&
          stack[index - 1].from === parent.from
        ) {
          index--;
        }
        return itemIndent(index);
      }
      if (parentName === 'ConditionalExpression') {
        if (name !== 'LogicOp') {
          return NO_BREAK;
        }
        // Break before the `?` and the `:`. A nested conditional expression
        // starts after a `? ` or `: ` at the start of a line, so its
        // lineIndent is already one level deeper than that line.
        return stack[stack.length - 2]?.name === 'ConditionalExpression'
          ? parent.lineIndent
          : parent.lineIndent + 1;
      }
      if (CLOSING_BRACKETS.has(name)) {
        return parent.lineIndent;
      }
      if (
        name !== ',' &&
        parent.lastChild !== null &&
        (parent.lastChild === ',' || OPENING_BRACKETS.has(parent.lastChild))
      ) {
        return parent.lineIndent + 1;
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
      column = _columnAfter(code, prevEnd, from, column);
      return;
    }
    if (!hasEmittedToken) {
      // Remove whitespace at the start of the code.
      pushWhitespace(prevEnd, from, FORMAT_WS_NONE);
      isGapDecided = true;
      column = 0;
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
    column = indent * FORMAT_INDENT.length;
    if (name === 'LogicOp' && parent.name === 'ConditionalExpression') {
      // This line starts with the `?` or `:` of a conditional expression.
      // `? ` is as wide as one level of indentation, so the code after it is
      // indented one level further, for example the arguments of a call.
      currentLineIndent++;
    }
    // Ancestors which start at the same position start on this line, too.
    for (let i = stack.length - 1; i >= 0 && stack[i].from === from; i--) {
      stack[i].lineIndent = indent;
      stack[i].startsLine = true;
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
      if (ws === FORMAT_WS_SPACE) {
        column++;
      }
    }
    // Only atomic tokens, such as template strings and comments, can contain
    // line breaks.
    column = ATOMIC.has(name)
      ? _columnAfter(code, from, to, column)
      : column + (to - from);
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
    const parent = stack[stack.length - 1];
    // Skip empty nodes, such as the error nodes that Lezer inserts.
    if (to > from) {
      handleLineBreakBefore(name, from, parent);
      if (!ATOMIC.has(name) && cursor.firstChild()) {
        const operator =
          name === 'BinaryExpression' ? getLogicalOperator() : '';
        stack.push({
          name,
          from,
          lineIndent: currentLineIndent,
          startsLine: column === currentLineIndent * FORMAT_INDENT.length,
          hasContent: false,
          lastChild: null,
          isWrapped: isWrappedNode(name, from, to, operator),
          operator,
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
 * Formats the code.
 */
export function formatJsCode(code: string, dialect: JsDialect): FormatEdits {
  const tree = parserForDialect(dialect).parse(code);
  return computeFormatEdits(code, tree);
}
