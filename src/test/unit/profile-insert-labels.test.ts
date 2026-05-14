/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  applyModifier,
  expandPattern,
  reverseModifier,
  reverseBlinkSnake,
  compilePatternToRegex,
  discoverAutoLabels,
  resolveAllLabels,
  parseLabelToml,
} from 'firefox-profiler/utils/label-templates';
import type { AutoLabel } from 'firefox-profiler/utils/label-templates';
import { insertStackLabels } from 'firefox-profiler/profile-logic/insert-stack-labels';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { callTreeFromProfile, formatTree } from '../fixtures/utils';

// ---------------------------------------------------------------------------
// applyModifier
// ---------------------------------------------------------------------------

describe('applyModifier', function () {
  describe(':pascal', function () {
    it('uppercases the first letter of a camelCase name', function () {
      expect(applyModifier('querySelector', 'pascal')).toBe('QuerySelector');
    });

    it('handles multi-word camelCase', function () {
      expect(applyModifier('addEventListener', 'pascal')).toBe(
        'AddEventListener'
      );
    });

    it('preserves interior uppercase (innerHTML)', function () {
      expect(applyModifier('innerHTML', 'pascal')).toBe('InnerHTML');
    });

    it('handles a single lowercase letter', function () {
      expect(applyModifier('fill', 'pascal')).toBe('Fill');
    });
  });

  describe(':blink_snake', function () {
    it('lowercases a simple PascalCase word', function () {
      expect(applyModifier('Element', 'blink_snake')).toBe('element');
    });

    it('handles HTML* class names', function () {
      expect(applyModifier('HTMLInputElement', 'blink_snake')).toBe(
        'html_input_element'
      );
    });

    it('handles DOM* class names', function () {
      expect(applyModifier('DOMTokenList', 'blink_snake')).toBe(
        'dom_token_list'
      );
    });

    it('handles CSS* class names', function () {
      expect(applyModifier('CSSStyleSheet', 'blink_snake')).toBe(
        'css_style_sheet'
      );
    });

    it('handles compound PascalCase names', function () {
      expect(applyModifier('DocumentFragment', 'blink_snake')).toBe(
        'document_fragment'
      );
      expect(applyModifier('EventTarget', 'blink_snake')).toBe('event_target');
      expect(applyModifier('ShadowRoot', 'blink_snake')).toBe('shadow_root');
    });

    it('handles all-uppercase acronyms', function () {
      expect(applyModifier('URL', 'blink_snake')).toBe('url');
      expect(applyModifier('DOMParser', 'blink_snake')).toBe('dom_parser');
    });

    it('keeps a mixed-case special token together when listed', function () {
      expect(
        applyModifier('WebGLRenderingContext', 'blink_snake', ['WebGL'])
      ).toBe('webgl_rendering_context');
      expect(applyModifier('XPathEvaluator', 'blink_snake', ['XPath'])).toBe(
        'xpath_evaluator'
      );
    });

    it('keeps a digit-bearing special token together when listed', function () {
      expect(
        applyModifier('WebGL2RenderingContext', 'blink_snake', ['WebGL2'])
      ).toBe('webgl2_rendering_context');
    });

    it('prefers the longer of two prefix-overlapping special tokens', function () {
      // WebGL2 must match before WebGL, regardless of list order.
      expect(
        applyModifier('WebGL2RenderingContext', 'blink_snake', [
          'WebGL',
          'WebGL2',
        ])
      ).toBe('webgl2_rendering_context');
      expect(
        applyModifier('WebGLRenderingContext', 'blink_snake', [
          'WebGL',
          'WebGL2',
        ])
      ).toBe('webgl_rendering_context');
    });
  });

  it('returns the value unchanged when no modifier is given', function () {
    expect(applyModifier('querySelector', undefined)).toBe('querySelector');
    expect(applyModifier('Element', undefined)).toBe('Element');
  });

  it('throws on an unknown modifier', function () {
    expect(() => applyModifier('foo', 'upper')).toThrow(
      'Unknown template modifier: upper'
    );
  });
});

// ---------------------------------------------------------------------------
// expandPattern
// ---------------------------------------------------------------------------

describe('expandPattern', function () {
  it('substitutes a plain variable', function () {
    expect(
      expandPattern('mozilla::dom::{Class}_Binding::{method}(', {
        Class: 'Element',
        method: 'querySelector',
      })
    ).toBe('mozilla::dom::Element_Binding::querySelector(');
  });

  it('applies :pascal to the variable value', function () {
    expect(
      expandPattern('v8_{Class:blink_snake}::{method:pascal}Operation', {
        Class: 'Element',
        method: 'querySelector',
      })
    ).toBe('v8_element::QuerySelectorOperation');
  });

  it('applies :blink_snake to the variable value', function () {
    expect(
      expandPattern('v8_{Class:blink_snake}::Callback', {
        Class: 'HTMLInputElement',
      })
    ).toBe('v8_html_input_element::Callback');
  });

  it('leaves unrelated text intact', function () {
    expect(expandPattern('no_vars_here', {})).toBe('no_vars_here');
  });

  it('throws when a referenced variable is not provided', function () {
    expect(() =>
      expandPattern('{Class}_Binding::{method}(', { Class: 'Element' })
    ).toThrow('Template variable "method" not provided');
  });
});

// ---------------------------------------------------------------------------
// Integration: auto_labels → insertStackLabels → formatTree
//
// resolveAllLabels-driven coverage for each engine's func-name shape. Each
// test seeds funcs from one engine and confirms auto-discovery synthesizes
// a label whose forward-expanded prefixes match across all engines.
// ---------------------------------------------------------------------------

const DOM_OPERATION: AutoLabel = {
  label: '{Class}.{method}',
  patterns: [
    'mozilla::dom::{Class}_Binding::{method}(',
    "blink::`anonymous namespace'::v8_{Class:blink_snake}::{method:pascal}Operation",
    'blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation',
    'WebCore::js{Class}PrototypeFunction_{method}',
  ],
};

const CANVAS2D_OPERATION: AutoLabel = {
  label: 'CanvasRenderingContext2D.{method}',
  patterns: [
    'mozilla::dom::CanvasRenderingContext2D_Binding::{method}(',
    'mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::{method}(',
    "blink::`anonymous namespace'::v8_canvas_rendering_context_2d::{method:pascal}Operation",
    'blink::(anonymous namespace)::v8_canvas_rendering_context_2d::{method:pascal}Operation',
    'blink::Canvas2DRecorderContext::{method}(',
    'WebCore::jsCanvasRenderingContext2DPrototypeFunction_{method}(',
  ],
};

describe('auto_labels integration with insertStackLabels', function () {
  it('matches Gecko-style function names generated from a dom_operation template', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      mozilla::dom::Element_Binding::querySelector(elem)
    `);

    const labels = resolveAllLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::Element_Binding::querySelector(elem)']
    );

    expect(formatTree(callTreeFromProfile(insertStackLabels(profile, labels))))
      .toEqual([
        '- Unaccounted (total: 1, self: —)',
        '  - A (total: 1, self: —)',
        '    - Element.querySelector (total: 1, self: —)',
        '      - mozilla::dom::Element_Binding::querySelector(elem) (total: 1, self: 1)',
      ]);
  });

  it('matches both anonymous-namespace forms for Blink', function () {
    const { profile } = getProfileFromTextSamples(`
      blink::\`anonymous namespace'::v8_element::QuerySelectorOperation
      blink::(anonymous namespace)::v8_element::QuerySelectorOperation
    `);

    const labels = resolveAllLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION],
        blinkSpecialTokens: [],
      },
      [
        "blink::`anonymous namespace'::v8_element::QuerySelectorOperation",
        'blink::(anonymous namespace)::v8_element::QuerySelectorOperation',
      ]
    );

    expect(formatTree(callTreeFromProfile(insertStackLabels(profile, labels))))
      .toEqual([
        "- Element.querySelector (total: 1, self: —)",
        "  - blink::`anonymous namespace'::v8_element::QuerySelectorOperation (total: 1, self: —)",
        "    - blink::(anonymous namespace)::v8_element::QuerySelectorOperation (total: 1, self: 1)",
      ]);
  });

  it('matches WebKit-style function names', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*)
    `);

    const labels = resolveAllLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION],
        blinkSpecialTokens: [],
      },
      [
        'WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*)',
      ]
    );

    expect(formatTree(callTreeFromProfile(insertStackLabels(profile, labels))))
      .toEqual([
        '- Unaccounted (total: 1, self: —)',
        '  - A (total: 1, self: —)',
        '    - Element.querySelector (total: 1, self: —)',
        '      - WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*) (total: 1, self: 1)',
      ]);
  });

  it('canvas2d_operation matches Gecko, Offscreen, Blink, and WebKit variants', function () {
    const { profile } = getProfileFromTextSamples(`
      mozilla::dom::CanvasRenderingContext2D_Binding::fillRect(args)
      mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::fillRect(args)
      blink::(anonymous namespace)::v8_canvas_rendering_context_2d::FillRectOperation
      WebCore::jsCanvasRenderingContext2DPrototypeFunction_fillRect(ctx)
    `);

    const labels = resolveAllLabels(
      {
        labels: [],
        autoLabels: [CANVAS2D_OPERATION],
        blinkSpecialTokens: [],
      },
      [
        'mozilla::dom::CanvasRenderingContext2D_Binding::fillRect(args)',
        'mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::fillRect(args)',
        'blink::(anonymous namespace)::v8_canvas_rendering_context_2d::FillRectOperation',
        'WebCore::jsCanvasRenderingContext2DPrototypeFunction_fillRect(ctx)',
      ]
    );

    expect(formatTree(callTreeFromProfile(insertStackLabels(profile, labels))))
      .toEqual([
        '- CanvasRenderingContext2D.fillRect (total: 1, self: —)',
        '  - mozilla::dom::CanvasRenderingContext2D_Binding::fillRect(args) (total: 1, self: —)',
        '    - mozilla::dom::OffscreenCanvasRenderingContext2D_Binding::fillRect(args) (total: 1, self: —)',
        '      - blink::(anonymous namespace)::v8_canvas_rendering_context_2d::FillRectOperation (total: 1, self: —)',
        '        - WebCore::jsCanvasRenderingContext2DPrototypeFunction_fillRect(ctx) (total: 1, self: 1)',
      ]);
  });

  it('merges an explicit `[[labels]]` entry with the auto-discovered prefixes when names collide', function () {
    // The blink::bindings::PerformAttributeSetCEReactionsReflectTypeString
    // frame is the generic className-setter runtime — auto-discovery can't
    // synthesize it from any template. The explicit `[[labels]]` block adds
    // it on top of the auto-discovered "set Element.className" prefixes.
    const { profile } = getProfileFromTextSamples(`
      blink::bindings::PerformAttributeSetCEReactionsReflectTypeString
      mozilla::dom::Element_Binding::set_className(args)
    `);

    const DOM_SETTER: AutoLabel = {
      label: 'set {Class}.{prop}',
      patterns: ['mozilla::dom::{Class}_Binding::set_{prop}('],
    };

    const labels = resolveAllLabels(
      {
        labels: [
          {
            name: 'set Element.className',
            funcPrefixes: [
              'blink::bindings::PerformAttributeSetCEReactionsReflectTypeString',
            ],
          },
        ],
        autoLabels: [DOM_SETTER],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::Element_Binding::set_className(args)']
    );

    expect(formatTree(callTreeFromProfile(insertStackLabels(profile, labels))))
      .toEqual([
        '- set Element.className (total: 1, self: —)',
        '  - blink::bindings::PerformAttributeSetCEReactionsReflectTypeString (total: 1, self: —)',
        '    - mozilla::dom::Element_Binding::set_className(args) (total: 1, self: 1)',
      ]);
  });
});

// ---------------------------------------------------------------------------
// :blink_snake digit-boundary handling
// ---------------------------------------------------------------------------

describe(':blink_snake digit handling', function () {
  it('separates trailing digit acronyms (Context2D)', function () {
    expect(applyModifier('CanvasRenderingContext2D', 'blink_snake')).toBe(
      'canvas_rendering_context_2d'
    );
  });

  it('keeps a digit-then-uppercase acronym joined when no lowercase follows', function () {
    expect(applyModifier('Canvas2D', 'blink_snake')).toBe('canvas_2d');
  });

  it('splits a digit-then-uppercase pair when followed by lowercase', function () {
    expect(applyModifier('WebGL2RenderingContext', 'blink_snake')).toBe(
      'web_gl_2_rendering_context'
    );
  });
});

// ---------------------------------------------------------------------------
// reverseSnake / reverseModifier
// ---------------------------------------------------------------------------

describe('reverseBlinkSnake', function () {
  it('reverses a single Pascal word', function () {
    expect(reverseBlinkSnake('element')).toBe('Element');
  });

  it('reverses a multi-word PascalCase name', function () {
    expect(reverseBlinkSnake('document_fragment')).toBe('DocumentFragment');
    expect(reverseBlinkSnake('event_target')).toBe('EventTarget');
  });

  it('uses the special-tokens list to recover all-uppercase fragments', function () {
    expect(reverseBlinkSnake('html_element', ['HTML'])).toBe('HTMLElement');
    expect(reverseBlinkSnake('html_image_element', ['HTML'])).toBe(
      'HTMLImageElement'
    );
    expect(reverseBlinkSnake('css_style_sheet', ['CSS'])).toBe('CSSStyleSheet');
    expect(reverseBlinkSnake('xml_http_request', ['XML'])).toBe(
      'XMLHttpRequest'
    );
  });

  it('uses the special-tokens list to recover mixed-case fragments', function () {
    expect(reverseBlinkSnake('webgl_rendering_context', ['WebGL'])).toBe(
      'WebGLRenderingContext'
    );
    expect(reverseBlinkSnake('webgl2_rendering_context', ['WebGL2'])).toBe(
      'WebGL2RenderingContext'
    );
    expect(reverseBlinkSnake('xpath_evaluator', ['XPath'])).toBe(
      'XPathEvaluator'
    );
  });

  it('without a special-tokens list, falls back to first-letter capitalization', function () {
    // This is the lossy case: HtmlElement and HTMLElement both snake to the
    // same string, and without special tokens we can't recover the original.
    expect(reverseBlinkSnake('html_element')).toBe('HtmlElement');
  });

  it('handles trailing digit-bearing tokens', function () {
    expect(reverseBlinkSnake('canvas_rendering_context_2d', ['2D'])).toBe(
      'CanvasRenderingContext2D'
    );
    expect(reverseBlinkSnake('canvas_2d', ['2D'])).toBe('Canvas2D');
  });

  it('handles multiple tokens separated by Pascal words', function () {
    // The special-tokens list applies independently at each segment; here
    // HTML is recovered, then `dom` becomes `Dom` (no DOM in the list), then
    // URL is recovered. (Two adjacent special tokens cannot be expressed in
    // snake form — `HTMLDOMParser` snakes to `htmldom_parser`, not
    // `html_dom_parser`.)
    expect(reverseBlinkSnake('html_dom_event_url', ['HTML', 'URL'])).toBe(
      'HTMLDomEventURL'
    );
  });

  it('handles a trailing special token with no follow-up segment', function () {
    expect(reverseBlinkSnake('parse_url', ['URL'])).toBe('ParseURL');
  });

  it('does case-insensitive matching against the special-tokens list', function () {
    expect(reverseBlinkSnake('html_element', ['html'])).toBe('htmlElement');
  });
});

describe('reverseModifier', function () {
  it('reverses :pascal by lowercasing the first letter', function () {
    expect(reverseModifier('QuerySelector', 'pascal')).toBe('querySelector');
    expect(reverseModifier('Fill', 'pascal')).toBe('fill');
  });

  it('reverses :blink_snake using the special-tokens list', function () {
    expect(reverseModifier('html_input_element', 'blink_snake', ['HTML'])).toBe(
      'HTMLInputElement'
    );
  });

  it('returns the value unchanged when no modifier is given', function () {
    expect(reverseModifier('Element', undefined)).toBe('Element');
  });

  it('throws on an unknown modifier', function () {
    expect(() => reverseModifier('foo', 'upper')).toThrow(
      'Unknown template modifier: upper'
    );
  });
});

// ---------------------------------------------------------------------------
// compilePatternToRegex
// ---------------------------------------------------------------------------

describe('compilePatternToRegex', function () {
  it('compiles a Mozilla-style operation pattern', function () {
    const { regex, vars } = compilePatternToRegex(
      'mozilla::dom::{Class}_Binding::{method}('
    );
    expect(vars).toEqual([
      { name: 'Class', modifier: undefined },
      { name: 'method', modifier: undefined },
    ]);
    const m = 'mozilla::dom::Element_Binding::querySelector(args)'.match(regex);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Element');
    expect(m![2]).toBe('querySelector');
  });

  it('compiles a Blink-style pattern with :blink_snake and :pascal', function () {
    const { regex, vars } = compilePatternToRegex(
      'blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation'
    );
    expect(vars).toEqual([
      { name: 'Class', modifier: 'blink_snake' },
      { name: 'method', modifier: 'pascal' },
    ]);
    const m =
      'blink::(anonymous namespace)::v8_html_image_element::SetSrcOperation'.match(
        regex
      );
    expect(m).not.toBeNull();
    expect(m![1]).toBe('html_image_element');
    expect(m![2]).toBe('SetSrc');
  });

  it('compiles a WebKit-style pattern', function () {
    const { regex } = compilePatternToRegex(
      'WebCore::js{Class}PrototypeFunction_{method}'
    );
    const m = 'WebCore::jsElementPrototypeFunction_querySelector(args)'.match(
      regex
    );
    expect(m).not.toBeNull();
    expect(m![1]).toBe('Element');
    expect(m![2]).toBe('querySelector');
  });

  it('refuses to match when the literal text does not appear', function () {
    const { regex } = compilePatternToRegex(
      'mozilla::dom::{Class}_Binding::{method}('
    );
    expect('mozilla::dom::Element_Other::foo('.match(regex)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// discoverAutoLabels / resolveAllLabels
// ---------------------------------------------------------------------------

const DOM_OPERATION_AUTO: AutoLabel = {
  label: '{Class}.{method}',
  patterns: [
    'mozilla::dom::{Class}_Binding::{method}(',
    "blink::`anonymous namespace'::v8_{Class:blink_snake}::{method:pascal}Operation",
    'blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation',
    'WebCore::js{Class}PrototypeFunction_{method}',
  ],
};

const DOM_SETTER_AUTO: AutoLabel = {
  label: 'set {Class}.{prop}',
  patterns: [
    'mozilla::dom::{Class}_Binding::set_{prop}(',
    "blink::`anonymous namespace'::v8_{Class:blink_snake}::{prop:pascal}AttributeSetCallback",
    'blink::(anonymous namespace)::v8_{Class:blink_snake}::{prop:pascal}AttributeSetCallback',
    'WebCore::setJS{Class}_{prop}(',
  ],
};

describe('discoverAutoLabels', function () {
  it('discovers a Mozilla-style operation', function () {
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION_AUTO],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::Element_Binding::querySelector(args)']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('Element.querySelector');
    expect(labels[0].funcPrefixes).toContain(
      'mozilla::dom::Element_Binding::querySelector('
    );
    expect(labels[0].funcPrefixes).toContain(
      'WebCore::jsElementPrototypeFunction_querySelector'
    );
    expect(labels[0].funcPrefixes).toContain(
      'blink::(anonymous namespace)::v8_element::QuerySelectorOperation'
    );
  });

  it('discovers a Blink-style operation, recovering Class via the special-tokens list', function () {
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION_AUTO],
        blinkSpecialTokens: ['HTML'],
      },
      ['blink::(anonymous namespace)::v8_html_image_element::ClickOperation']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('HTMLImageElement.click');
    // forward-expanded prefixes for all engines:
    expect(labels[0].funcPrefixes).toEqual([
      'mozilla::dom::HTMLImageElement_Binding::click(',
      "blink::`anonymous namespace'::v8_html_image_element::ClickOperation",
      'blink::(anonymous namespace)::v8_html_image_element::ClickOperation',
      'WebCore::jsHTMLImageElementPrototypeFunction_click',
    ]);
  });

  it('dedupes when the same (Class, method) is observed in multiple engine forms', function () {
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION_AUTO],
        blinkSpecialTokens: [],
      },
      [
        'mozilla::dom::Element_Binding::querySelector(args)',
        'WebCore::jsElementPrototypeFunction_querySelector(JSC::JSGlobalObject*)',
      ]
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('Element.querySelector');
  });

  it('discovers a setter using a separate auto_labels entry', function () {
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_SETTER_AUTO],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::Element_Binding::set_id(args)']
    );
    expect(labels).toHaveLength(1);
    expect(labels[0].name).toBe('set Element.id');
  });

  it('rejects matches whose round-trip does not agree with the observed name', function () {
    // funcName has Class part that is NOT a valid PascalCase identifier under
    // our regex (starts lowercase), so there should be no match.
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION_AUTO],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::element_Binding::querySelector(args)']
    );
    expect(labels).toHaveLength(0);
  });

  it('does not match a binding setter as a dom_operation method', function () {
    // `{method}` (camelCase, no modifier) must not swallow the `set_` of
    // `set_innerHTML`, otherwise dom_operation would synthesize a stray
    // "Element.set_innerHTML" label alongside dom_setter's "set Element.innerHTML".
    const labels = discoverAutoLabels(
      {
        labels: [],
        autoLabels: [DOM_OPERATION_AUTO, DOM_SETTER_AUTO],
        blinkSpecialTokens: [],
      },
      ['mozilla::dom::Element_Binding::set_innerHTML(args)']
    );
    expect(labels.map((l) => l.name)).toEqual(['set Element.innerHTML']);
  });
});

describe('resolveAllLabels', function () {
  it('merges an explicit `[[labels]]` block into the auto-discovered prefixes when names collide', function () {
    const parsed = parseLabelToml(`
[global]
blink_special_tokens = ["HTML"]

[[labels]]
name = "Element.querySelector"
funcPrefixes = ["extra::prefix"]

[[auto_labels]]
label = "{Class}.{method}"
patterns = [
  "mozilla::dom::{Class}_Binding::{method}(",
  "WebCore::js{Class}PrototypeFunction_{method}",
]
`);
    const labels = resolveAllLabels(parsed, [
      'mozilla::dom::Element_Binding::querySelector(args)',
      'mozilla::dom::Element_Binding::getAttribute(args)',
    ]);

    const byName = new Map(labels.map((l) => [l.name, l]));
    // querySelector: auto-discovered prefixes plus the extra one from [[labels]]
    expect(byName.get('Element.querySelector')!.funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::querySelector(',
      'WebCore::jsElementPrototypeFunction_querySelector',
      'extra::prefix',
    ]);
    // getAttribute: pure auto-discovered, no explicit override
    expect(byName.get('Element.getAttribute')!.funcPrefixes).toEqual([
      'mozilla::dom::Element_Binding::getAttribute(',
      'WebCore::jsElementPrototypeFunction_getAttribute',
    ]);
  });

  it('keeps an explicit-only label whose name does not collide with any auto-discovered one', function () {
    const parsed = parseLabelToml(`
[[labels]]
name = "GC"
funcPrefixes = ["js::gc::GCRuntime::collect("]
`);
    const labels = resolveAllLabels(parsed, []);
    expect(labels).toEqual([
      { name: 'GC', funcPrefixes: ['js::gc::GCRuntime::collect('] },
    ]);
  });
});

// ---------------------------------------------------------------------------
// End-to-end auto-discovery → insertStackLabels
// ---------------------------------------------------------------------------

describe('auto_labels end-to-end', function () {
  it('synthesizes a label from an observed Mozilla func and inserts it', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      mozilla::dom::Element_Binding::querySelector(args)
    `);

    const parsed = parseLabelToml(`
[[auto_labels]]
label = "{Class}.{method}"
patterns = [
  "mozilla::dom::{Class}_Binding::{method}(",
  "blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation",
]
`);

    const funcNames: string[] = [];
    for (let i = 0; i < profile.shared.funcTable.length; i++) {
      funcNames.push(
        profile.shared.stringArray[profile.shared.funcTable.name[i]]
      );
    }
    const labels = resolveAllLabels(parsed, funcNames);

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, labels)))
    ).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - Element.querySelector (total: 1, self: —)',
      '      - mozilla::dom::Element_Binding::querySelector(args) (total: 1, self: 1)',
    ]);
  });

  it('synthesizes a label for HTMLImageElement from a Blink-only profile using the special-tokens list', function () {
    const { profile } = getProfileFromTextSamples(`
      A
      blink::(anonymous namespace)::v8_html_image_element::ClickOperation
    `);

    const parsed = parseLabelToml(`
[global]
blink_special_tokens = ["HTML"]

[[auto_labels]]
label = "{Class}.{method}"
patterns = [
  "mozilla::dom::{Class}_Binding::{method}(",
  "blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation",
]
`);

    const funcNames: string[] = [];
    for (let i = 0; i < profile.shared.funcTable.length; i++) {
      funcNames.push(
        profile.shared.stringArray[profile.shared.funcTable.name[i]]
      );
    }
    const labels = resolveAllLabels(parsed, funcNames);

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, labels)))
    ).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - HTMLImageElement.click (total: 1, self: —)',
      '      - blink::(anonymous namespace)::v8_html_image_element::ClickOperation (total: 1, self: 1)',
    ]);
  });

  it('synthesizes a label for WebGL2RenderingContext using a mixed-case special token', function () {
    // Blink's NameStyleConverter snakes `WebGL2RenderingContext` to
    // `webgl2_rendering_context` (one token `WebGL2`), not
    // `web_gl_2_rendering_context`. With `WebGL2` in the special-tokens list
    // the recovery agrees with how Blink actually spells the binding name.
    const { profile } = getProfileFromTextSamples(`
      A
      blink::(anonymous namespace)::v8_webgl2_rendering_context::DrawArraysOperation
    `);

    const parsed = parseLabelToml(`
[global]
blink_special_tokens = ["WebGL2"]

[[auto_labels]]
label = "{Class}.{method}"
patterns = [
  "mozilla::dom::{Class}_Binding::{method}(",
  "blink::(anonymous namespace)::v8_{Class:blink_snake}::{method:pascal}Operation",
]
`);

    const funcNames: string[] = [];
    for (let i = 0; i < profile.shared.funcTable.length; i++) {
      funcNames.push(
        profile.shared.stringArray[profile.shared.funcTable.name[i]]
      );
    }
    const labels = resolveAllLabels(parsed, funcNames);

    expect(
      formatTree(callTreeFromProfile(insertStackLabels(profile, labels)))
    ).toEqual([
      '- Unaccounted (total: 1, self: —)',
      '  - A (total: 1, self: —)',
      '    - WebGL2RenderingContext.drawArrays (total: 1, self: —)',
      '      - blink::(anonymous namespace)::v8_webgl2_rendering_context::DrawArraysOperation (total: 1, self: 1)',
    ]);
  });
});
