/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Turns a Svelte or Vue component into JS that the Lezer JS parser can parse,
 * without moving any of the JS code. This module must not import
 * @lezer/javascript, see dialect.ts.
 *
 * A component is markup with JS in <script> elements and in template
 * expressions. The masked code keeps the JS at the same offsets, and replaces
 * everything else with spaces. Line breaks are kept, so that the masked code
 * has the same lines as the component. As a result, the syntax tree of the
 * masked code can be used with the original code.
 *
 * Template expressions become parenthesized expression statements:
 *   on:click={() => count++}   ->   ;(() => count++)
 * The `;` replaces a masked character before the expression, so that the
 * expression isn't parsed as a call of the code before it. Otherwise,
 * `let x = f` followed by a template arrow would turn the arrow into an
 * argument of `f`, and the arrow would get the name `x`.
 *
 * Style elements and HTML comments are masked completely.
 */

class Masker {
  code: string;
  lowerCode: string;
  _masked: string[];

  constructor(code: string) {
    this.code = code;
    this.lowerCode = code.toLowerCase();
    // Masked characters become spaces, except for line breaks.
    this._masked = code.replace(/[^\r\n]/g, ' ').split('');
  }

  keep(from: number, to: number) {
    for (let i = from; i < to; i++) {
      this._masked[i] = this.code[i];
    }
  }

  isMasked(from: number, to: number): boolean {
    for (let i = from; i < to; i++) {
      const char = this._masked[i];
      if (char !== ' ' && char !== '\n' && char !== '\r') {
        return false;
      }
    }
    return true;
  }

  set(index: number, text: string) {
    for (let i = 0; i < text.length; i++) {
      this._masked[index + i] = text[i];
    }
  }

  /**
   * Keeps the expression in code[from..to] as `;(expression)`, using the two
   * characters before it and the character after it. The `;` is left out if
   * the character before it was kept, which is only the case for the `)` of
   * an expression right before this one, as in Svelte's `{a}{b}`. That's
   * fine, because `(a)(b)` doesn't give a name to the functions in b.
   */
  keepExpression(from: number, to: number) {
    this.keep(from, to);
    this.set(from - 1, '(');
    this.set(to, ')');
    if (from > 1 && this.isMasked(from - 2, from - 1)) {
      this.set(from - 2, ';');
    }
  }

  result(): string {
    return this._masked.join('');
  }
}

/**
 * Returns the index after the string or template literal that starts at
 * `start`, or the length of the code if it isn't terminated. Expressions in
 * template literals aren't parsed. A `}` in them doesn't end the template
 * expression, because the whole literal is skipped.
 */
function _skipString(code: string, start: number): number {
  const quote = code[start];
  let i = start + 1;
  while (i < code.length && code[i] !== quote) {
    if (code[i] === '\\') {
      i++;
    }
    i++;
  }
  return Math.min(i + 1, code.length);
}

/**
 * Returns the index of the `}` that matches the `{` at `start`, or null if
 * there's no matching `}`.
 */
function _findClosingBrace(code: string, start: number): number | null {
  let depth = 0;
  let i = start;
  while (i < code.length) {
    const char = code[i];
    if (char === '"' || char === "'" || char === '`') {
      i = _skipString(code, i);
      continue;
    }
    if (char === '{') {
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  return null;
}

/**
 * Returns the index after the `>` of the tag that starts at `start`. The
 * attributes of <script> and <style> tags don't contain `>` in practice.
 */
function _findTagEnd(code: string, start: number): number {
  const end = code.indexOf('>', start);
  return end === -1 ? code.length : end + 1;
}

/**
 * Handles the markup at `start` that is the same in Svelte and Vue: HTML
 * comments, and <script> and <style> elements. The content of <script>
 * elements is kept. Returns the index after the markup, or null if there's
 * none of these at `start`.
 */
function _maskCommonMarkup(masker: Masker, start: number): number | null {
  const { code, lowerCode } = masker;
  if (lowerCode.startsWith('<!--', start)) {
    const end = code.indexOf('-->', start + 4);
    return end === -1 ? code.length : end + 3;
  }
  const element = /^<(script|style)[\s>]/.exec(
    lowerCode.slice(start, start + 8)
  );
  if (element === null) {
    return null;
  }
  const contentStart = _findTagEnd(code, start);
  let contentEnd = lowerCode.indexOf(`</${element[1]}`, contentStart);
  if (contentEnd === -1) {
    contentEnd = code.length;
  }
  if (element[1] === 'script') {
    masker.keep(contentStart, contentEnd);
    // Separate the script from any template expression before it.
    masker.set(contentStart - 1, ';');
  }
  return _findTagEnd(code, contentEnd);
}

/**
 * Masks the markup of a Svelte component.
 *
 * In Svelte, any `{` outside of <script> and <style> starts a template
 * expression, in text and in attributes alike. Block tags such as
 * `{#if cond}`, `{:else}`, `{/each}` and `{@html html}` aren't JS, so they're
 * masked completely. This also masks the expressions in them, for example the
 * condition of an `{#if}`.
 */
export function maskSvelteMarkup(code: string): string {
  const masker = new Masker(code);
  let i = 0;
  while (i < code.length) {
    const char = code[i];
    if (char === '<') {
      const end = _maskCommonMarkup(masker, i);
      if (end !== null) {
        i = end;
        continue;
      }
    } else if (char === '{') {
      const closingBrace = _findClosingBrace(code, i);
      if (closingBrace === null) {
        break;
      }
      if (!'#:/@'.includes(code[i + 1])) {
        masker.keepExpression(i + 1, closingBrace);
      }
      i = closingBrace + 1;
      continue;
    }
    i++;
  }
  return masker.result();
}

// Vue directives whose value isn't an expression: v-for has its own syntax,
// v-slot's value is a pattern for the slot props, and the others don't have
// a value.
const VUE_NON_EXPRESSION_DIRECTIVES = new Set([
  'v-for',
  'v-slot',
  'v-else',
  'v-pre',
  'v-once',
  'v-cloak',
]);

// The text that replaces the masked characters before an event handler, see
// _maskVueAttribute.
const VUE_HANDLER_PREFIX = ';()=>{';

/**
 * Keeps the JS in the value of a Vue attribute, which is in
 * code[valueStart..valueEnd].
 *
 * Event handlers such as `@click="count++"` become arrow functions, because
 * Vue compiles them to functions, which map to the attribute value:
 *   @click="count++"   ->   ;()=>{count++}
 * This works for all kinds of handlers: statements, method names, and
 * functions such as `@click="(event) => select(event)"`. In the last case,
 * the arrow in the attribute is found as the innermost function.
 */
function _maskVueAttribute(
  masker: Masker,
  name: string,
  valueStart: number,
  valueEnd: number
) {
  const { code } = masker;
  if (name.startsWith('@') || name.startsWith('v-on')) {
    const prefixStart = valueStart - VUE_HANDLER_PREFIX.length;
    if (masker.isMasked(prefixStart, valueStart)) {
      masker.keep(valueStart, valueEnd);
      masker.set(prefixStart, VUE_HANDLER_PREFIX);
      masker.set(valueEnd, '}');
    } else {
      masker.keepExpression(valueStart, valueEnd);
    }
    return;
  }
  if (name === 'v-for') {
    // `item in items` or `(item, index) of items`: only keep the source.
    const match = /\s(?:in|of)\s+/.exec(code.slice(valueStart, valueEnd));
    if (match !== null) {
      masker.keepExpression(
        valueStart + match.index + match[0].length,
        valueEnd
      );
    }
    return;
  }
  const directive = name.split(':')[0];
  if (
    name.startsWith(':') ||
    (directive.startsWith('v-') &&
      !VUE_NON_EXPRESSION_DIRECTIVES.has(directive))
  ) {
    masker.keepExpression(valueStart, valueEnd);
  }
}

/**
 * Masks the tag that starts at `start`, and keeps the JS in the values of its
 * attributes. Returns the index after the tag.
 */
function _maskVueTag(masker: Masker, start: number): number {
  const { code } = masker;
  const attributeRegExp =
    /\s*([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|[^\s>]+))?|\s*\/?>/y;
  // Skip the tag name.
  let i = start + 1;
  while (i < code.length && !/[\s/>]/.test(code[i])) {
    i++;
  }
  while (i < code.length) {
    attributeRegExp.lastIndex = i;
    const match = attributeRegExp.exec(code);
    if (match === null) {
      // For example a lone `/` or `=`.
      i++;
      continue;
    }
    i = attributeRegExp.lastIndex;
    if (match[1] === undefined) {
      // The end of the tag.
      return i;
    }
    const value = match[2] ?? match[3];
    if (value !== undefined) {
      // The value is quoted, so it ends right before the closing quote.
      const valueEnd = i - 1;
      _maskVueAttribute(masker, match[1], valueEnd - value.length, valueEnd);
    }
  }
  return i;
}

/**
 * Masks the markup of a Vue single-file component. The JS is in the values of
 * directives such as `:title="title"`, `v-if="visible"` and
 * `@click="select()"`, and in interpolations such as `{{ count }}`.
 */
export function maskVueMarkup(code: string): string {
  const masker = new Masker(code);
  let i = 0;
  while (i < code.length) {
    if (code[i] === '<') {
      const end = _maskCommonMarkup(masker, i);
      if (end !== null) {
        i = end;
        continue;
      }
      if (/[a-zA-Z]/.test(code[i + 1] ?? '')) {
        i = _maskVueTag(masker, i);
        continue;
      }
    } else if (code.startsWith('{{', i)) {
      const closingBrace = _findClosingBrace(code, i + 1);
      if (closingBrace === null || code[closingBrace + 1] !== '}') {
        i += 2;
        continue;
      }
      masker.keepExpression(i + 2, closingBrace);
      i = closingBrace + 2;
      continue;
    }
    i++;
  }
  return masker.result();
}
