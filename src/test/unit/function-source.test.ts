/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { extractFunctionSource } from '../../profile-logic/js-format/function-source';
import { getSourceDialectForPath } from '../../profile-logic/js-format/dialect';
import { isPositionInCode } from '../../profile-logic/benchmark/bucket-function-source';

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

  it('finds the whole function when a .js file contains JSX', function () {
    const jsx = [
      'const List = ({ items }) => (',
      '  <ul>',
      '    {items.map((item) => {',
      '      return <li key={item.id}>{item.name}</li>;',
      '    })}',
      '  </ul>',
      ');',
    ].join('\n');
    const dialect = getSourceDialectForPath('src/List.js');
    if (dialect === null) {
      throw new Error('Expected .js to be a JS file.');
    }
    expect(
      extractFunctionSource({
        code: jsx,
        dialect,
        line: 3,
        column: 16,
        format: 'never',
      })
    ).toEqual({
      lines: [
        '{items.map((item) => {',
        '  return <li key={item.id}>{item.name}</li>;',
        '})}',
      ],
      firstLine: 3,
    });
  });
});

describe('extractFunctionSource in Svelte components', function () {
  const code = [
    '<script>',
    '  let count = 0;',
    '  function increment() {',
    '    count++;',
    '  }',
    '</script>',
    '',
    '<button on:click={() => (count = 0)}>{count}</button>',
    '{#if count > 0}',
    '  <p>Clicked</p>',
    '{/if}',
  ].join('\n');

  function extract(line: number, column: number) {
    return extractFunctionSource({
      code,
      dialect: 'svelte',
      line,
      column,
      format: 'never',
    });
  }

  it('finds functions in the script', function () {
    expect(extract(3, 3)).toEqual({
      lines: ['function increment() {', '  count++;', '}'],
      firstLine: 3,
    });
  });

  it('finds functions in template expressions, and shows the markup around them', function () {
    expect(extract(8, 19)).toEqual({
      lines: ['<button on:click={() => (count = 0)}>{count}</button>'],
      firstLine: 8,
    });
  });

  it("doesn't find functions in the markup", function () {
    expect(extract(9, 1)).toBeNull();
    expect(extract(10, 3)).toBeNull();
  });
});

describe('extractFunctionSource in Vue components', function () {
  const code = [
    '<script setup lang="ts">',
    'function reset(): void {',
    '  count.value = 0;',
    '}',
    '</script>',
    '',
    '<template>',
    '  <button @click="reset()">{{ count }}</button>',
    '</template>',
  ].join('\n');

  function extract(line: number, column: number) {
    return extractFunctionSource({
      code,
      dialect: 'vue',
      line,
      column,
      format: 'never',
    });
  }

  it('finds functions in the script', function () {
    expect(extract(2, 1)).toEqual({
      lines: ['function reset(): void {', '  count.value = 0;', '}'],
      firstLine: 2,
    });
  });

  it('finds event handlers, and shows the markup around them', function () {
    expect(extract(8, 19)).toEqual({
      lines: ['<button @click="reset()">{{ count }}</button>'],
      firstLine: 8,
    });
  });

  it("doesn't find functions in the markup", function () {
    expect(extract(8, 3)).toBeNull();
    expect(extract(8, 31)).toBeNull();
  });
});

describe('isPositionInCode', function () {
  const code = 'function f() {\n  return 1;\n}';

  it('accepts positions inside the code', function () {
    expect(isPositionInCode(code, 1, 1)).toBe(true);
    expect(isPositionInCode(code, 2, 3)).toBe(true);
    expect(isPositionInCode(code, 3, 1)).toBe(true);
  });

  it('accepts the position just after the end of a line', function () {
    expect(isPositionInCode(code, 2, 12)).toBe(true);
    expect(isPositionInCode(code, 3, 2)).toBe(true);
  });

  it('rejects positions past the end of a line', function () {
    expect(isPositionInCode(code, 2, 13)).toBe(false);
    expect(isPositionInCode(code, 3, 3)).toBe(false);
  });

  it('rejects lines past the end of the code', function () {
    // For example, a source map whose mappings were made for an unminified
    // file, but whose sourcesContent has the minified file.
    expect(isPositionInCode(code, 4, 1)).toBe(false);
    expect(isPositionInCode(code, 25, 1)).toBe(false);
  });

  it('rejects positions before the start of the code', function () {
    expect(isPositionInCode(code, 0, 1)).toBe(false);
    expect(isPositionInCode(code, 1, 0)).toBe(false);
  });
});
