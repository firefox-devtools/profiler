/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stripIndent } from 'common-tags';
import { TreeFragment } from '@lezer/common';

import {
  computeFormatEdits,
  formatJsCode,
  formatJsCodeIncrementally,
} from '../../profile-logic/js-format/formatter';
import {
  applyFormatEdits,
  createSourceViewFormatting,
} from '../../profile-logic/js-format/formatted-source';
import { getFormatDialectForPath } from '../../profile-logic/js-format/dialect';
import { parserForDialect } from '../../profile-logic/source-maps/scope-tree';
import type { JsDialect } from '../../profile-logic/js-format/dialect';

function format(code: string, dialect: JsDialect = ''): string {
  return applyFormatEdits(code, formatJsCode(code, dialect)).lines.join('\n');
}

function removeWhitespace(code: string): string {
  return code.replace(/\s+/g, '');
}

// Some minified code, which is repeated to get code that's long enough for
// partial parses.
const MINIFIED_CODE =
  'function f(a,b){if(a)return b;else{for(let i=0;i<a;i++)b+=i}return a?b:-b}' +
  'var o={x:1,y:[1,2],z(){return`t ${o.x}`}},p=/re{1}/g;a(),b(),c();' +
  'switch(x){case 1:f();break;default:g()}try{a()}catch(e){b()}finally{c()}' +
  'class A extends B{constructor(){super();this.x=1}static m(){}}' +
  'const h=async()=>{await g()},k=x=>(a(x),b(x));/* comment */';

describe('formatJsCode', function () {
  it('puts statements on their own lines and indents blocks', function () {
    expect(
      format(
        'function f(a,b){if(a)return b;else{for(let i=0;i<a;i++)b+=i}return a?b:-b}'
      )
    ).toBe(stripIndent`
      function f(a, b) {
        if (a)
          return b;
        else {
          for (let i = 0; i < a; i++)
            b += i
        }
        return a ? b : -b
      }
    `);
  });

  it('splits declarations and comma sequences', function () {
    expect(format('var a=1,b={x:1,y:[1,2]};a(),b(),c();')).toBe(stripIndent`
      var a = 1,
        b = {
          x: 1,
          y: [1, 2]
        };
      a(),
        b(),
        c();
    `);
    expect(format('function f(){if(x)throw a(),b(),e;return c(),d}'))
      .toBe(stripIndent`
      function f() {
        if (x)
          throw a(),
            b(),
            e;
        return c(),
          d
      }
    `);
  });

  it('formats switch statements and try blocks', function () {
    expect(
      format(
        'switch(x){case 1:f();break;default:g()}try{a()}catch(e){b()}finally{c()}'
      )
    ).toBe(stripIndent`
      switch (x) {
        case 1:
          f();
          break;
        default:
          g()
      }
      try {
        a()
      } catch (e) {
        b()
      } finally {
        c()
      }
    `);
  });

  it('formats statement bodies without braces', function () {
    expect(format('do x();while(y);if(a)b();else if(c)d();else e()'))
      .toBe(stripIndent`
        do
          x();
        while (y);
        if (a)
          b();
        else if (c)
          d();
        else
          e()
      `);
  });

  it('formats classes and empty blocks', function () {
    expect(
      format(
        'class A extends B{constructor(){super();this.x=1}static m(){}}if(a){}else{}'
      )
    ).toBe(stripIndent`
      class A extends B {
        constructor() {
          super();
          this.x = 1
        }
        static m() {}
      }
      if (a) {} else {}
    `);
  });

  it('keeps strings, template strings, regular expressions and comments', function () {
    expect(format('x=`a ${b+c} d`;y=/re{1}/g;z="{a;b}";// c;d\nw()'))
      .toBe(stripIndent`
        x = \`a \${b+c} d\`;
        y = /re{1}/g;
        z = "{a;b}"; // c;d
        w()
      `);
  });

  it('keeps existing line breaks, with at most one blank line', function () {
    expect(format('a();\n\n\n\nb(\n1,\n2)')).toBe(stripIndent`
      a();

      b(
        1,
        2)
    `);
  });

  it('formats TypeScript and JSX', function () {
    expect(
      format(
        'function f<T>(a:T):Array<T>{return <div x={a}>{b}</div>}',
        'ts jsx'
      )
    ).toBe(stripIndent`
      function f<T>(a: T): Array<T> {
        return <div x={a}>{b}</div>
      }
    `);
  });

  it('only changes whitespace', function () {
    const formatted = format(MINIFIED_CODE);
    expect(formatted).not.toBe(MINIFIED_CODE);
    expect(removeWhitespace(formatted)).toBe(removeWhitespace(MINIFIED_CODE));
  });

  it('does not throw on invalid code', function () {
    const code = 'this is not valid javascript !!! {{{';
    expect(removeWhitespace(format(code))).toBe(removeWhitespace(code));
  });
});

describe('formatting partial syntax trees', function () {
  const code = MINIFIED_CODE.repeat(200);

  it('computes the same edits from partial trees as from the full tree', function () {
    const parser = parserForDialect('');
    const fullEdits = formatJsCode(code, '');

    // Parse the code in steps, like formatJsCodeIncrementally does, but at
    // fixed positions.
    const margin = 2000;
    const allEdits = [];
    let fragments: readonly TreeFragment[] = [];
    let formattedUpTo = 0;
    for (let stop = 5000; formattedUpTo <= code.length; stop += 5000) {
      const parse = parser.startParse(code, fragments);
      const isLastStep = stop >= code.length;
      if (!isLastStep) {
        parse.stopAt(stop);
      }
      let tree;
      while ((tree = parse.advance()) === null) {
        // Keep parsing.
      }
      const rangeEnd = isLastStep ? code.length + 1 : stop - margin;
      allEdits.push(...computeFormatEdits(code, tree, formattedUpTo, rangeEnd));
      formattedUpTo = rangeEnd;
      fragments = TreeFragment.addTree(tree, fragments, true);
    }

    expect(allEdits).toEqual([...fullEdits]);
  });

  it('reports the same edits incrementally as in one go', function () {
    const allEdits: number[] = [];
    const doneFlags: boolean[] = [];
    formatJsCodeIncrementally(code, '', (edits, _formattedUpTo, isDone) => {
      allEdits.push(...edits);
      doneFlags.push(isDone);
    });
    expect(allEdits).toEqual([...formatJsCode(code, '')]);
    expect(doneFlags[doneFlags.length - 1]).toBeTrue();
    expect(doneFlags.slice(0, -1)).not.toContain(true);
  });
});

describe('applyFormatEdits', function () {
  it('maps positions in the original code to formatted lines', function () {
    const code = 'a();b();\nc({x:1})';
    const formatted = applyFormatEdits(code, formatJsCode(code, ''));
    expect(formatted.lines).toEqual(['a();', 'b();', 'c({', '  x: 1', '})']);
    // Positions on the first original line.
    expect(formatted.getFormattedLine(1, 1)).toBe(1);
    expect(formatted.getFormattedLine(1, 5)).toBe(2);
    expect(formatted.getFormattedLine(1, null)).toBe(1);
    // Positions on the second original line.
    expect(formatted.getFormattedLine(2, null)).toBe(3);
    expect(formatted.getFormattedLine(2, 4)).toBe(4);
    expect(formatted.getFormattedLine(2, 7)).toBe(5);
    // Columns past the end of the line are clamped to the end of the line,
    // lines past the end are clamped to the last line.
    expect(formatted.getFormattedLine(2, 100)).toBe(5);
    expect(formatted.getFormattedLine(5, 1)).toBe(3);
  });

  it('handles all kinds of line breaks', function () {
    const code = 'a();\r\nb();\rc();x=`1\r\n2`;d()';
    const formatted = applyFormatEdits(code, formatJsCode(code, ''));
    expect(formatted.lines).toEqual([
      'a();',
      'b();',
      'c();',
      'x = `1',
      '2`;',
      'd()',
    ]);
    expect(formatted.getFormattedLine(2, 1)).toBe(2);
    expect(formatted.getFormattedLine(3, 1)).toBe(3);
    expect(formatted.getFormattedLine(3, 5)).toBe(4);
    expect(formatted.getFormattedLine(4, 1)).toBe(5);
    expect(formatted.getFormattedLine(4, 4)).toBe(6);
  });

  it('shows the unformatted rest of partially-formatted code', function () {
    const code = 'a();b();c();d()';
    const edits = formatJsCode(code, '');
    // Only keep the first edit, as if the worker was still busy.
    const formatted = applyFormatEdits(code, edits.slice(0, 3));
    expect(formatted.lines).toEqual(['a();', 'b();c();d()']);
    expect(formatted.getFormattedLine(1, 12)).toBe(2);
  });
});

describe('createSourceViewFormatting', function () {
  it('accepts positions that are relative to the start of the file', function () {
    // An inline script which starts at line 10, column 9 of the HTML page.
    const code = 'a();b();\nc()';
    const formatting = createSourceViewFormatting(
      code,
      { edits: formatJsCode(code, ''), isDone: true },
      10,
      9
    );
    expect(formatting.lines).toEqual(['a();', 'b();', 'c()']);
    expect(formatting.mapPositionToLine(10, 9)).toBe(1);
    expect(formatting.mapPositionToLine(10, 13)).toBe(2);
    expect(formatting.mapPositionToLine(11, 1)).toBe(3);
  });
});

describe('getFormatDialectForPath', function () {
  it('returns the dialect for JS files, and null for other files', function () {
    expect(getFormatDialectForPath('https://example.com/bundle.js')).toBe(
      'jsx'
    );
    expect(getFormatDialectForPath('https://example.com/')).toBe('jsx');
    expect(getFormatDialectForPath('src/app.tsx')).toBe('ts jsx');
    expect(getFormatDialectForPath('src/main.cpp')).toBeNull();
    expect(getFormatDialectForPath('src/lib.rs')).toBeNull();
    expect(getFormatDialectForPath('iongraph.json')).toBeNull();
  });
});
