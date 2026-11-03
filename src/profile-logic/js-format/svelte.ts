/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Turns a Svelte component into JS that the Lezer JS parser can parse, without
 * moving any of the JS code. This module must not import @lezer/javascript,
 * see dialect.ts.
 *
 * A Svelte component is markup with JS in two places: in <script> elements,
 * and in template expressions such as `{count}` or
 * `on:click={() => count++}`. The masked code keeps the JS at the same
 * offsets, and replaces everything else with spaces. Line breaks are kept, so
 * that the masked code has the same lines as the component. As a result,
 * the syntax tree of the masked code can be used with the original code.
 *
 * Template expressions become parenthesized expression statements:
 *   on:click={() => count++}   ->   ;(() => count++)
 * The `;` replaces the character before the `{`, so that the expression isn't
 * parsed as a call of the code before it. Otherwise, `let x = f` followed by
 * a template arrow would turn the arrow into an argument of `f`, and the
 * arrow would get the name `x`.
 *
 * Block tags such as `{#if cond}`, `{:else}`, `{/each}` and `{@html html}`
 * aren't JS, so they're masked completely. This also masks the expressions in
 * them, for example the condition of an `{#if}`. Style elements and HTML
 * comments are masked too.
 */

function _isBlockTagStart(char: string): boolean {
  return char === '#' || char === ':' || char === '/' || char === '@';
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
 * Returns the index after the `}` that matches the `{` at `start`, or null if
 * there's no matching `}`.
 */
function _findTemplateExpressionEnd(
  code: string,
  start: number
): number | null {
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
        return i + 1;
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

export function maskSvelteMarkup(code: string): string {
  const lowerCode = code.toLowerCase();
  // Masked characters become spaces, except for line breaks.
  const masked = code.replace(/[^\r\n]/g, ' ').split('');
  const keep = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      masked[i] = code[i];
    }
  };

  let i = 0;
  while (i < code.length) {
    const char = code[i];
    if (char === '<') {
      if (lowerCode.startsWith('<!--', i)) {
        const end = code.indexOf('-->', i + 4);
        i = end === -1 ? code.length : end + 3;
        continue;
      }
      const element = /^<(script|style)[\s>]/.exec(lowerCode.slice(i, i + 8));
      if (element !== null) {
        const contentStart = _findTagEnd(code, i);
        let contentEnd = lowerCode.indexOf(`</${element[1]}`, contentStart);
        if (contentEnd === -1) {
          contentEnd = code.length;
        }
        if (element[1] === 'script') {
          keep(contentStart, contentEnd);
          // Separate the script from any template expression before it.
          masked[contentStart - 1] = ';';
        }
        i = _findTagEnd(code, contentEnd);
        continue;
      }
    } else if (char === '{') {
      const end = _findTemplateExpressionEnd(code, i);
      if (end === null) {
        break;
      }
      if (!_isBlockTagStart(code[i + 1])) {
        keep(i + 1, end - 1);
        masked[i] = '(';
        masked[end - 1] = ')';
        // The only kept character that can come right before a `{` is the
        // `)` of the template expression before it, as in `{a}{b}`. Then
        // there's no room for the `;`. That's fine, because `(a)(b)` doesn't
        // give a name to the functions in b.
        if (i > 0 && masked[i - 1] !== ')') {
          masked[i - 1] = ';';
        }
      }
      i = end;
      continue;
    }
    i++;
  }
  return masked.join('');
}
