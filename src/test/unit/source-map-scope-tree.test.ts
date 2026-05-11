/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  parseJsScopeTree,
  findInnermostFunctionScope,
} from '../../profile-logic/source-map-scope-tree';

describe('parseJsScopeTree', () => {
  it('returns a root with no children for empty source', () => {
    const root = parseJsScopeTree('');
    expect(root.children).toHaveLength(0);
  });

  it('handles invalid JS without throwing', () => {
    expect(() =>
      parseJsScopeTree('this is not valid javascript !!!')
    ).not.toThrow();
  });

  it('parses a named function declaration', () => {
    const src = 'function foo() {}';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
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
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
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
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
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
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBeNull();
    // nameMappingLocations: [parenPos, arrowPos, identifierPos('foo')]
    expect(fn.nameMappingLocations).toHaveLength(3);
    expect(src[fn.nameMappingLocations[0]]).toBe('(');
    expect(src[fn.nameMappingLocations[1]]).toBe('=');
    expect(src[fn.nameMappingLocations[2]]).toBe('f'); // start of 'foo'
  });

  it('parses a single-param unparenthesised arrow with only the arrow location', () => {
    // No `(` before `x` → no paren loc; only arrow loc.
    const src = '[x => x]';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.kind).toBe('arrow');
    // nameMappingLocations: [arrowPos] only — no paren
    expect(fn.nameMappingLocations).toHaveLength(1);
    expect(src[fn.nameMappingLocations[0]]).toBe('=');
    expect(src[fn.nameMappingLocations[0] + 1]).toBe('>');
  });

  it('prepends the key location for a method in an object literal', () => {
    const src = 'const o = { foo() {} }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.astName).toBe('foo');
    expect(fn.kind).toBe('function');
    // nameMappingLocations: [keyPos('foo'), parenPos]
    expect(fn.nameMappingLocations.length).toBeGreaterThanOrEqual(1);
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // start of 'foo'
  });

  it('prepends the key location for a named FunctionExpression property', () => {
    const src = 'const o = { foo: function() {} }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.astName).toBe('foo');
    expect(fn.kind).toBe('function');
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // key 'foo'
    expect(src[fn.nameMappingLocations[1]]).toBe('('); // paren
  });

  it('marks an arrow-valued property as kind arrow', () => {
    const src = 'const o = { foo: (x) => x }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.kind).toBe('arrow');
    expect(fn.astName).toBe('foo');
    expect(src[fn.nameMappingLocations[0]]).toBe('f'); // key
    expect(src[fn.nameMappingLocations[1]]).toBe('('); // arrow paren
    expect(src[fn.nameMappingLocations[2]]).toBe('='); // arrow =>
  });

  it('parses a private class method with # in astName', () => {
    const src = 'class C { #foo() {} }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.astName).toBe('#foo');
    expect(fn.kind).toBe('function');
    expect(src[fn.nameMappingLocations[0]]).toBe('#');
  });

  it('does not create a scope for a shorthand property', () => {
    const src = 'const o = { a, b }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(0);
  });

  it('creates no scope for an empty computed method', () => {
    // Computed key `{ [k]() {} }`: no stable key location → we walk the body
    // but find no nested functions, so no scopes are created.
    const src = 'const k = "foo"; const o = { [k]() {} }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(0);
  });

  it('finds nested functions inside a computed method body', () => {
    const src = 'const o = { [k]() { function inner() {} } }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);
    expect(root.children[0].astName).toBe('inner');
  });

  it('nests child scopes inside the parent scope', () => {
    const src = 'function outer() { function inner() {} }';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const outer = root.children[0];
    expect(outer.astName).toBe('outer');
    expect(outer.children).toHaveLength(1);

    const inner = outer.children[0];
    expect(inner.astName).toBe('inner');
    expect(inner.children).toHaveLength(0);
  });

  it('gives a named function expression its own astName', () => {
    // `const foo = function bar() {}` → astName = 'bar', not inferred from foo.
    const src = 'const foo = function bar() {}';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.astName).toBe('bar');
    expect(fn.kind).toBe('function');
  });

  it('infers name from assignment target for `obj.foo = function() {}`', () => {
    const src = 'obj.foo = function() {}';
    const root = parseJsScopeTree(src);
    expect(root.children).toHaveLength(1);

    const fn = root.children[0];
    expect(fn.astName).toBeNull();
    expect(fn.kind).toBe('function');
    // Last nameMappingLocation should point to 'foo' in obj.foo
    const lastLoc = fn.nameMappingLocations[fn.nameMappingLocations.length - 1];
    expect(src[lastLoc]).toBe('f'); // 'foo'
  });
});

describe('findInnermostFunctionScope', () => {
  it('returns null when no scope contains the offset', () => {
    const src = 'const x = 1;';
    const root = parseJsScopeTree(src);
    expect(findInnermostFunctionScope(root, 0)).toBeNull();
  });

  it('finds the innermost scope for a nested function', () => {
    const src = 'function outer() { function inner() {} }';
    const root = parseJsScopeTree(src);

    // Offset inside 'inner' — pick a position inside `function inner() {}`
    // 'inner' starts at 28 in the source
    const innerOffset = src.indexOf('inner');
    const path = findInnermostFunctionScope(root, innerOffset);
    expect(path).not.toBeNull();
    expect(path![0].astName).toBe('inner');
    expect(path![1].astName).toBe('outer');
  });
});
