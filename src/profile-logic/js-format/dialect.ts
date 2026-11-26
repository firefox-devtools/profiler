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

/**
 * Map a source filename to the Lezer dialect needed to parse it. Looks at the
 * file extension only. Accepts URL-style source paths (the typical content of
 * a source map's `sources[]`).
 *
 * Files that aren't TypeScript are parsed as JSX, because React code often
 * uses JSX in .js files. This is safe for plain JS: JSX elements can only
 * start where an expression starts, and plain JS never has a `<` there.
 */
export function dialectForFilename(filename: string): JsDialect {
  const lower = filename.toLowerCase();
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

const JS_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.jsm',
  '.jsx',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
];

// Extensions of pages whose inline scripts can be pretty-printed. An inline
// script has the URL of its page as its path.
const PAGE_EXTENSIONS = [
  '.html',
  '.htm',
  '.xhtml',
  '.xht',
  '.shtml',
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
];

// Matches the scheme of a URL, like https:, chrome:, about: or webpack:.
// Requiring two characters keeps Windows drive letters out.
const URL_SCHEME_REGEXP = /^[a-z][a-z0-9+.-]+:/;

/**
 * Returns the dialect to use for formatting the source at this path, or null
 * if the source isn't JavaScript. Files with a JS or TS extension can be
 * formatted. URLs that look like pages, with a page extension or none at all,
 * can be formatted too, because they are the paths of inline scripts.
 *
 * Svelte and Vue components aren't formatted even though they contain JS,
 * because the formatter replaces the text between JS tokens, and in a
 * component, that text includes the markup.
 */
export function getFormatDialectForPath(path: string): JsDialect | null {
  let lower = path.toLowerCase();
  const isUrl = URL_SCHEME_REGEXP.test(lower);
  if (isUrl) {
    lower = lower.replace(/[?#].*$/, '');
  }
  const fileName = lower.slice(lower.lastIndexOf('/') + 1);
  const dotIndex = fileName.lastIndexOf('.');
  const extension = dotIndex === -1 ? '' : fileName.slice(dotIndex);
  if (JS_EXTENSIONS.includes(extension)) {
    return dialectForFilename(fileName);
  }
  if (isUrl && (extension === '' || PAGE_EXTENSIONS.includes(extension))) {
    return 'jsx';
  }
  return null;
}
