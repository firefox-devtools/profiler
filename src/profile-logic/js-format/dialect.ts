/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Lezer dialect helpers. This module must not import @lezer/javascript, so
 * that the main bundle can use it without pulling in the parser.
 */

// @lezer/javascript ships TS and JSX as opt-in dialects. The base parser only
// understands plain JS, so a `.ts` or `.tsx` source produces Error nodes for
// every type annotation or JSX element unless the matching dialect is used.
export type JsDialect = '' | 'ts' | 'jsx' | 'ts jsx';

// The dialect for finding the functions in a source. Svelte and Vue
// components aren't JS, but the JS in them can be parsed after masking the
// markup, see component-markup.ts.
export type SourceDialect = JsDialect | 'svelte' | 'vue';

/**
 * Map a source filename to the Lezer dialect needed to parse it. Looks at the
 * file extension only. Accepts URL-style source paths (the typical content of
 * a source map's `sources[]`).
 *
 * Files that aren't TypeScript are parsed as JSX, because React code often
 * uses JSX in .js files. This is safe for plain JS: JSX elements can only
 * start where an expression starts, and plain JS never has a `<` there.
 */
export function dialectForFilename(filename: string): SourceDialect {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.svelte')) {
    return 'svelte';
  }
  if (lower.endsWith('.vue')) {
    return 'vue';
  }
  if (lower.endsWith('.tsx')) {
    return 'ts jsx';
  }
  if (lower.endsWith('.jsx')) {
    return 'jsx';
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  ) {
    return 'ts';
  }
  return 'jsx';
}

const NON_JS_EXTENSIONS = [
  '.rs',
  '.c',
  '.cc',
  '.cpp',
  '.cxx',
  '.h',
  '.hpp',
  '.m',
  '.mm',
  '.json',
];

/**
 * Returns the dialect to use for finding the functions in the source at this
 * path, or null if the source doesn't contain JavaScript. Like the syntax
 * highlighting in the source view, this treats unknown file types as
 * JavaScript, because inline scripts share the page URL and don't have a .js
 * extension.
 */
export function getSourceDialectForPath(path: string): SourceDialect | null {
  const lower = path.toLowerCase();
  if (NON_JS_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return null;
  }
  return dialectForFilename(lower);
}

/**
 * Returns the dialect to use for pretty-printing the whole source at this
 * path, or null if it can't be pretty-printed. Svelte and Vue components can't
 * be pretty-printed, because the formatter replaces the text between JS
 * tokens, and in a component, that text includes the markup.
 */
export function getFormatDialectForPath(path: string): JsDialect | null {
  const dialect = getSourceDialectForPath(path);
  return dialect === 'svelte' || dialect === 'vue' ? null : dialect;
}
