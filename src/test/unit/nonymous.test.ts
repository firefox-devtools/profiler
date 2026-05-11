/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  parseNonymousName,
  serializeNonymousName,
} from '../../profile-logic/nonymous';
import type { NonymousName } from '../../profile-logic/nonymous';

describe('parseNonymousName', () => {
  it('parses a simple identifier', () => {
    expect(parseNonymousName('foo')).toEqual({
      scopes: [],
      local: { kind: 'named', name: 'foo', contributesTo: false },
    });
  });

  it('parses a contributes-to name', () => {
    expect(parseNonymousName('foo<')).toEqual({
      scopes: [],
      local: { kind: 'named', name: 'foo', contributesTo: true },
    });
  });

  it('parses a bare anonymous segment', () => {
    expect(parseNonymousName('<')).toEqual({
      scopes: [],
      local: { kind: 'anonymous' },
    });
  });

  it('parses a scoped name', () => {
    expect(parseNonymousName('outer/inner')).toEqual({
      scopes: [{ kind: 'named', name: 'outer', contributesTo: false }],
      local: { kind: 'named', name: 'inner', contributesTo: false },
    });
  });

  it('parses a three-level scope chain', () => {
    expect(parseNonymousName('foz/baz/bay')).toEqual({
      scopes: [
        { kind: 'named', name: 'foz', contributesTo: false },
        { kind: 'named', name: 'baz', contributesTo: false },
      ],
      local: { kind: 'named', name: 'bay', contributesTo: false },
    });
  });

  it('parses a scoped contributes-to name', () => {
    expect(parseNonymousName('main/foo<')).toEqual({
      scopes: [{ kind: 'named', name: 'main', contributesTo: false }],
      local: { kind: 'named', name: 'foo', contributesTo: true },
    });
  });

  it('parses the canonical i2</fr/< example', () => {
    expect(parseNonymousName('i2</fr/<')).toEqual({
      scopes: [
        { kind: 'named', name: 'i2', contributesTo: true },
        { kind: 'named', name: 'fr', contributesTo: false },
      ],
      local: { kind: 'anonymous' },
    });
  });

  it('parses outer/< (anonymous inside named scope)', () => {
    expect(parseNonymousName('outer/<')).toEqual({
      scopes: [{ kind: 'named', name: 'outer', contributesTo: false }],
      local: { kind: 'anonymous' },
    });
  });

  it('parses a property chain name', () => {
    expect(parseNonymousName('this.eventPool_.createObject')).toEqual({
      scopes: [],
      local: {
        kind: 'named',
        name: 'this.eventPool_.createObject',
        contributesTo: false,
      },
    });
  });

  it('parses a numeric element access name', () => {
    expect(parseNonymousName('arr[0]')).toEqual({
      scopes: [],
      local: { kind: 'named', name: 'arr[0]', contributesTo: false },
    });
  });

  it('returns anonymous for an empty string', () => {
    expect(parseNonymousName('')).toEqual({
      scopes: [],
      local: { kind: 'anonymous' },
    });
  });
});

describe('serializeNonymousName', () => {
  it('serializes a simple named local', () => {
    const name: NonymousName = {
      scopes: [],
      local: { kind: 'named', name: 'foo', contributesTo: false },
    };
    expect(serializeNonymousName(name)).toBe('foo');
  });

  it('serializes a contributes-to local', () => {
    const name: NonymousName = {
      scopes: [],
      local: { kind: 'named', name: 'foo', contributesTo: true },
    };
    expect(serializeNonymousName(name)).toBe('foo<');
  });

  it('serializes an anonymous local', () => {
    const name: NonymousName = {
      scopes: [],
      local: { kind: 'anonymous' },
    };
    expect(serializeNonymousName(name)).toBe('<');
  });

  it('serializes a scoped name', () => {
    const name: NonymousName = {
      scopes: [{ kind: 'named', name: 'outer', contributesTo: false }],
      local: { kind: 'named', name: 'inner', contributesTo: false },
    };
    expect(serializeNonymousName(name)).toBe('outer/inner');
  });

  it('round-trips all parse test cases', () => {
    const cases = [
      'foo',
      'foo<',
      '<',
      'outer/inner',
      'foz/baz/bay',
      'main/foo<',
      'i2</fr/<',
      'outer/<',
      'this.eventPool_.createObject',
      'arr[0]',
    ];
    for (const s of cases) {
      expect(serializeNonymousName(parseNonymousName(s))).toBe(s);
    }
  });

  it('round-trips every example from the module docstring', () => {
    const cases = [
      'foo',
      'foo<',
      'obj.method',
      'outer/inner',
      'outer/inner<',
      'outer/<',
      'i2</fr/<',
    ];
    for (const s of cases) {
      expect(serializeNonymousName(parseNonymousName(s))).toBe(s);
    }
  });
});
