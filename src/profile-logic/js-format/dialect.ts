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
 * Returns the dialect to use for formatting the source at this path, or null
 * if the source isn't JavaScript. Like the syntax highlighting in the source
 * view, this treats unknown file types as JavaScript, because inline scripts
 * share the page URL and don't have a .js extension.
 */
export function getFormatDialectForPath(path: string): JsDialect | null {
  const lower = path.toLowerCase();
  if (NON_JS_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
    return null;
  }
  return dialectForFilename(lower);
}
