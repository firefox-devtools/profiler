/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  parseJsScopeTree,
  findInnermostFunctionScope,
  dialectForFilename,
} from '../../profile-logic/source-map-scope-tree';

describe('parseJsScopeTree', () => {
  it('returns an empty array for empty source', () => {
    const scopes = parseJsScopeTree('');
    expect(scopes).toHaveLength(0);
  });

  it('handles invalid JS without throwing', () => {
    expect(() =>
      parseJsScopeTree('this is not valid javascript !!!')
    ).not.toThrow();
  });

  it('parses a named function declaration', () => {
    const src = 'function foo() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.start).toBe(0);
    expect(fn.end).toBe(src.length);
    expect(fn.astName).toBe('foo');
    expect(fn.kind).toBe('function');
    // nameMappingLocations: [namePos, parenPos]
    expect(fn.nameMappingLocations).toHaveLength(2);
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // start of 'foo'
    expect(src[fn.nameMappingLocations[1]]).toBe('('); // paren
  });

  it('parses a parenthesised arrow function with two locations', () => {
    // ArrowFunction created directly (not through VariableDeclarator).
    const src = '[(x) => x]';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBeNull();
    // nameMappingLocations: [parenPos, arrowPos ('=')]
    expect(fn.nameMappingLocations).toHaveLength(2);
    expect(src[fn.nameMappingLocations[0]]).toBe('(');
    expect(src[fn.nameMappingLocations[1]]).toBe('=');
    expect(src[fn.nameMappingLocations[1] + 1]).toBe('>'); // confirm it's =>
  });

  it('parses an anonymous function assigned to a variable', () => {
    const src = 'const foo = function() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBeNull();
    expect(fn.kind).toBe('function');
    // nameMappingLocations: [parenPos, identifierPos]
    // identifier ('foo') comes last
    expect(fn.nameMappingLocations).toHaveLength(2);
    expect(src[fn.nameMappingLocations[0]]).toBe('(');
    expect(src[fn.nameMappingLocations[1]]).toBe('f'); // start of 'foo'
    // identifier loc must be before paren loc (foo comes before function)
    expect(fn.nameMappingLocations[1]).toBeLessThan(fn.nameMappingLocations[0]);
  });

  it('uses the arrow pos and identifier pos for arrow assigned to variable', () => {
    const src = 'const foo = (x) => x';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBeNull();
    // nameMappingLocations: [parenPos, arrowPos, identifierPos('foo')]
    expect(fn.nameMappingLocations).toHaveLength(3);
    expect(src[fn.nameMappingLocations[0]]).toBe('(');
    expect(src[fn.nameMappingLocations[1]]).toBe('=');
    expect(src[fn.nameMappingLocations[2]]).toBe('f'); // start of 'foo'
  });

  it('parses a single-param unparenthesised arrow with only the arrow location', () => {
    // No `(` before `x` → no paren loc. Only arrow loc.
    const src = '[x => x]';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    // nameMappingLocations: [arrowPos] only. No paren
    expect(fn.nameMappingLocations).toHaveLength(1);
    expect(src[fn.nameMappingLocations[0]]).toBe('=');
    expect(src[fn.nameMappingLocations[0] + 1]).toBe('>');
  });

  it('prepends the key location for a method in an object literal', () => {
    const src = 'const o = { foo() {} }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBe('foo');
    expect(fn.kind).toBe('function');
    // nameMappingLocations: [keyPos('foo'), parenPos]
    expect(fn.nameMappingLocations.length).toBeGreaterThanOrEqual(1);
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // start of 'foo'
  });

  it('prepends the key location for a named FunctionExpression property', () => {
    const src = 'const o = { foo: function() {} }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBe('foo');
    expect(fn.kind).toBe('function');
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // key 'foo'
    expect(src[fn.nameMappingLocations[1]]).toBe('('); // paren
  });

  it('marks an arrow-valued property as kind arrow', () => {
    const src = 'const o = { foo: (x) => x }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBe('foo');
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // key
    expect(src[fn.nameMappingLocations[1]]).toBe('('); // arrow paren
    expect(src[fn.nameMappingLocations[2]]).toBe('='); // arrow =>
  });

  it('parses a private class method with # in astName', () => {
    const src = 'class C { #foo() {} }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBe('#foo');
    expect(fn.kind).toBe('function');
    expect(src[fn.nameMappingLocations[0]]).toBe('#');
  });

  it('does not create a scope for a shorthand property', () => {
    const src = 'const o = { a, b }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(0);
  });

  it('creates no scope for an empty computed method', () => {
    // Computed key `{ [k]() {} }`: no stable key location → we walk the body
    // but find no nested functions, so no scopes are created.
    const src = 'const k = "foo"; const o = { [k]() {} }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(0);
  });

  it('finds nested functions inside a computed method body', () => {
    const src = 'const o = { [k]() { function inner() {} } }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].astName).toBe('inner');
  });

  it('nests child scopes inside the parent scope', () => {
    const src = 'function outer() { function inner() {} }';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const outer = scopes[0];
    expect(outer.astName).toBe('outer');
    expect(outer.children).toHaveLength(1);

    const inner = outer.children[0];
    expect(inner.astName).toBe('inner');
    expect(inner.children).toHaveLength(0);
  });

  it('gives a named function expression its own astName', () => {
    // `const foo = function bar() {}` → astName = 'bar', not inferred from foo.
    const src = 'const foo = function bar() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBe('bar');
    expect(fn.kind).toBe('function');
  });

  it('infers name from assignment target for `obj.foo = function() {}`', () => {
    const src = 'obj.foo = function() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.astName).toBeNull();
    expect(fn.kind).toBe('function');
    // Last nameMappingLocation should point to 'foo' in obj.foo
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('f'); // 'foo'
  });

  it('does not mark direct assignment as contributesTo', () => {
    // `const foo = arrow`. The arrow IS `foo`, so no `<`.
    const src = 'const foo = () => {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].contributesTo).toBe(false);
  });

  it('does not mark plain function declarations as contributesTo', () => {
    const src = 'function foo() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].contributesTo).toBe(false);
  });

  it('infers name through `new` for `var observer = new C((entries) => {})`', () => {
    const src = 'const observer = new IntersectionObserver((entries) => {})';
    const scopes = parseJsScopeTree(src);
    // Only one scope: the arrow argument of `new`. No plain anonymous scope.
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBeNull();
    expect(fn.contributesTo).toBe(true);
    // The last nameMappingLocation should be the start of `observer`.
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('o'); // start of 'observer'
    expect(src.slice(lastLoc, lastLoc + 8)).toBe('observer');
  });

  it('infers name through call for `var x = wrap(() => {})`', () => {
    const src = 'const cb = wrap(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('c'); // start of 'cb'
    expect(src.slice(lastLoc, lastLoc + 2)).toBe('cb');
  });

  it('infers names for every function arg of a wrap call', () => {
    const src = 'const x = wrap(() => 1, () => 2)';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(2);

    for (const fn of scopes) {
      expect(fn.kind).toBe('arrow');
      expect(fn.contributesTo).toBe(true);
      const lastLoc =
        fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
      expect(src[lastLoc]).toBe('x');
    }
  });

  it('peels parens around an arrow init: `var x = ((y) => y)`', () => {
    // Parens are pure-syntactic: the arrow still IS x, so contributesTo=false.
    const src = 'const x = ((y) => y)';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(false);
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('x');
  });

  it('does not infer for a named FunctionExpression argument', () => {
    // `const x = wrap(function bar() {})`. `bar` keeps its own name, so the
    // scope must not be marked contributesTo and must carry astName = 'bar'.
    const src = 'const x = wrap(function bar() {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('function');
    expect(fn.astName).toBe('bar');
    expect(fn.contributesTo).toBe(false);
  });

  it('does not infer through arbitrary expressions: `var x = obj.prop`', () => {
    // A non-wrap expression should not propagate the identifier into nested
    // functions. Only direct values, ParenthesizedExpression,
    // CallExpression and NewExpression do.
    const src = 'const x = obj[(() => 0)()]';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);
    expect(scopes[0].contributesTo).toBe(false);
  });

  it('infers through `obj.foo = new C(() => {})`', () => {
    const src = 'obj.foo = new IntersectionObserver(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('f'); // start of 'foo'
  });

  it('infers through nested wrappers: `var x = wrap1(wrap2(() => {}))`', () => {
    const src = 'const x = a(b(() => {}))';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('x');
  });

  it('does not infer for compound assignments: `x += () => 0`', () => {
    const src = 'x += () => 0';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(false);
  });

  it('direct member assignment is not contributesTo: `obj.foo = arrow`', () => {
    // `obj.foo = arrow`. The arrow IS obj.foo, so contributesTo=false.
    const src = 'obj.foo = () => {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(false);
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('f'); // start of 'foo'
  });

  it('computed-member assignment sets computedKeyLoc: `obj[key] = arrow`', () => {
    // `obj[key] = arrow`. The arrow IS obj[key], so contributesTo=false.
    // computedKeyLoc points to the start of `key` so the resolver can build
    // a compound `${receiver}[${key}]` name.
    const src = 'obj[key] = (...args) => f(...args)';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(false);
    // Last name mapping location = start of the receiver `obj`.
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('o'); // start of 'obj'
    // computedKeyLoc = start of `key`.
    expect(fn.computedKeyLoc).not.toBeNull();
    expect(src[fn.computedKeyLoc!]).toBe('k'); // start of 'key'
    expect(src.slice(fn.computedKeyLoc!, fn.computedKeyLoc! + 3)).toBe('key');
  });

  it('keeps contributesTo through wrapper for `obj[key] = wrap(arrow)`', () => {
    // Wrapping with a call still bumps contributesTo to true, while
    // computedKeyLoc still tracks the bracket-key.
    const src = 'obj[key] = wrap(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.contributesTo).toBe(true);
    expect(fn.computedKeyLoc).not.toBeNull();
  });

  it('preserves astName on named function expressions: `const x = function bar() {}`', () => {
    // The function's own name `bar` must win over the inferred variable name.
    // The resolver also looks this up in the *original* source so esbuild's
    // name-stripped minified output still recovers `bar` at symbolication time.
    const src = 'const x = function bar() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('function');
    expect(fn.astName).toBe('bar');
    expect(fn.contributesTo).toBe(false);
  });

  it('does not set computedKeyLoc for non-computed LHS', () => {
    expect(parseJsScopeTree('const x = () => {}')[0].computedKeyLoc).toBeNull();
    expect(parseJsScopeTree('obj.foo = () => {}')[0].computedKeyLoc).toBeNull();
  });

  it('captures lhsText for a simple variable assignment', () => {
    const src = 'const foo = () => {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes[0].lhsText).toBe('foo');
  });

  it('captures lhsText for a dotted member assignment', () => {
    const src = 'Watcher.prototype.run = function () {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes[0].lhsText).toBe('Watcher.prototype.run');
  });

  it('captures lhsText for a computed member assignment', () => {
    const src = 'obj[key] = (...args) => f(...args)';
    const scopes = parseJsScopeTree(src);
    expect(scopes[0].lhsText).toBe('obj[key]');
  });

  it('captures lhsText for a wrap-pattern assignment', () => {
    // The wrap wrapper doesn't change the LHS. The lhsText is still the
    // assignment target, even though contributesTo is true.
    const src = 'const observer = new C(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes[0].lhsText).toBe('observer');
    expect(scopes[0].contributesTo).toBe(true);
  });

  it('captures lhsText for `this.foo = ...`', () => {
    const src = 'this.handler = function () {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes[0].lhsText).toBe('this.handler');
  });

  it('does not set lhsText for non-inferred scopes', () => {
    // Plain function declarations / arrows without an assignment target
    // shouldn't carry lhsText.
    expect(parseJsScopeTree('function foo() {}')[0].lhsText).toBeNull();
    expect(parseJsScopeTree('[x => x]')[0].lhsText).toBeNull();
  });

  it('captures lhsText for `const foo = async function (data) {}`', () => {
    // Regression: there was a window where the resolver picked "async" as the
    // function name (via a funcOffset probe landing on the `async` keyword).
    // The inferred scope must carry the variable name as lhsText so the
    // original-source lookup short-circuits the compiled-side probes.
    const src = 'const getElementRects = async function (data) {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('function');
    expect(fn.astName).toBeNull();
    expect(fn.lhsText).toBe('getElementRects');
    expect(fn.contributesTo).toBe(false);
  });

  it('captures lhsText for `const foo = async (x) => x`', () => {
    const src = 'const getElementRects = async (data) => data';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBeNull();
    expect(fn.lhsText).toBe('getElementRects');
  });

  it('infers name through optional call: `const cb = wrap?.(() => {})`', () => {
    // Optional calls share the `CallExpression` node in @lezer/javascript, so
    // they should already get wrap-pattern inference.
    const src = 'const cb = wrap?.(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    expect(fn.lhsText).toBe('cb');
  });

  it('infers name through await: `const x = await wrap(() => {})`', () => {
    const src = 'const x = await wrap(() => {})';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    expect(fn.lhsText).toBe('x');
  });

  it('infers name through tagged template: `const x = tag`${() => {}}``', () => {
    const src = 'const x = tag`a${() => {}}b`';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(1);

    const fn = scopes[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.contributesTo).toBe(true);
    expect(fn.lhsText).toBe('x');
  });

  it('infers names for every interpolated arrow in a tagged template', () => {
    const src = 'const x = tag`a${() => 1}b${() => 2}c`';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(2);

    for (const fn of scopes) {
      expect(fn.kind).toBe('arrow');
      expect(fn.contributesTo).toBe(true);
      expect(fn.lhsText).toBe('x');
    }
  });

  it('parses a TypeScript function with type annotations using the ts dialect', () => {
    // Without the `ts` dialect, the parameter and return type annotations
    // produce Error nodes that prevent astName recovery.
    const src = 'function foo(x: number, y: string): void { return; }';
    const scopes = parseJsScopeTree(src, 'ts');
    expect(scopes).toHaveLength(1);
    expect(scopes[0].astName).toBe('foo');
    expect(scopes[0].kind).toBe('function');
  });

  it('parses a TSX arrow returning JSX with the `ts jsx` dialect', () => {
    const src =
      'const Foo = (props: { name: string }) => <div>{props.name}</div>;';
    const scopes = parseJsScopeTree(src, 'ts jsx');
    expect(scopes).toHaveLength(1);
    expect(scopes[0].kind).toBe('arrow');
    expect(scopes[0].lhsText).toBe('Foo');
  });
});

describe('dialectForFilename', () => {
  it('returns ts for .ts/.mts/.cts', () => {
    expect(dialectForFilename('foo.ts')).toBe('ts');
    expect(dialectForFilename('foo.mts')).toBe('ts');
    expect(dialectForFilename('foo.cts')).toBe('ts');
  });

  it('returns ts jsx for .tsx', () => {
    expect(dialectForFilename('foo.tsx')).toBe('ts jsx');
  });

  it('returns jsx for .jsx', () => {
    expect(dialectForFilename('foo.jsx')).toBe('jsx');
  });

  it('returns empty string for plain js extensions', () => {
    expect(dialectForFilename('foo.js')).toBe('');
    expect(dialectForFilename('foo.mjs')).toBe('');
    expect(dialectForFilename('noext')).toBe('');
  });

  it('matches case-insensitively', () => {
    expect(dialectForFilename('FOO.TSX')).toBe('ts jsx');
    expect(dialectForFilename('Bar.TS')).toBe('ts');
  });

  it('handles URL-style source paths', () => {
    expect(dialectForFilename('webpack:///./src/utils.ts')).toBe('ts');
    expect(dialectForFilename('../src/Component.tsx')).toBe('ts jsx');
  });
});

describe('findInnermostFunctionScope', () => {
  it('returns null when no scope contains the offset', () => {
    const src = 'const x = 1;';
    const scopes = parseJsScopeTree(src);
    expect(findInnermostFunctionScope(scopes, 0)).toBeNull();
  });

  it('finds the innermost scope for a nested function', () => {
    const src = 'function outer() { function inner() {} }';
    const scopes = parseJsScopeTree(src);

    // Offset inside 'inner'. Pick a position inside `function inner() {}`
    // 'inner' starts at 28 in the source
    const innerOffset = src.indexOf('inner');
    const path = findInnermostFunctionScope(scopes, innerOffset);
    expect(path).not.toBeNull();
    expect(path![0].astName).toBe('inner');
    expect(path![1].astName).toBe('outer');
  });

  it('finds the second of several non-overlapping top-level scopes', () => {
    // Exercises the bisection: three siblings, offset inside the second.
    const src = 'function a() {} function b() {} function c() {}';
    const scopes = parseJsScopeTree(src);
    expect(scopes).toHaveLength(3);

    const bOffset = src.indexOf('function b');
    const path = findInnermostFunctionScope(scopes, bOffset);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(1);
    expect(path![0].astName).toBe('b');
  });

  it('returns null for an offset between two sibling scopes', () => {
    const src = 'function a() {}  function b() {}';
    const scopes = parseJsScopeTree(src);
    // Position 15 is the space between the two functions.
    expect(findInnermostFunctionScope(scopes, 15)).toBeNull();
  });
});
