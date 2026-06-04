/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parse and serialize Nonymous function names as produced by SpiderMonkey's
 * NameFunctions pass:
 * https://searchfox.org/firefox-main/rev/1f7030c8de8f2b349c7d91d7b5a3253c109a1cc1/js/src/frontend/NameFunctions.cpp
 *
 * Nonymous algorithm: https://johnjbarton.github.io/nonymous/index.html
 *
 * The format uses '/' as a scope separator and '<' as a "contributes-to"
 * marker for anonymous functions. Examples:
 *   "foo"          - named function assigned to `foo`
 *   "foo<"         - function contributing to `foo` (e.g. passed as arg)
 *   "obj.method"   - method on an object
 *   "outer/inner"  - `inner` defined inside `outer`
 *   "outer/inner<" - anonymous inside `outer`, contributing to `inner`
 *   "outer/<"      - anonymous inside `outer`, no assignment context
 *   "i2</fr/<"     - anonymous inside `fr`, inside anonymous-contributing-to-`i2`
 *
 * SpiderMonkey does NOT produce call-site arg summaries (the `callee(summary)`
 * form from the original 2011 Nonymous paper). This module only handles what
 * Gecko actually emits.
 */

// One component of a /-separated Nonymous name.
export type NonymousSegment =
  // A segment with an identifier or property chain, optionally marked '<'.
  // contributesTo: the trailing '<', meaning the function contributes to
  // (but doesn't own) the named context, e.g. a callback argument.
  | { kind: 'named'; name: string; contributesTo: boolean }
  // A bare '<': no assignment context was found. The function is purely
  // anonymous inside an outer named scope.
  | { kind: 'anonymous' };

// Segments from outermost scope to innermost local. The last element is the
// function's own segment; everything before it is enclosing scope.
export type NonymousName = NonymousSegment[];

function _parseSegment(s: string): NonymousSegment {
  if (s === '<' || s === '') {
    return { kind: 'anonymous' };
  }
  if (s.endsWith('<')) {
    return { kind: 'named', name: s.slice(0, -1), contributesTo: true };
  }
  return { kind: 'named', name: s, contributesTo: false };
}

function _serializeSegment(seg: NonymousSegment): string {
  if (seg.kind === 'anonymous') {
    return '<';
  }
  return seg.contributesTo ? seg.name + '<' : seg.name;
}

export function parseNonymousName(s: string): NonymousName {
  return s.split('/').map(_parseSegment);
}

export function serializeNonymousName(name: NonymousName): string {
  return name.map(_serializeSegment).join('/');
}
