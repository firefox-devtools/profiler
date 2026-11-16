/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stripIndent } from 'common-tags';
import { TreeFragment } from '@lezer/common';

import {
  computeFormatEdits,
  countCommonFormatEdits,
  formatJsCode,
  formatJsCodeIncrementally,
} from '../../profile-logic/js-format/formatter';
import {
  applyFormatEdits,
  updateFormatEdits,
} from '../../profile-logic/js-format/formatted-source';
import type { FormatEdits } from '../../profile-logic/js-format/types';
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
  'const h=async()=>{await g()},k=x=>(a(x),b(x));/* comment */' +
  'g(aaaaaaaaaa,(bbbbbbbbbb(),cccccccccc?dddddddddd:eeeeeeeeee),[ffffffffff,gggggggggg,hhhhhhhhhh,iiiiiiiiii]);';

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
    const long = 'x'.repeat(50);
    expect(
      format(
        `function f(){if(x)throw a(),b(),e;if(y)return a={x:1},a;return c(${long}),d(${long})}`
      )
    ).toBe(stripIndent`
      function f() {
        if (x)
          throw a(),
            b(),
            e;
        if (y)
          return a = {
            x: 1
          },
            a;
        return c(${long}),
          d(${long})
      }
    `);
    expect(format(`g(s=>(a=s,a));g(s=>(a=${long},b(${long})))`))
      .toBe(stripIndent`
      g(s => (a = s, a));
      g(
        s => (
          a = ${long},
          b(${long})
        )
      )
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

  it('indents the code after a `?` or `:` at the start of a line', function () {
    expect(format('const u=f!==null\n?g(a,\nb\n)\n:h(c,\nd\n);x();'))
      .toBe(stripIndent`
      const u = f !== null
        ? g(a,
            b
          )
        : h(c,
            d
          );
      x();
    `);
  });

  it('wraps argument lists, arrays and sequences which are too long', function () {
    const long = 'x'.repeat(50);
    expect(
      format(
        `f(${long},(g(),${long},${long}),[${long},${long}],h(1,2));k([1,2],{a:${long},b:${long}})`
      )
    ).toBe(stripIndent`
      f(
        ${long},
        (
          g(),
          ${long},
          ${long}
        ),
        [
          ${long},
          ${long}
        ],
        h(1, 2)
      );
      k([1, 2], {
        a: ${long},
        b: ${long}
      })
    `);
  });

  it('wraps parameter lists which are too long', function () {
    const long = 'x'.repeat(50);
    expect(format(`function f(${long},${long}){}x=(${long},${long})=>0;`))
      .toBe(stripIndent`
      function f(
        ${long},
        ${long}
      ) {}
      x = (
        ${long},
        ${long}
      ) => 0;
    `);
  });

  it('wraps array patterns which are too long', function () {
    const long = 'x'.repeat(50);
    expect(format(`[${long},${long}]=y;var [a,b]=y;`)).toBe(stripIndent`
      [
        ${long},
        ${long}
      ] = y;
      var [a, b] = y;
    `);
  });

  it('wraps object patterns which are too long', function () {
    const long = 'x'.repeat(50);
    expect(format(`const {${long},${long}}=y;const {a,b:c}=y;`))
      .toBe(stripIndent`
      const {
        ${long},
        ${long}
      } = y;
      const {a, b: c} = y;
    `);
  });

  it('wraps chains of logical operators which are too long', function () {
    const long = 'x'.repeat(40);
    expect(
      format(
        `if(${long}||${long}&&${long}||b)c();return ${long}||${long}||${long};${long}&&${long}&&(e(${long}),f())`
      )
    ).toBe(stripIndent`
      if (
        ${long} ||
        ${long} && ${long} ||
        b
      )
        c();
      return ${long} ||
        ${long} ||
        ${long};
      ${long} && ${long} && (
        e(${long}), f()
      )
    `);
  });

  it('formats imports and exports', function () {
    const long = 'x'.repeat(50);
    expect(
      format(
        `import{a as b,c}from"x";import*as d from"y";import"z";export*from"w";x=import("v");import{${long} as e,${long} as f}from"u";`
      )
    ).toBe(stripIndent`
      import {a as b, c} from "x";
      import * as d from "y";
      import "z";
      export * from "w";
      x = import("v");
      import {
        ${long} as e,
        ${long} as f
      } from "u";
    `);
  });

  it('wraps conditional expressions which are too long', function () {
    const long = 'x'.repeat(50);
    expect(format(`v=a?${long}:b?${long}:${long}`)).toBe(stripIndent`
      v = a
        ? ${long}
        : b
          ? ${long}
          : ${long}
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

  // Formats the code from partial trees which end at every `step` characters,
  // like formatJsCodeIncrementally does, and applies the corrections. Returns
  // the final edits, the edits for the final tree, and the number of steps
  // which corrected earlier edits.
  function formatPartialTrees(code: string, step: number, margin: number) {
    const parser = parserForDialect('');
    let edits: FormatEdits = new Int32Array(0);
    let correctionCount = 0;
    let fragments: readonly TreeFragment[] = [];
    for (let stop = step; ; stop += step) {
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
      const newEdits = computeFormatEdits(code, tree, rangeEnd);
      const keptEditCount = countCommonFormatEdits(edits, newEdits);
      if (keptEditCount * 3 < edits.length) {
        correctionCount++;
      }
      edits = updateFormatEdits(
        edits,
        keptEditCount,
        newEdits.slice(keptEditCount * 3)
      );
      if (isLastStep) {
        return {
          edits: [...edits],
          finalTreeEdits: [...computeFormatEdits(code, tree, rangeEnd)],
          correctionCount,
        };
      }
      fragments = TreeFragment.addTree(tree, fragments, true);
    }
  }

  it('computes the same edits from partial trees as from the full tree', function () {
    const { edits } = formatPartialTrees(code, 5000, 500);
    expect(edits).toEqual([...formatJsCode(code, '')]);
  });

  it('corrects the edits from a wrong partial tree', function () {
    // The partial tree ends before the `)`. It has an ObjectExpression, which
    // gets one property per line. The full tree has an ObjectPattern in the
    // ParamList of an ArrowFunction, which stays on one line.
    const code = 'x=({a,b})=>a+b;';
    const { edits, finalTreeEdits, correctionCount } = formatPartialTrees(
      code,
      code.indexOf(')'),
      0
    );
    expect(correctionCount).toBe(1);
    expect(edits).toEqual(finalTreeEdits);
    expect(edits).toEqual([...formatJsCode(code, '')]);
  });

  it('reports the same edits incrementally as in one go', function () {
    let edits: FormatEdits = new Int32Array(0);
    const doneFlags: boolean[] = [];
    formatJsCodeIncrementally(
      code,
      '',
      (keptEditCount, newEdits, _formattedUpTo, isDone) => {
        edits = updateFormatEdits(edits, keptEditCount, newEdits);
        doneFlags.push(isDone);
      }
    );
    expect([...edits]).toEqual([...formatJsCode(code, '')]);
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
