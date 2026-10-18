/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { extractFunctionSource } from '../../profile-logic/js-format/function-source';

describe('extractFunctionSource', function () {
  const code = [
    'const x = 1;',
    'class Card {',
    '  view(vnode) {',
    '    const inner = () => {',
    '      return 2;',
    '    };',
    '    return inner();',
    '  }',
    '}',
    'const arrow = (a) => a + 1;',
  ].join('\n');

  it('returns the whole lines of the function, dedented', function () {
    expect(
      extractFunctionSource({
        code,
        dialect: '',
        line: 3,
        column: 3,
        format: 'never',
      })
    ).toEqual({
      lines: [
        'view(vnode) {',
        '  const inner = () => {',
        '    return 2;',
        '  };',
        '  return inner();',
        '}',
      ],
      firstLine: 3,
    });
  });

  it('finds a nested function', function () {
    expect(
      extractFunctionSource({
        code,
        dialect: '',
        line: 4,
        column: 19,
        format: 'never',
      })
    ).toEqual({
      lines: ['const inner = () => {', '  return 2;', '};'],
      firstLine: 4,
    });
  });

  it('includes the code before an arrow function on its line', function () {
    expect(
      extractFunctionSource({
        code,
        dialect: '',
        line: 10,
        column: 15,
        format: 'never',
      })
    ).toEqual({ lines: ['const arrow = (a) => a + 1;'], firstLine: 10 });
  });

  it('returns null outside of functions', function () {
    expect(
      extractFunctionSource({
        code,
        dialect: '',
        line: 1,
        column: 1,
        format: 'never',
      })
    ).toBeNull();
  });

  it('pretty-prints only the function', function () {
    const minified = 'var a=1;var o={view(t){if(t){return f(t)}return 0}};';
    expect(
      extractFunctionSource({
        code: minified,
        dialect: '',
        line: 1,
        column: 17,
        format: 'always',
      })
    ).toEqual({
      lines: [
        'view(t) {',
        '  if (t) {',
        '    return f(t)',
        '  }',
        '  return 0',
        '}',
      ],
      firstLine: null,
    });
  });

  it('only pretty-prints minified code in auto mode', function () {
    const readable = 'function f(a) {\n  return a;\n}';
    expect(
      extractFunctionSource({
        code: readable,
        dialect: '',
        line: 1,
        column: 1,
        format: 'auto',
      })
    ).toEqual({ lines: ['function f(a) {', '  return a;', '}'], firstLine: 1 });

    const minified = `function f(a){return a+${'1+'.repeat(200)}1}`;
    expect(
      extractFunctionSource({
        code: minified,
        dialect: '',
        line: 1,
        column: 1,
        format: 'auto',
      })?.firstLine
    ).toBeNull();
  });

  it('pretty-prints a short function on a long line in auto mode', function () {
    const code = `var x=[${'1,'.repeat(200)}1];function f(a){return a}`;
    expect(
      extractFunctionSource({
        code,
        dialect: '',
        line: 1,
        column: code.indexOf('function') + 1,
        format: 'auto',
      })
    ).toEqual({
      lines: ['function f(a) {', '  return a', '}'],
      firstLine: null,
    });
  });

  it('parses TypeScript with the ts dialect', function () {
    const ts = 'export function f(a: number): number {\n  return a;\n}';
    expect(
      extractFunctionSource({
        code: ts,
        dialect: 'ts',
        line: 1,
        column: 8,
        format: 'never',
      })
    ).toEqual({
      lines: ['export function f(a: number): number {', '  return a;', '}'],
      firstLine: 1,
    });
  });
});
